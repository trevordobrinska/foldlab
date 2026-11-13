// The paper on screen: a three.js scene on a canvas. Shows one Fold at one
// progress, rendering only when asked (never a loop). The DOM side of the
// prototype; the paper itself comes from geometry.ts.

import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  WebGLRenderer,
} from "three";
import type { FoldType } from "./folds";
import { applyView, projectToFrame, type FramePoint } from "./frame";
import { model, VIEWS, type Face, type Segment, type V3 } from "./geometry";

const SIDE_A = 0xe9a65e; // the paper's coloured outside
const SIDE_B = 0xfbf7ee; // its white inside
const INK = 0x2b2540;

export class PaperView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera();
  private readonly paper = new Group();
  private width = 1;
  private height = 1;
  private type: FoldType = "squash";

  // One material per role, shared across rebuilds. Faces are drawn twice
  // from one geometry: the front (outside) coloured, the back white.
  private readonly front = new MeshLambertMaterial({ color: SIDE_A, side: FrontSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  private readonly back = new MeshLambertMaterial({ color: SIDE_B, side: BackSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  // The hidden part shows through as a faint shade, which also deepens a dent.
  private readonly xrayFace = new MeshBasicMaterial({ color: INK, side: DoubleSide, transparent: true, opacity: 0.1, depthTest: false, depthWrite: false });
  private readonly edge = new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.6 });
  private readonly crease = new LineDashedMaterial({ color: INK, transparent: true, opacity: 0.75, dashSize: 0.028, gapSize: 0.02 });
  private readonly xrayLine = new LineDashedMaterial({ color: INK, transparent: true, opacity: 0.55, dashSize: 0.01, gapSize: 0.016, depthTest: false, depthWrite: false });

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

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
    const floor = new Mesh(new PlaneGeometry(6, 6), new ShadowMaterial({ color: INK, opacity: 0.1, transparent: true }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.scene.add(this.paper);
  }

  /** Fits the canvas to its CSS size (in CSS pixels). */
  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    applyView(this.camera, VIEWS[this.type], this.width / this.height);
  }

  /** Shows a Fold at a progress and renders once. */
  show(type: FoldType, progress: number): void {
    if (type !== this.type) {
      this.type = type;
      applyView(this.camera, VIEWS[type], this.width / this.height);
    }
    this.rebuild(model(type, progress));
    this.renderer.render(this.scene, this.camera);
  }

  /** Where a world point lands in the frame, through the current camera. */
  project(point: V3): FramePoint {
    return projectToFrame(this.camera, point, this.width, this.height);
  }

  private rebuild({ faces, lines }: { faces: Face[]; lines: Segment[] }): void {
    this.clear();
    const solid = facesGeometry(faces.filter((f) => !f.xray));
    const frontMesh = new Mesh(solid, this.front);
    const backMesh = new Mesh(solid, this.back);
    frontMesh.castShadow = backMesh.castShadow = true;
    frontMesh.receiveShadow = backMesh.receiveShadow = true;
    this.paper.add(frontMesh, backMesh);

    const xray = faces.filter((f) => f.xray);
    if (xray.length) {
      const ghost = new Mesh(facesGeometry(xray), this.xrayFace);
      ghost.renderOrder = 2;
      this.paper.add(ghost);
    }
    for (const style of ["edge", "crease", "xray"] as const) {
      const segments = lines.filter((l) => l.style === style);
      if (!segments.length) continue;
      const geometry = linesGeometry(segments);
      const material = style === "edge" ? this.edge : style === "crease" ? this.crease : this.xrayLine;
      const line = new LineSegments(geometry, material);
      if (style !== "edge") line.computeLineDistances();
      line.renderOrder = style === "xray" ? 3 : 1;
      this.paper.add(line);
    }
  }

  private clear(): void {
    for (const child of [...this.paper.children]) {
      this.paper.remove(child);
      (child as Mesh | LineSegments).geometry.dispose();
    }
  }
}

/** Fan-triangulates flat polygons into one non-indexed geometry, so each
 *  triangle gets its own (flat) normal. */
function facesGeometry(faces: Face[]): BufferGeometry {
  const out: number[] = [];
  for (const { points } of faces) {
    for (let i = 1; i + 1 < points.length; i++) {
      for (const q of [points[0], points[i], points[i + 1]]) out.push(q.x, q.y, q.z);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(out), 3));
  geometry.computeVertexNormals();
  return geometry;
}

function linesGeometry(segments: Segment[]): BufferGeometry {
  const out: number[] = [];
  for (const { from, to } of segments) out.push(from.x, from.y, from.z, to.x, to.y, to.z);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(out), 3));
  return geometry;
}
