// The paper on screen: a three.js scene on a canvas, rendering only when
// asked (never a loop). Two-sided paper (the coloured side and the white
// side), its edges and creases inked, lit by a soft sky and one sun so
// standing layers read by shading, with a soft shadow on the page. The
// paper itself comes from shape.ts; the camera from camera.ts.

import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  FrontSide,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { applyView, type View } from "./frame";
import type { PaperShape } from "./shape";

const SIDE_A = 0xe9a65e; // the paper's coloured side
const SIDE_B = 0xfbf7ee; // its white side
const INK = 0x2b2540;

/** What the last render cost, for checking it stays smooth on the iPad. */
export interface RenderStats {
  /** Renders so far: on demand, so this only grows when something changed. */
  renders: number;
  /** The last render's CPU time, milliseconds (the GPU's work is not counted). */
  ms: number;
  drawCalls: number;
  triangles: number;
}

export class PaperView {
  readonly stats: RenderStats = { renders: 0, ms: 0, drawCalls: 0, triangles: 0 };
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera();
  private readonly paper = new Group();
  private width = 1;
  private height = 1;
  private view: View | undefined;
  private readonly turnAxis = new Vector3();

  // One material per role. Faces are drawn twice from one geometry: the
  // coloured side as the front, the white side as the back.
  private readonly front = new MeshLambertMaterial({ color: SIDE_A, side: FrontSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  private readonly back = new MeshLambertMaterial({ color: SIDE_B, side: BackSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  private readonly edge = new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.7 });
  private readonly mark = new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.25 });

  private faces: BufferGeometry | undefined;
  private lines: Record<"edges" | "creases" | "marks", LineSegments | undefined> = { edges: undefined, creases: undefined, marks: undefined };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.info.autoReset = false;

    // Soft daylight: a warm sky over the paper-coloured page, and one sun
    // from the front right so creases and standing layers read by shading.
    this.scene.add(new HemisphereLight(0xfff6e8, 0xd8ccb8, 2.0));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(1.9, 1.9, 1.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -1.4;
    sun.shadow.camera.right = sun.shadow.camera.top = 1.4;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 8;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.01;
    sun.shadow.radius = 4;
    this.scene.add(sun);

    // A calm contact shadow on the page: an invisible floor that only shows
    // what falls on it.
    const floor = new Mesh(new PlaneGeometry(6, 6), new ShadowMaterial({ color: INK, opacity: 0.16, transparent: true }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.scene.add(this.paper);
  }

  /** Fits the canvas to its CSS size (in CSS pixels). Render afterwards. */
  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    if (this.view) applyView(this.camera, this.view, this.width / this.height);
  }

  /** Colours the Paper's two sides (as #rrggbb): the side facing him when the Model starts, and the other. Render afterwards. */
  colours(front: string, back: string): void {
    this.front.color.set(front);
    this.back.color.set(back);
  }

  /** Holds the paper turned about a line through its centre and lifted (camera.ts, `turnedOver`). Render afterwards. */
  turn(axis: { x: number; y: number; z: number }, angle: number, lift: number): void {
    this.paper.quaternion.setFromAxisAngle(this.turnAxis.set(axis.x, axis.y, axis.z), angle);
    this.paper.position.y = lift;
  }

  /** Points the camera. Render afterwards. */
  look(view: View): void {
    this.view = view;
    applyView(this.camera, view, this.width / this.height);
  }

  /**
   * Takes the paper's shape. The shape's buffers are used as they are
   * (the geometry is allocated once per shape and updated in place when the
   * same buffers come back), so nothing is garbage per frame. Render afterwards.
   */
  show(shape: PaperShape): void {
    if (!this.faces || this.faces.getAttribute("position").array !== shape.triangles) this.rebuild(shape);
    const position = this.faces!.getAttribute("position") as BufferAttribute;
    position.needsUpdate = true;
    this.faces!.computeVertexNormals();
    this.faces!.computeBoundingSphere();
    for (const kind of ["edges", "creases", "marks"] as const) {
      const line = this.lines[kind];
      if (!line) continue;
      (line.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.visible = kind !== "creases" || shape.creasesShown;
    }
  }

  /** Draws one frame, now. */
  render(): void {
    const started = performance.now();
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    this.stats.renders++;
    this.stats.ms = performance.now() - started;
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
  }

  private rebuild(shape: PaperShape): void {
    this.clear();
    const faces = new BufferGeometry();
    faces.setAttribute("position", new BufferAttribute(shape.triangles, 3).setUsage(DynamicDrawUsage));
    const frontMesh = new Mesh(faces, this.front);
    const backMesh = new Mesh(faces, this.back);
    frontMesh.castShadow = backMesh.castShadow = true;
    frontMesh.receiveShadow = backMesh.receiveShadow = true;
    this.paper.add(frontMesh, backMesh);
    this.faces = faces;

    for (const kind of ["edges", "creases", "marks"] as const) {
      const buffer = shape[kind];
      if (!buffer.length) {
        this.lines[kind] = undefined;
        continue;
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(buffer, 3).setUsage(DynamicDrawUsage));
      const line = new LineSegments(geometry, kind === "marks" ? this.mark : this.edge);
      line.renderOrder = 1;
      this.paper.add(line);
      this.lines[kind] = line;
    }
  }

  private clear(): void {
    for (const child of [...this.paper.children]) {
      this.paper.remove(child);
      (child as Mesh | LineSegments).geometry.dispose();
    }
    this.faces = undefined;
    this.lines = { edges: undefined, creases: undefined, marks: undefined };
  }
}
