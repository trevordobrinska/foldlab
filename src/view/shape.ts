// A Step's paper as the view draws it, from its Recording: the mesh
// triangles laid out in the world at any progress, and its edges sorted
// into what to draw. The Recording was worked out once on the computer
// (src/motion/record.ts, from the engine's Papers); here it is only played
// back (src/motion/playback.ts), so this module carries no physics and no
// engine, and makes no garbage per frame: every buffer is allocated once
// and written in place.
//
// The recording's frame is the engine's folded frame; here it is placed on
// the table: x to the right as he sees it, y up off the table, z toward him,
// with the paper's centre (as it lies at the start) at the origin.

import { apply, determinant } from "../engine/geometry";
import { playbackOf } from "../motion/playback";
import type { Recording } from "../motion/recording";
import type { TablePoint } from "./pointer";

/** How high the middle of the stack sits above the table. */
const LIFT = 0.01;

export interface PaperShape {
  /** The paper's triangles: x y z for each of three corners, wound with the coloured side counter-clockwise. */
  triangles: Float32Array;
  /** The paper's outline and every crease already folded when the Step began: x y z, x y z per segment. */
  edges: Float32Array;
  /** The creases this Step makes, flat when it begins: drawn only once the paper has started to move. */
  creases: Float32Array;
  /** Creases lying open (made and unfolded earlier): a faint mark on the paper. */
  marks: Float32Array;
  /** Whether `creases` are to be drawn: the paper has left its starting shape. */
  creasesShown: boolean;
}

export interface SteppedPaper {
  /** Half the paper's extent on the table, over the whole Step, from the origin: x right, z toward him. */
  extent: TablePoint;
  /** The paper at `progress` (0..1). The same buffers are rewritten each call. */
  at(progress: number): PaperShape;
}

/** The middle of a Recording's paper as it lies at the start, as he sees it. */
export function centreOf(recording: Recording): { x: number; y: number } {
  const { view, vertexCount, positions } = recording;
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let i = 0; i < vertexCount; i++) {
    const [sx, sy] = apply(view, [positions[i * 3], positions[i * 3 + 1]]);
    box.minX = Math.min(box.minX, sx);
    box.maxX = Math.max(box.maxX, sx);
    box.minY = Math.min(box.minY, sy);
    box.maxY = Math.max(box.maxY, sy);
  }
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

/**
 * A Recording's paper for the view. `centre` is the point (as he sees the
 * Paper) placed at the world's origin: by default the middle of this
 * Recording's paper at its start; a Model gives every Fold the same one, so
 * the paper stays where it is from one Fold to the next.
 */
export function steppedPaper(recording: Recording, centre = centreOf(recording)): SteppedPaper {
  const play = playbackOf(recording);
  const { view, edges, triangles, vertexCount, frameCount } = recording;
  const facing = Math.sign(determinant(view)) || 1;
  const stride = vertexCount * 3;

  /** A recording-frame point as he sees it, on the table. */
  const seen = (x: number, y: number): [number, number] => apply(view, [x, y]);
  const first = play.frame(0);

  // How far the paper reaches from that centre at any moment of the Step.
  const extent = { x: 0, z: 0 };
  for (let k = 0; k < frameCount; k++) {
    const frame = play.frame(k);
    for (let i = 0; i < vertexCount; i++) {
      const [sx, sy] = seen(frame[i * 3], frame[i * 3 + 1]);
      extent.x = Math.max(extent.x, Math.abs(sx - centre.x));
      extent.z = Math.max(extent.z, Math.abs(sy - centre.y));
    }
  }

  /** Vertex `v` of `positions` placed in the world, written to `out` at `o`. */
  const place = (positions: Float32Array | number[], v: number, out: Float32Array, o: number) => {
    const [sx, sy] = seen(positions[v * 3], positions[v * 3 + 1]);
    out[o] = sx - centre.x;
    out[o + 1] = facing * positions[v * 3 + 2] + LIFT;
    out[o + 2] = -(sy - centre.y);
  };

  // Sort the edges: an edge is bent at the start when the two triangles that
  // share it face different ways there; a crease that is flat at the start is
  // this Step's own, and shows only once the paper moves.
  const normals = flatNormals(first, triangles);
  const sideOf = new Map<string, number>();
  for (let t = 0; t < triangles.length; t += 3) {
    for (let i = 0; i < 3; i++) sideOf.set(`${triangles[t + i]} ${triangles[t + ((i + 1) % 3)]}`, t / 3);
  }
  const bentAtStart = (u: number, v: number): boolean => {
    const a = sideOf.get(`${u} ${v}`);
    const b = sideOf.get(`${v} ${u}`);
    if (a === undefined || b === undefined) return true;
    const dot = normals[a * 3] * normals[b * 3] + normals[a * 3 + 1] * normals[b * 3 + 1] + normals[a * 3 + 2] * normals[b * 3 + 2];
    return dot < 0.5;
  };
  const segments: Record<"edges" | "creases" | "marks", [number, number][]> = { edges: [], creases: [], marks: [] };
  for (const edge of edges) {
    for (let i = 1; i < edge.chain.length; i++) {
      const u = edge.chain[i - 1];
      const v = edge.chain[i];
      const kind = edge.assignment === "B" ? "edges" : edge.assignment === "F" ? "marks" : bentAtStart(u, v) ? "edges" : "creases";
      segments[kind].push([u, v]);
    }
  }

  const positions = new Float32Array(stride);
  const shape: PaperShape = {
    triangles: new Float32Array(triangles.length * 3),
    edges: new Float32Array(segments.edges.length * 6),
    creases: new Float32Array(segments.creases.length * 6),
    marks: new Float32Array(segments.marks.length * 6),
    creasesShown: false,
  };
  const lines = (kind: keyof typeof segments) => {
    const out = shape[kind];
    segments[kind].forEach(([u, v], s) => {
      place(positions, u, out, s * 6);
      place(positions, v, out, s * 6 + 3);
    });
  };

  return {
    extent,
    at(progress) {
      play.at(progress, positions);
      for (let t = 0; t < triangles.length; t++) place(positions, triangles[t], shape.triangles, t * 3);
      lines("edges");
      lines("creases");
      lines("marks");
      shape.creasesShown = progress > 0;
      return shape;
    },
  };
}

/** One unit normal per triangle, x y z each. */
function flatNormals(positions: ArrayLike<number>, triangles: number[]): Float32Array {
  const out = new Float32Array(triangles.length);
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t] * 3, triangles[t + 1] * 3, triangles[t + 2] * 3];
    const ab = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const ac = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    out[t] = n[0] / len;
    out[t + 1] = n[1] / len;
    out[t + 2] = n[2] / len;
  }
  return out;
}
