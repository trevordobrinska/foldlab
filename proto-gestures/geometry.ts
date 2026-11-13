// Canned 3D paper for the three prototype Folds. Pure and DOM-free:
// `model(type, progress)` returns the paper's faces and lines at a given
// progress, `anchor(type, progress)` the point the finger holds, and
// `VIEWS` the fixed camera for each Fold. Vertices are computed from
// progress by rotating about hinge lines, so the paper stays rigid where
// real paper would. World units: the paper is about one unit across, lying
// on y = 0 with y up; the camera looks from +z and above.

import type { FoldType } from "./folds";
import type { View } from "./frame";

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

function outline(points: V3[], style: Segment["style"] = "edge"): Segment[] {
  return points.map((from, i) => ({ from, to: points[(i + 1) % points.length], style }));
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
      return squash(p);
    case "insideReverse":
      return insideReverse(p);
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
      return squashAnchor(p);
    case "insideReverse":
      return insideReverseAnchor(p);
    case "sink":
      return sinkApex(p);
  }
}

export const VIEWS: Record<FoldType, View> = {
  // From the front right and above, so the standing flap is seen as a
  // triangle rather than edge-on, and the base reads as lying flat.
  squash: { position: v(0.9, 1.35, 1.65), target: v(0, 0.16, 0.05), fov: 32 },
  // Side-on to the point, a little above, so the tip's swing through the
  // layers and the head it makes below the edge are both in view.
  insideReverse: { position: v(1.25, 0.85, 1.6), target: v(-0.3, 0.42, 0), fov: 38 },
  // Looking down into the closed point, so the dent reads as it forms.
  sink: { position: v(0.85, 1.3, 1.6), target: v(0, 0.34, 0), fov: 34 },
};

// ---------------------------------------------------------------------------
// Squash: a flat base with a two-layer flap standing up on its centre line.
// Each layer is a triangle hinged to the base along the centre line; pressing
// the top down opens the layers apart, like a book standing on its spine,
// until they lie flat as a kite showing the paper's inside.

const SQ = {
  base: [v(0, 0, -0.56), v(0.52, 0, 0.06), v(0, 0, 0.6), v(-0.52, 0, 0.06)],
  hinge0: v(0, LAYER, -0.14),
  hinge1: v(0, LAYER, 0.42),
  /** Height of the standing flap, and the z of its apex on the hinge line. */
  height: 0.42,
  apexZ: 0.03,
  /** The two layers stand slightly parted, so they read as two. */
  part: 0.006,
};

function squashLayer(p: number, side: 1 | -1): V3[] {
  const theta = (p * Math.PI) / 2;
  // The layer's outside normal, rotated with it: +x at the start, -y flat.
  const out = v(side * Math.cos(theta), -Math.sin(theta), 0);
  const offset = add(scale(out, SQ.part * (1 - p) * 0.5), v(0, LAYER * (1 - p), 0));
  const apex = v(side * SQ.height * Math.sin(theta), LAYER + SQ.height * Math.cos(theta), SQ.apexZ);
  return [SQ.hinge0, apex, SQ.hinge1].map((q) => add(q, offset));
}

function squash(p: number): FoldModel {
  const right = squashLayer(p, 1);
  const left = squashLayer(p, -1);
  const theta = (p * Math.PI) / 2;
  return {
    faces: [
      face(SQ.base, v(0, 1, 0)),
      face(right, v(Math.cos(theta), -Math.sin(theta), 0)),
      face(left, v(-Math.cos(theta), -Math.sin(theta), 0)),
    ],
    lines: [
      ...outline(SQ.base),
      seg(SQ.base[0], SQ.base[2]),
      seg(right[0], right[2]), // the hinge: the kite's centre crease once flat
      seg(right[0], right[1]),
      seg(right[1], right[2]),
      seg(left[0], left[1]),
      seg(left[1], left[2]),
    ],
  };
}

function squashAnchor(p: number): V3 {
  const theta = (p * Math.PI) / 2;
  return v(0, LAYER + SQ.height * Math.cos(theta), SQ.apexZ);
}

// ---------------------------------------------------------------------------
// Inside reverse: a two-layer point like a crane's neck, rising from a flat
// body. The layers are joined along the top (spine) edge and parted a little
// below it, so the point is a hollow V. A pre-crease runs across both layers.
// Pushing the tip swings the part beyond the crease about it, through the
// opened layers, until it lies reversed between them: the tip comes out
// across the raw edge as a head pointing down.

