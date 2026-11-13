// Notation: the standard Yoshizawa–Randlett symbols for a Fold, as in his
// books. A valley line is dashed, a mountain line dash-dot-dot; an arrow
// runs from a point of the flap to where the Fold lands it, with a filled
// head for a valley Fold and a hollow one-sided head for a mountain Fold.
//
// The page carries no engine, so the Notation is read off the Fold's
// Recording as the view draws it (src/view/shape.ts): the fold line is the
// crease the Fold makes, where it lies before the paper moves; the arrow
// follows the point of the paper the Fold carries furthest; and the Fold is
// a valley as he sees it when that point comes up off the paper on its way,
// a mountain when it goes underneath.
//
// Pure: no DOM. overlay.ts draws it over the canvas.

import type { V3 } from "../view/frame";
import type { Pixel } from "../view/pointer";
import type { PaperShape } from "../view/shape";

export type LineKind = "valley" | "mountain";

/** A Fold still to make, as its Recording's paper (a SteppedPaper). */
export interface NotatedPaper {
  at(progress: number): PaperShape;
}

/** One Fold's Notation, in the world (x right, y up off the table, z toward him), on the paper as it lies before the Fold. */
export interface FoldNotation {
  kind: LineKind;
  /** The fold line: usually one, end to end across the layers it folds. */
  lines: [V3, V3][];
  /** From a point of the flap to where the Fold lands it. */
  arrow: { from: V3; to: V3 };
}

/** A point that travels less than this (paper units) is not moved by the Fold. */
const STILL = 0.02;
const SAME = 1e-4;

/**
 * The Notation of a Fold, or undefined when the Fold moves nothing.
 * Leaves the paper's buffers at an arbitrary progress: show it again after.
 */
export function notationOf(paper: NotatedPaper): FoldNotation | undefined {
  const start = paper.at(0);
  const lines = joined(start.creases);
  const before = Float32Array.from(start.triangles);
  let top = -Infinity;
  for (let o = 1; o < before.length; o += 3) top = Math.max(top, before[o]);
  const after = Float32Array.from(paper.at(1).triangles);

  // The corner the Fold carries furthest across the table; of equals, the highest.
  let far = -1;
  let farthest = STILL;
  for (let o = 0; o + 2 < before.length; o += 3) {
    const d = Math.hypot(after[o] - before[o], after[o + 2] - before[o + 2]);
    const further = d > farthest + SAME;
    const higher = far >= 0 && Math.abs(d - farthest) <= SAME && before[o + 1] > before[far + 1] + 1e-6;
    if (further || higher) {
      far = o;
      farthest = d;
    }
  }
  if (far < 0) return undefined;

  const half = paper.at(0.5).triangles;
  const kind: LineKind = half[far + 1] >= before[far + 1] ? "valley" : "mountain";
  return {
    kind,
    lines: lines.map(([a, b]) => [
      { x: a.x, y: top, z: a.z },
      { x: b.x, y: top, z: b.z },
    ]),
    arrow: {
      from: { x: before[far], y: top, z: before[far + 2] },
      to: { x: after[far], y: top, z: after[far + 2] },
    },
  };
}

interface Flat {
  x: number;
  z: number;
}

/**
 * Segments (x y z, x y z each) seen from above, with those that lie along
 * one line and touch or overlap joined end to end: a crease through several
 * layers, or cut into pieces by the mesh, is one line in the Notation.
 */
function joined(segments: ArrayLike<number>): [Flat, Flat][] {
  const groups: { origin: Flat; along: Flat; spans: [number, number][] }[] = [];
  for (let o = 0; o + 5 < segments.length; o += 6) {
    const a = { x: segments[o], z: segments[o + 2] };
    const b = { x: segments[o + 3], z: segments[o + 5] };
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < SAME) continue;
    let group = groups.find(
      ({ origin, along }) =>
        Math.abs(along.x * (b.z - a.z) - along.z * (b.x - a.x)) < SAME * length &&
        Math.abs(along.x * (a.z - origin.z) - along.z * (a.x - origin.x)) < SAME,
    );
    if (!group) groups.push((group = { origin: a, along: { x: (b.x - a.x) / length, z: (b.z - a.z) / length }, spans: [] }));
    const { origin, along } = group;
    const s = (a.x - origin.x) * along.x + (a.z - origin.z) * along.z;
    const t = (b.x - origin.x) * along.x + (b.z - origin.z) * along.z;
    group.spans.push([Math.min(s, t), Math.max(s, t)]);
  }
  const lines: [Flat, Flat][] = [];
  for (const { origin, along, spans } of groups) {
    spans.sort((p, q) => p[0] - q[0]);
    let [from, to] = spans[0];
    const close = () =>
      lines.push([
        { x: origin.x + along.x * from, z: origin.z + along.z * from },
        { x: origin.x + along.x * to, z: origin.z + along.z * to },
      ]);
    for (const [s, t] of spans.slice(1)) {
      if (s <= to + SAME) {
        to = Math.max(to, t);
      } else {
        close();
        [from, to] = [s, t];
      }
    }
    close();
  }
  return lines;
}

/** A fold arrow as drawn: a curve of three points (start, bend, tip: a quadratic Bézier) and its head, tip first. */
export interface ScreenArrow {
  curve: [Pixel, Pixel, Pixel];
  head: Pixel[];
  /** A mountain arrow's head is drawn in outline; a valley arrow's is filled. */
  hollow: boolean;
}

/** How far in from each end the arrow starts and stops, as a share of its length. */
const INSET = 0.07;
/** How far the arrow's bend stands off the straight line, as a share of its length. */
const BOW = 0.2;
/** The head's length and half width in pixels, for an arrow long enough to carry it. */
const HEAD = { length: 22, half: 9 };

/**
 * The arrow from the pixel of a point of the flap to the pixel where the
 * Fold lands it. Undefined when the two are (nearly) the same pixel.
 */
export function arrowOnScreen(from: Pixel, to: Pixel, kind: LineKind): ScreenArrow | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 8) return undefined;
  const start = { x: from.x + dx * INSET, y: from.y + dy * INSET };
  const tip = { x: to.x - dx * INSET, y: to.y - dy * INSET };
  // Bowed to the left of its travel, as it is drawn on screen.
  const bend = { x: from.x + dx / 2 + dy * BOW, y: from.y + dy / 2 - dx * BOW };

  // The head lies along the curve's direction where it ends.
  const tx = tip.x - bend.x;
  const ty = tip.y - bend.y;
  const t = Math.hypot(tx, ty) || 1;
  const ux = tx / t;
  const uy = ty / t;
  const size = Math.min(1, length / 120);
  const back = { x: tip.x - ux * HEAD.length * size, y: tip.y - uy * HEAD.length * size };
  const barb = (side: 1 | -1) => ({ x: back.x - uy * HEAD.half * size * side, y: back.y + ux * HEAD.half * size * side });
  const head = kind === "valley" ? [tip, barb(1), barb(-1)] : [tip, barb(-1), back];
  return { curve: [start, bend, tip], head, hollow: kind === "mountain" };
}
