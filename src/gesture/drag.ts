// Drag-to-land: one finger (or the Pencil) on the paper picks up the nearest
// corner or edge point, the paper folds under it as he drags, and letting
// go is matched against the Step's Fold. A match snaps to the exact Fold; a
// miss springs back.
//
// The page carries no engine and no physics, so everything here is worked
// out from the Fold's Recording as the view draws it (src/view/shape.ts):
// the point he holds is followed through the Recording, the paper is shown
// at the progress that puts that point nearest his finger, and the Fold he
// made matches when he lands the point where the Recording lands it. That
// one test covers the right flap (the point has to move in this Fold at
// all), the right direction and the line (a point landed near its place was
// folded along nearly the Step's line), for valley and mountain alike.
//
// Pure: no DOM. The page (main.ts) feeds it pointer events and draws.

import type { V3 } from "../view/frame";
import type { Pixel, Pointer, TablePoint } from "../view/pointer";
import type { PaperShape } from "../view/shape";
import { pick, type Pick } from "./pick";

/** A Fold still to make, as its Recording's paper (a SteppedPaper). */
export interface FoldingPaper {
  at(progress: number): PaperShape;
}

/** The point he has hold of, on one Fold of the Step. */
export interface Hold {
  /** Which of the Folds offered. */
  fold: number;
  pick: Pick;
  /** Where the point is through the Fold: PATH_SAMPLES + 1 points in the world, evenly spaced in progress from 0 to 1. */
  path: V3[];
}

export const PATH_SAMPLES = 96;

/** A landing counts when it is within this share of the point's own journey from where the Fold lands it... */
export const LANDING_SHARE = 0.3;
/** ...and never further off than this, in paper units (the paper is about one unit across). */
export const LANDING_REACH = 0.15;
/** A point that travels less than this in a Fold is not on its flap. */
const STILL = 0.02;
/** A finger that moves less than this (CSS pixels) only touched the paper. */
export const TOUCH_SLOP = 10;

const onTable = (a: TablePoint, b: TablePoint) => Math.hypot(a.x - b.x, a.z - b.z);

/** How far the held point ends from where it began, seen from above. */
export function travel(hold: Hold): number {
  return onTable(hold.path[0], hold.path[hold.path.length - 1]);
}

/**
 * Picks the paper up at a touch on the table. `folds` are the Folds still
 * to make in the Step, all lying as the paper lies now; the one he has hold
 * of is the one that carries the touched point furthest (so with symmetric
 * Folds, reaching for a flap chooses its Fold). Undefined on the background.
 * Leaves each paper's buffers at an arbitrary progress: show it again after.
 */
export function holdOf(folds: FoldingPaper[], touch: TablePoint): Hold | undefined {
  let best: Hold | undefined;
  let bestTravel = -1;
  folds.forEach((paper, fold) => {
    for (const picked of pick(paper.at(0), touch)) {
      const path: V3[] = [];
      for (let i = 0; i <= PATH_SAMPLES; i++) {
        const e = paper.at(i / PATH_SAMPLES).edges;
        const o = picked.segment * 6;
        path.push({
          x: e[o] + (e[o + 3] - e[o]) * picked.t,
          y: e[o + 1] + (e[o + 4] - e[o + 1]) * picked.t,
          z: e[o + 2] + (e[o + 5] - e[o + 2]) * picked.t,
        });
      }
      const hold: Hold = { fold, pick: picked, path };
      // Strictly further: of equals, the first Fold and the top layer keep it.
      if (travel(hold) > bestTravel + 1e-6) {
        best = hold;
        bestTravel = travel(hold);
      }
    }
  });
  return best;
}

/**
 * The progress (0..1) that puts the held point nearest the finger: `path`
 * is the point's path on screen, evenly spaced in progress.
 */
export function progressUnder(path: Pixel[], finger: Pixel): number {
  const spans = path.length - 1;
  if (spans < 1) return 0;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < spans; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const squared = dx * dx + dy * dy;
    const t = squared > 0 ? Math.min(1, Math.max(0, ((finger.x - a.x) * dx + (finger.y - a.y) * dy) / squared)) : 0;
    const d = Math.hypot(a.x + dx * t - finger.x, a.y + dy * t - finger.y);
    if (d < bestDistance - 1e-9) {
      bestDistance = d;
      best = (i + t) / spans;
    }
  }
  return best;
}