const IR = (() => {
  const angle = (50 * Math.PI) / 180;
  const d = v(Math.cos(angle), Math.sin(angle), 0); // along the point, to the tip
  const n = v(-Math.sin(angle), Math.cos(angle), 0); // across it, spine-wards
  const half = 0.145; // half the width at the base end
  const len = 0.72;
  const origin = v(-0.55, 0.22, 0); // the spine's base end, in the world
  // Strip coordinates: u along the spine from its base, w down from it.
  const spineBase = { u: 0, w: 0 };
  const rawBase = { u: 0, w: -2 * half };
  const tip = { u: len, w: 0 };
  // The pre-crease is oblique, as a crane's head crease is: it leans well
  // toward the tip at the raw edge, so the reversed tip (its mirror image
  // across the crease) comes out across the raw edge as a head pointing
  // down, and the tip's path from start to end is straight down.
  const ks = { u: 0.36, w: 0 }; // crease on the spine
  const kru = 0.443; // crease on the raw edge, at this u
  const kr = { u: kru, w: -2 * half * (1 - kru / len) };
  const body: FlatPoint[] = [spineBase, rawBase, kr, ks];
  const tipPart: FlatPoint[] = [ks, tip, kr];
  // The flat body the point rises from.
  const flat = [v(-0.95, 0, -0.1), v(-0.95, 0, 0.42), v(-0.3, 0, 0.42), v(-0.3, 0, -0.1)];
  // How far the layers are parted at rest, and how much further they open
  // while the tip passes between them.
  const part = 0.2;
  const open = 0.42;
  return { d, n, origin, len, part, open, body, tipPart, ks, kr, tip, flat };
})();

interface FlatPoint {
  u: number;
  w: number;
}

/** A strip point placed in the world on a layer tilted `tilt` radians about
 *  the spine; positive tilt swings the lower edge toward +z (the camera). */
function irPlace(q: FlatPoint, tilt: number): V3 {
  const down = scale(IR.n, q.w * Math.cos(tilt));
  const out = v(0, 0, -q.w * Math.sin(tilt));
  return add(add(add(IR.origin, scale(IR.d, q.u)), down), out);
}

/** How far the body's layers are parted at `p`: they open while the tip
 *  passes between them, then close again. */
const irBodyTilt = (p: number) => IR.part + IR.open * Math.sin(Math.PI * p);

/** Rotates a tip-part point about the crease by the fold angle at `p`:
 *  from its place on a layer tilted `tilt` to its reversed place in the
 *  middle plane. The tip swings toward the camera and down. */
function irTipPlace(q: FlatPoint, p: number, side: 1 | -1): V3 {
  const tilt = (irBodyTilt(p) * (1 - p) + 0.012 * p) * side;
  const start = irPlace(q, tilt);
  const ks = irPlace(IR.ks, 0);
  const kr = irPlace(IR.kr, 0);
  const axis = unit(sub(kr, ks));
  // Pick the sense that swings the tip toward +z.
  const sense = cross(axis, sub(irPlace(IR.tip, 0), ks)).z > 0 ? 1 : -1;
  return rotateAbout(start, ks, axis, sense * Math.PI * p);
}

function insideReverse(p: number): FoldModel {
  const tilt = irBodyTilt(p);
  const bodyA = IR.body.map((q) => irPlace(q, tilt));
  const bodyB = IR.body.map((q) => irPlace(q, -tilt));
  const tipA = IR.tipPart.map((q) => irTipPlace(q, p, 1));
  const tipB = IR.tipPart.map((q) => irTipPlace(q, p, -1));
  // Outside of layer A faces +z (and up along the tilt); B the other way.
  const outA = v(Math.sin(tilt) * IR.n.x, Math.sin(tilt) * IR.n.y, Math.cos(tilt));
  const outB = v(-outA.x, -outA.y, -outA.z);
  const outTipA = normalOf(tipA);
  const outTipB = normalOf(tipB);
  // The tip's coloured side is continuous with its layer's at the crease.
  const tipAOut = dot(outTipA, outA) >= 0 ? outTipA : scale(outTipA, -1);
  const tipBOut = dot(outTipB, outB) >= 0 ? outTipB : scale(outTipB, -1);
  const creaseStyle: Segment["style"] = p < 0.97 ? "crease" : "edge";
  const strip = (body: V3[], tip: V3[]): Segment[] => [
    seg(body[0], body[1]), // base end
    seg(body[1], body[2]), // raw edge, body
    seg(body[0], body[3]), // spine, body
    seg(body[3], body[2], creaseStyle), // the pre-crease
    seg(tip[0], tip[1]), // spine, tip part
    seg(tip[1], tip[2]), // raw edge, tip part
  ];
  return {
    faces: [
      face(IR.flat, v(0, 1, 0)),
      face(bodyB, outB),
      face(tipB, tipBOut),
      face(tipA, tipAOut),
      face(bodyA, outA),
    ],
    lines: [...outline(IR.flat), ...strip(bodyB, tipB), ...strip(bodyA, tipA)],
  };
}

function insideReverseAnchor(p: number): V3 {
  const a = irTipPlace(IR.tip, p, 1);
  const b = irTipPlace(IR.tip, p, -1);
  return lerp(a, b, 0.5);
}

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
