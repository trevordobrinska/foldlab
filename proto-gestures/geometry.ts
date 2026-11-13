// 3D paper for the three prototype Folds. Pure and DOM-free:
// `model(type, progress)` returns the paper's faces and lines at a given
// progress, `anchor(type, progress)` the point the finger holds, and
// `VIEWS` the fixed camera for each Fold. The sink is canned: vertices are
// computed from progress by rotating about hinge lines. The squash and the
// inside reverse are real paper from the engine and the physics, recorded
// once and played back (scene.ts; tickets 10 and 11). World units: the paper
// is about one unit across, lying on y = 0 with y up; the camera looks from
// +z and above.

import type { FoldType } from "./folds";
import type { View } from "./frame";
import { insideReverseFold, squashFold } from "./scene";

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** A flat polygon of paper, wound so its coloured (outside) face is the
 *  front (counter-clockwise) side. `xray` faces are drawn faintly through
 *  everything, for a part hidden inside the model. */
export interface Face {
  points: V3[];
  xray?: boolean;
}

export interface Segment {
  from: V3;
  to: V3;
  /** A paper edge (solid), a valley pre-crease (dashed) or an x-ray line
   *  for an edge hidden inside the model (dotted). */
  style: "edge" | "crease" | "xray";
}

export interface FoldModel {
  faces: Face[];
  lines: Segment[];
}

// --- Vectors ---------------------------------------------------------------

export const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
export const add = (a: V3, b: V3, k = 1): V3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
export const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: V3, k: number): V3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const length = (a: V3) => Math.hypot(a.x, a.y, a.z);
export const unit = (a: V3): V3 => scale(a, 1 / (length(a) || 1));
export const lerp = (a: V3, b: V3, k: number): V3 => add(a, sub(b, a), k);

/** Rotates `p` about the line through `origin` along the unit vector `axis`
 *  by `angle` radians (right-hand rule). Rodrigues' formula. */
export function rotateAbout(p: V3, origin: V3, axis: V3, angle: number): V3 {
  const r = sub(p, origin);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const term1 = scale(r, c);
  const term2 = scale(cross(axis, r), s);
  const term3 = scale(axis, dot(axis, r) * (1 - c));
  return add(origin, add(add(term1, term2), term3));
}

/** The polygon's normal by its winding (Newell's method). */
export function normalOf(points: V3[]): V3 {
  const n = v(0, 0, 0);
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return unit(n);
}

/** A face wound so its coloured side faces along `outside`. */
function face(points: V3[], outside: V3, xray = false): Face {
  const wound = dot(normalOf(points), outside) < 0 ? [...points].reverse() : points;
  return xray ? { points: wound, xray } : { points: wound };
}

const seg = (from: V3, to: V3, style: Segment["style"] = "edge"): Segment => ({ from, to, style });

/** Two paper layers lying together are parted by this much so neither
 *  z-fights the other (and the base). */
export const LAYER = 0.004;

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
      return sink(p);
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
      return sinkApex(p);
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
  // Looking down into the closed point, so the dent reads as it forms.
  sink: { position: v(0.85, 1.3, 1.6), target: v(0, 0.34, 0), fov: 34 },
};

// ---------------------------------------------------------------------------
// Closed sink: the closed point of a waterbomb-like base, opened out a little
// so it stands as a shallow pyramid. A pre-crease runs round it. Pushing the
// point flattens it down to the pre-crease, then inverts it inside the
// model, where it is drawn x-ray.

const SK = (() => {
  const height = 0.62;
  const crease = 0.34;
  const apex0 = v(0, height, 0);
  const corners = [v(0.6, 0, 0), v(0, 0, 0.24), v(-0.6, 0, 0), v(0, 0, -0.24)];
  const ring = corners.map((c) => lerp(c, apex0, crease / height));
  return { height, crease, apex0, corners, ring };
})();

function sinkApex(p: number): V3 {
  return v(0, SK.height - 2 * (SK.height - SK.crease) * p, 0);
}

function sink(p: number): FoldModel {
  const apex = sinkApex(p);
  const inverted = p > 0.5;
  const faces: Face[] = [];
  const lines: Segment[] = [];
  const outwardOf = (a: V3, b: V3) => {
    const mid = lerp(a, b, 0.5);
    return unit(v(mid.x, 0, mid.z));
  };
  for (let i = 0; i < 4; i++) {
    const c0 = SK.corners[i];
    const c1 = SK.corners[(i + 1) % 4];
    const r0 = SK.ring[i];
    const r1 = SK.ring[(i + 1) % 4];
    const outward = outwardOf(c0, c1);
    faces.push(face([c0, c1, r1, r0], outward));
    // Wind the top face as it stands, then move its apex; once inverted its
    // coloured side faces into the model and the white inside shows.
    const standing = face([r0, r1, SK.apex0], outward);
    const top = standing.points.map((q) => (q === SK.apex0 ? apex : q));
    faces.push({ points: top });
    if (inverted) faces.push({ points: top, xray: true });
    lines.push(seg(c0, c1), seg(c0, r0), seg(r0, r1, p < 0.5 ? "crease" : "edge"), seg(r0, apex, "edge"));
    if (inverted) lines.push(seg(r0, apex, "xray"));
  }
  return { faces, lines };
}
