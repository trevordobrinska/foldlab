// Drawing for the three prototype Folds: pseudo-3D paper as flat SVG shapes.
// DOM-free: `scene(type, progress)` returns a list of shapes for the page to
// draw. The geometry is canned (no engine) and derived from the same push
// specs the recognizer reads, so the arrow, the grab zone and the moving
// point always agree.

import { FOLDS, type FoldType } from "./folds";

export interface Pt {
  x: number;
  y: number;
}

export type Shape =
  | { kind: "polygon"; points: Pt[]; cls: string }
  | { kind: "line"; from: Pt; to: Pt; cls: string }
  | { kind: "ellipse"; c: Pt; rx: number; ry: number; cls: string }
  | { kind: "circle"; c: Pt; r: number; cls: string };

const lerp = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const unit = (v: Pt): Pt => {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
};
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

const polygon = (points: Pt[], cls: string): Shape => ({ kind: "polygon", points, cls });
const line = (from: Pt, to: Pt, cls: string): Shape => ({ kind: "line", from, to, cls });

/** The paper at `progress` (0 untouched, 1 folded). */
export function scene(type: FoldType, progress: number): Shape[] {
  const p = Math.min(1, Math.max(0, progress));
  switch (type) {
    case "squash":
      return squash(p);
    case "insideReverse":
      return insideReverse(p);
    case "sink":
      return sink(p);
  }
}

/** The target that pulses after a miss: the hollow push arrow (Notation)
 *  and a ring on the point to touch. */
export function target(type: FoldType): Shape[] {
  const { grab, axis } = FOLDS[type].push;
  const a = unit(axis);
  const n = { x: -a.y, y: a.x };
  const head = add(grab, a, -(grab.radius - 4));
  const at = (along: number, side: number): Pt => add(add(head, a, along), n, side);
  // A hollow arrow, 16 long, its tip just short of the point to push.
  const arrow = [at(-16, -2.5), at(-7, -2.5), at(-7, -6), at(0, 0), at(-7, 6), at(-7, 2.5), at(-16, 2.5)];
  return [
    { kind: "circle", c: grab, r: grab.radius, cls: "ring" },
    polygon(arrow, "arrow"),
  ];
}

// ---------------------------------------------------------------------------
// Squash: a flap standing up from the centre line of a flat base. Pressing
// its top down opens the two layers symmetrically until it lies flat as a
// kite.

function squash(p: number): Shape[] {
  const { grab, axis, travel } = FOLDS.squash.push;
  const T = { x: 50, y: 40 };
  const R = { x: 86, y: 66 };
  const B = { x: 50, y: 92 };
  const L = { x: 14, y: 66 };
  const hinge = { x: 50, y: 66 };
  const apexUp = { x: grab.x, y: grab.y - 4 };
  const apexFlat = add(apexUp, axis, travel);
  const apex = lerp(apexUp, apexFlat, p);
  const left = lerp({ x: 46, y: 62 }, { x: 30, y: 60 }, p);
  const right = lerp({ x: 54, y: 62 }, { x: 70, y: 60 }, p);
  return [
    polygon([T, R, B, L], "side-a-dark"),
    line(T, B, "edge"),
    { kind: "ellipse", c: { x: 50, y: 67 }, rx: 2 + 12 * (1 - p), ry: 1 + 3 * (1 - p), cls: "shadow" },
    polygon([apex, hinge, left], "side-a-light"),
    polygon([apex, hinge, right], "side-a"),
    line(apex, hinge, "edge"),
  ];
}

// ---------------------------------------------------------------------------
// Inside reverse: a two-layer point (like a crane's neck) with a pre-crease
// across it. Pushing the tip in between the layers reflects the tip across
// the crease; past halfway it is drawn between the layers.

function insideReverse(p: number): Shape[] {
  const { grab, axis } = FOLDS.insideReverse.push;
  const tip: Pt = grab;
  const d = unit({ x: 1, y: -1 }); // along the strip, towards the tip
  const n = { x: -d.y, y: d.x }; // across the strip
  const half = 7;
  const base = add(tip, d, -80);
  const a = unit(axis); // the push, which is also the crease's normal
  const creaseDir = { x: -a.y, y: a.x };
  const mid = add(tip, d, -24);
  // The crease runs from the -n edge (k1) to the +n edge (k2).
  const reach = half / dot(creaseDir, n);
  const k1 = add(mid, creaseDir, -reach);
  const k2 = add(mid, creaseDir, reach);
  const depth = dot(add(tip, mid, -1), a);
  const tipReversed = add(tip, a, -2 * depth);
  const tipNow = lerp(tip, tipReversed, p);
  const offset = { x: 2.2, y: 2.2 };
  const body = [add(base, n, -half), k1, k2, add(base, n, half)];
  const farBody = body.map((q) => add(q, offset));
  const tipShape = polygon([k1, tipNow, k2], "side-a");
  const between = p >= 0.5;
  return [
    polygon([{ x: 6, y: 56 }, { x: 44, y: 94 }, { x: 6, y: 94 }], "side-a-dark"),
    polygon(farBody, "side-a-dark"),
    ...(between ? [tipShape] : []),
    polygon(body, "side-a"),
    ...(between ? [] : [tipShape]),
    line(k1, k2, between ? "edge" : "crease"),
  ];
}

// ---------------------------------------------------------------------------
// Sink: the closed point of a waterbomb-like base. Pushing the point down
// flattens it to the pre-crease (first half) and then inverts it inside the
// model, where it shows through as an x-ray line (second half).

function sink(p: number): Shape[] {
  const { grab } = FOLDS.sink.push;
  const apex: Pt = { x: grab.x, y: grab.y - 2 };
  const BL = { x: 12, y: 82 };
  const BR = { x: 88, y: 82 };
  const BM = { x: 50, y: 82 };
  const creaseY = 44;
  const kAt = (from: Pt, to: Pt): Pt => lerp(from, to, (creaseY - from.y) / (to.y - from.y));
  const k1 = kAt(apex, BL);
  const k2 = kAt(apex, BR);
  const flatten = Math.min(1, p * 2);
  const invert = Math.max(0, p * 2 - 1);
  const tipNow = lerp(apex, { x: apex.x, y: creaseY }, flatten);
  const inner = { x: apex.x, y: creaseY + (creaseY - apex.y) * invert };
  return [
    polygon([add(k1, { x: -2, y: 2 }), add(BL, { x: -2, y: 2 }), add(BR, { x: 2, y: 2 }), add(k2, { x: 2, y: 2 })], "side-a-dark"),
    polygon([k1, BL, BM], "side-a-light"),
    polygon([k2, BR, BM], "side-a"),
    line(BM, { x: 50, y: creaseY }, "edge"),
    polygon([k1, tipNow, k2], "side-a-light"),
    line(k1, tipNow, "edge"),
    line(tipNow, k2, "edge"),
    ...(invert > 0 ? [line(k1, inner, "xray"), line(inner, k2, "xray")] : []),
    line(k1, k2, flatten < 1 ? "crease" : "edge"),
  ];
}
