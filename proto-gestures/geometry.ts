// 3D paper for the three prototype Folds. Pure and DOM-free:
// `model(type, progress)` returns the paper's faces and lines at a given
// progress, `anchor(type, progress)` the point the finger holds, and
// `VIEWS` the fixed camera for each Fold. All three are real paper from the
// engine and the physics, recorded once and played back (scene.ts; tickets
// 10, 11 and 12); nothing is canned any more. World units: the paper is about
// one unit across, lying on y = 0 with y up; the camera looks from +z and above.

import type { FoldType } from "./folds";
import type { View } from "./frame";
import { closedSinkFold, insideReverseFold, squashFold } from "./scene";

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** A flat polygon of paper, wound so its coloured (outside) face is the
 *  front (counter-clockwise) side. */
export interface Face {
  points: V3[];
}

export interface Segment {
  from: V3;
  to: V3;
  /** A paper edge (solid) or a crease being made (dashed). */
  style: "edge" | "crease";
}

export interface FoldModel {
  faces: Face[];
  lines: Segment[];
}

// --- Vectors ---------------------------------------------------------------

export const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
export const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const length = (a: V3) => Math.hypot(a.x, a.y, a.z);

/** The polygon's unit normal by its winding (Newell's method). */
export function normalOf(points: V3[]): V3 {
  const n = v(0, 0, 0);
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  const len = length(n) || 1;
  return v(n.x / len, n.y / len, n.z / len);
}

const clamp01 = (p: number) => Math.min(1, Math.max(0, p));

// --- Public entry points ---------------------------------------------------

export function model(type: FoldType, progress: number): FoldModel {
  const p = clamp01(progress);
  switch (type) {
    case "squash":
      return squashFold.model(p);
    case "insideReverse":
      return insideReverseFold.model(p);
    case "sink":
      return closedSinkFold.model(p);
  }
}

/** The point the finger holds: where the Fold's moving point is at
 *  `progress`. Its path from 0 to 1 is the real hand motion. */
export function anchor(type: FoldType, progress: number): V3 {
  const p = clamp01(progress);
  switch (type) {
    case "squash":
      return squashFold.anchor(p);
    case "insideReverse":
      return insideReverseFold.anchor(p);
    case "sink":
      return closedSinkFold.anchor(p);
  }
}

export const VIEWS: Record<FoldType, View> = {
  // From the front right and above: the flap stands on its hinge line, which
  // runs toward him, so it is seen as a triangle rather than edge-on, its tip
  // comes straight down the screen, and the base reads as lying flat.
  squash: { position: v(0.4, 0.95, 1.95), target: v(-0.22, 0.25, 0), fov: 34 },
  // From beyond where the tip lands, and above, so its travel in between the
  // layers comes down the screen and the head it makes across the edge is in view.
  insideReverse: { position: v(0.35, 1.45, 1.95), target: v(0.3, 0, 0), fov: 38 },
  // From well above and a little to the right, looking down at the closed point
  // at the top of the base, so its push along the table toward him comes
  // straight down the screen rather than foreshortened.
  sink: { position: v(0.2, 1.75, 1.35), target: v(0, 0, 0.05), fov: 32 },
};
