// The target Notation drawn over the paper: a hollow push arrow and a ring
// on the point to touch, in frame units (0..100). Pure: shapes in, the page
// draws them as SVG over the canvas.

import type { PushSpec } from "./recognize";

export interface Pt {
  x: number;
  y: number;
}

export type Shape =
  | { kind: "polygon"; points: Pt[]; cls: string }
  | { kind: "circle"; c: Pt; r: number; cls: string };

const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/** The target that pulses after a miss. */
export function target(spec: PushSpec): Shape[] {
  const { grab, axis } = spec;
  const len = Math.hypot(axis.x, axis.y) || 1;
  const a = { x: axis.x / len, y: axis.y / len };
  const n = { x: -a.y, y: a.x };
  const head = add(grab, a, -(grab.radius - 4));
  const at = (along: number, side: number): Pt => add(add(head, a, along), n, side);
  // A hollow arrow, 16 long, its tip just short of the point to push.
  const arrow = [at(-16, -2.5), at(-7, -2.5), at(-7, -6), at(0, 0), at(-7, 6), at(-7, 2.5), at(-16, 2.5)];
  return [
    { kind: "circle", c: grab, r: grab.radius, cls: "ring" },
    { kind: "polygon", points: arrow, cls: "arrow" },
  ];
}