/**
 * Whether landing the held point at `landing` makes the Step's Fold: the
 * point is on the flap, and it was put down near enough to where the Fold
 * lands it. Forgiving in proportion: within LANDING_SHARE of the point's
 * journey (about 17° of the fold line's direction, or 15% of the journey
 * in the line's position), and never more than LANDING_REACH.
 */
export function lands(hold: Hold, landing: TablePoint): boolean {
  const journey = travel(hold);
  if (journey < STILL) return false;
  const off = onTable(landing, hold.path[hold.path.length - 1]);
  return off <= Math.min(LANDING_REACH, LANDING_SHARE * journey);
}

/** What the page does for the gesture. */
export interface FoldGestureHost {
  /** The Folds still to make in this Step, each lying as the paper lies now. Empty when there is nothing to fold. */
  folds(): FoldingPaper[];
  /** The camera as it is now, on the canvas. */
  pointer(): Pointer;
  /** Draw Fold `fold` at `progress`. */
  show(fold: number, progress: number): void;
  /** Move the paper calmly from `from` to `to` (1 is the exact Fold, 0 is springing back), then call `done`. */
  settle(fold: number, from: number, to: number, done: () => void): void;
  /** He made Fold `fold` and it has finished folding. */
  folded?(fold: number): void;
  /** He made a Fold that is not the Step's, and the paper has sprung back. */
  missed?(): void;
}

/**
 * One finger's fold, from touch to settled. Feed it canvas pixels (from the
 * canvas's top left): `down` picks the paper up if the finger is on it
 * (`busy` then says so; otherwise the touch is the background's), then
 * `move` and `up`; `cancel` lets the paper go without a miss (a second
 * finger arrived, or the touch was taken away).
 */
export class FoldGesture {
  private hold: Hold | undefined;
  private settling = false;
  private progress = 0;
  /** The finger's first pixel, and its offset from the point it picked up, kept so the paper doesn't jump to the finger. */
  private first: Pixel = { x: 0, y: 0 };
  private offset: Pixel = { x: 0, y: 0 };
  private moved = false;

  constructor(private readonly host: FoldGestureHost) {}

  /** True while a finger has the paper or the paper is still settling. */
  get busy(): boolean {
    return this.hold !== undefined || this.settling;
  }

  down(px: number, py: number): void {
    if (this.busy) return;
    const pointer = this.host.pointer();
    const touch = pointer.table(px, py);
    if (!touch) return;
    const hold = holdOf(this.host.folds(), touch);
    if (!hold) return;
    this.hold = hold;
    this.progress = 0;
    this.moved = false;
    this.first = { x: px, y: py };
    const held = pointer.screen(hold.path[0]);
    this.offset = { x: px - held.x, y: py - held.y };
    // Picking up sampled the Recording through the paper's buffers: put it back as it lies.
    this.host.show(hold.fold, 0);
  }

  move(px: number, py: number): void {
    const hold = this.hold;
    if (!hold) return;
    if (Math.hypot(px - this.first.x, py - this.first.y) > TOUCH_SLOP) this.moved = true;
    const pointer = this.host.pointer();
    const point = { x: px - this.offset.x, y: py - this.offset.y };
    this.progress = travel(hold) < STILL ? 0 : progressUnder(hold.path.map((p) => pointer.screen(p)), point);
    this.host.show(hold.fold, this.progress);
  }

  up(px: number, py: number): void {
    const hold = this.hold;
    if (!hold) return;
    this.move(px, py);
    this.hold = undefined;
    if (!this.moved) return this.rest(hold.fold, 0);
    const landing = this.host.pointer().table(px - this.offset.x, py - this.offset.y);
    if (landing && lands(hold, landing)) {
      this.rest(hold.fold, 1, () => this.host.folded?.(hold.fold));
    } else {
      this.rest(hold.fold, 0, () => this.host.missed?.());
    }
  }

  cancel(): void {
    const hold = this.hold;
    if (!hold) return;
    this.hold = undefined;
    this.rest(hold.fold, 0);
  }

  /** Settles the paper at 0 or 1, then tells the page. */
  private rest(fold: number, to: 0 | 1, then?: () => void): void {
    const from = this.progress;
    this.progress = 0;
    if (from === to) {
      then?.();
      return;
    }
    this.settling = true;
    this.host.settle(fold, from, to, () => {
      this.settling = false;
      then?.();
    });
  }
}
