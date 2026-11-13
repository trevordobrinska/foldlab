// Drag-to-land on real Recordings: the cup's first Step (the page's
// fixture), and Folds recorded here from the engine for what the fixture
// can't show (a mountain Fold, two symmetric Folds in one Step). The finger
// is a pixel on an 800 px square canvas over a camera fitted to the paper.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fold, newPaper, type Paper, type Point } from "../engine/paper";
import { record } from "../motion/record";
import type { Recording } from "../motion/recording";
import { fitting, TILTED, viewOf, type Orbit } from "../view/camera";
import { pointerOf, type Pixel, type Pointer } from "../view/pointer";
import { steppedPaper, type SteppedPaper } from "../view/shape";
import { FoldGesture, holdOf, lands, progressUnder, type FoldGestureHost } from "./drag";

const here = dirname(fileURLToPath(import.meta.url));
const cup1 = JSON.parse(readFileSync(resolve(here, "../recordings/cup-1.json"), "utf8")) as Recording;

const SIZE = 800;
const { orbit: flat } = fitting({ x: 0.5, z: 0.5 });

/** A valley or mountain Fold of the flat square, recorded: the flap at `flap` folded along the line through `a` and `b`. */
function recorded(a: Point, b: Point, flap: Point, assignment: "V" | "M"): SteppedPaper {
  const before: Paper = newPaper();
  const result = fold(before, { line: { origin: a, vector: [b[0] - a[0], b[1] - a[1]] }, flap, assignment });
  if (!result.ok) throw new Error(result.refusal);
  return steppedPaper(record(before, result.paper));
}

/** A page with no screen: what the gesture showed and how it settled, and a finger that speaks in paper coordinates (x right, y up, the square from 0 to 1). */
function page(folds: SteppedPaper[], orbit: Orbit = flat) {
  const pointer: Pointer = pointerOf(viewOf(orbit), SIZE, SIZE);
  const log = { shown: [] as { fold: number; progress: number }[], settled: [] as { fold: number; from: number; to: number }[], folded: [] as number[], missed: 0 };
  let remaining = folds;
  const host: FoldGestureHost = {
    folds: () => remaining,
    pointer: () => pointer,
    show: (fold, progress) => log.shown.push({ fold, progress }),
    settle: (fold, from, to, done) => {
      log.settled.push({ fold, from, to });
      done();
    },
    folded: (fold) => {
      log.folded.push(fold);
      remaining = [];
    },
    missed: () => log.missed++,
  };
  const gesture = new FoldGesture(host);
  /** The pixel over a point of the flat paper. */
  const over = (x: number, y: number): Pixel => pointer.screen({ x: x - 0.5, y: 0, z: -(y - 0.5) });
  const drag = (from: [number, number], to: [number, number], steps = 20) => {
    const a = over(...from);
    const b = over(...to);
    const held = gesture.down(a.x, a.y);
    for (let i = 1; i <= steps; i++) gesture.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
    gesture.up(b.x, b.y);
    return held;
  };
  const last = () => log.shown[log.shown.length - 1];
  return { gesture, pointer, log, over, drag, last };
}

describe("following the finger: the Recording's progress under it", () => {
  const path = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 200 },
    { x: 300, y: 300 },
  ];

  it("is 0 at the start of the point's path, 1 at its end, and in proportion between", () => {
    expect(progressUnder(path, { x: 100, y: 100 })).toBeCloseTo(0, 9);
    expect(progressUnder(path, { x: 300, y: 300 })).toBeCloseTo(1, 9);
    expect(progressUnder(path, { x: 250, y: 100 })).toBeCloseTo(1.5 / 4, 9);
    expect(progressUnder(path, { x: 300, y: 150 })).toBeCloseTo(2.5 / 4, 9);
  });

  it("is the nearest point of the path when the finger strays from it", () => {
    expect(progressUnder(path, { x: 150, y: 60 })).toBeCloseTo(0.5 / 4, 9);
    expect(progressUnder(path, { x: 340, y: 250 })).toBeCloseTo(3.5 / 4, 9);
  });

  it("stops at the ends when the finger goes past them", () => {
    expect(progressUnder(path, { x: 20, y: 100 })).toBe(0);
    expect(progressUnder(path, { x: 300, y: 500 })).toBe(1);
  });
});

describe("picking the paper up", () => {
  it("holds the corner he touched, with the path it takes through the Fold", () => {
    const hold = holdOf([steppedPaper(cup1)], { x: 0.45, z: -0.46 })!;
    expect(hold.fold).toBe(0);
    expect(hold.pick.corner).toBe(true);
    const first = hold.path[0];
    const end = hold.path[hold.path.length - 1];
    // The top-right corner (0.5, -0.5 on the table) lands on the bottom-left.
    expect(first.x).toBeCloseTo(0.5, 4);
    expect(first.z).toBeCloseTo(-0.5, 4);
    expect(end.x).toBeCloseTo(-0.5, 2);
    expect(end.z).toBeCloseTo(0.5, 2);
    // Halfway it stands above the fold line.
    const middle = hold.path[Math.round((hold.path.length - 1) / 2)];
    expect(middle.y).toBeGreaterThan(0.6);
  });

  it("holds nothing on the background", () => {
    expect(holdOf([steppedPaper(cup1)], { x: 0.9, z: 0.9 })).toBeUndefined();
  });
});

describe("letting go: does the Fold he made match the Step's", () => {
  const hold = holdOf([steppedPaper(cup1)], { x: 0.5, z: -0.5 })!;

  it("matches when the corner lands where the Step's Fold lands it, or near enough", () => {
    expect(lands(hold, { x: -0.5, z: 0.5 })).toBe(true);
    expect(lands(hold, { x: -0.42, z: 0.44 })).toBe(true);
  });

  it("misses when the line he folded is well off the Step's", () => {
    // Landing the corner on the bottom-right folds along a horizontal line, not the diagonal.
    expect(lands(hold, { x: 0.5, z: 0.5 })).toBe(false);
    // Half way: the right direction, but a parallel line far from the Step's.
    expect(lands(hold, { x: 0, z: 0 })).toBe(false);
    expect(lands(hold, { x: -0.3, z: 0.45 })).toBe(false);
  });

  it("misses the wrong way and the wrong flap", () => {
    expect(lands(hold, { x: 0.9, z: -0.9 })).toBe(false);
    // The bottom-left corner stays on the table in this Fold: not the flap.
    const still = holdOf([steppedPaper(cup1)], { x: -0.5, z: 0.5 })!;
    expect(lands(still, { x: 0.5, z: -0.5 })).toBe(false);
    expect(lands(still, { x: -0.5, z: 0.5 })).toBe(false);
  });

  it("is as forgiving in proportion for a short Fold as for a long one", () => {
    // A corner folded 0.2 along the diagonal: a tenth of the paper off is a different Fold.
    const small = holdOf([recorded([1, 0.8], [0.8, 1], [0.95, 0.95], "V")], { x: 0.5, z: -0.5 })!;
    expect(lands(small, { x: 0.3, z: -0.3 })).toBe(true);
    expect(lands(small, { x: 0.27, z: -0.31 })).toBe(true);
    expect(lands(small, { x: 0.2, z: -0.2 })).toBe(false);
  });
});

describe("one finger folds the paper: drag a point to where it lands", () => {
  it("shows the paper folding under his finger", () => {
    const { gesture, over, last, pointer } = page([steppedPaper(cup1)]);
    const paper = steppedPaper(cup1);
    const start = over(1, 1);
    expect(gesture.down(start.x, start.y)).toBe(true);
    for (const along of [0.25, 0.5, 0.75]) {
      const finger = over(1 - along, 1 - along);
      gesture.move(finger.x, finger.y);
      // The corner as drawn is under the finger: the top-right corner is the end of the first outline segments that meet there.
      const hold = holdOf([paper], { x: 0.5, z: -0.5 })!;
      const drawn = pointer.screen(hold.path[Math.round(last().progress * (hold.path.length - 1))]);
      expect(Math.hypot(drawn.x - finger.x, drawn.y - finger.y)).toBeLessThan(8);
    }
    const centre = over(0.5, 0.5);
    gesture.move(centre.x, centre.y);
    expect(last().progress).toBeGreaterThan(0.4);
    expect(last().progress).toBeLessThan(0.6);
  });

  it("snaps to the exact Fold when he lands the corner roughly where it goes", () => {
    const { drag, log } = page([steppedPaper(cup1)]);
    expect(drag([0.96, 0.95], [0.02, 0.05])).toBe(true);
    expect(log.settled).toHaveLength(1);
    expect(log.settled[0].to).toBe(1);
    expect(log.settled[0].from).toBeGreaterThan(0.6);
    expect(log.folded).toEqual([0]);
    expect(log.missed).toBe(0);
  });

  it("keeps the corner where he took hold of it: touching beside it and dragging the same way lands the same", () => {
    const { drag, log } = page([steppedPaper(cup1)]);
    drag([0.93, 0.92], [-0.07, -0.08]);
    expect(log.folded).toEqual([0]);
  });

  it("springs back calmly when the Fold he made is not the Step's", () => {
    const { drag, log } = page([steppedPaper(cup1)]);
    drag([1, 1], [0.6, 0.1]);
    expect(log.settled).toHaveLength(1);
    expect(log.settled[0].to).toBe(0);
    expect(log.settled[0].from).toBeGreaterThan(0);
    expect(log.folded).toEqual([]);
    expect(log.missed).toBe(1);
  });

  it("springs back when he lets go half way", () => {
    const { drag, log } = page([steppedPaper(cup1)]);
    drag([1, 1], [0.5, 0.5]);
    expect(log.settled[0].to).toBe(0);
    expect(log.missed).toBe(1);
  });

  it("does not move the wrong flap: the paper stays and it is a miss", () => {
    const { drag, log } = page([steppedPaper(cup1)]);
    expect(drag([0, 0], [1, 1])).toBe(true);
    expect(log.shown.every(({ progress }) => progress === 0)).toBe(true);
    expect(log.folded).toEqual([]);
    expect(log.missed).toBe(1);
  });

  it("a touch that never moves is not a Fold and not a miss", () => {
    const { gesture, over, log } = page([steppedPaper(cup1)]);
    const p = over(1, 1);
    gesture.down(p.x, p.y);
    gesture.move(p.x + 2, p.y + 1);
    gesture.up(p.x + 2, p.y + 1);
    expect(log.folded).toEqual([]);
    expect(log.missed).toBe(0);
  });

  it("leaves a touch on the background to the view", () => {
    const { gesture, over, log } = page([steppedPaper(cup1)]);
    const p = over(1.3, 1.3);
    expect(gesture.down(p.x, p.y)).toBe(false);
    gesture.move(p.x - 300, p.y + 300);
    gesture.up(p.x - 300, p.y + 300);
    expect(log.shown).toEqual([]);
    expect(log.missed).toBe(0);
  });

  it("lets the paper go without a miss when a second finger arrives", () => {
    const { gesture, over, log } = page([steppedPaper(cup1)]);
    const a = over(1, 1);
    const b = over(0.6, 0.6);
    gesture.down(a.x, a.y);
    gesture.move(b.x, b.y);
    gesture.cancel();
    expect(log.settled).toHaveLength(1);
    expect(log.settled[0].to).toBe(0);
    expect(log.missed).toBe(0);
    // The finger still down no longer folds.
    gesture.move(a.x, a.y);
    gesture.up(a.x, a.y);
    expect(log.settled).toHaveLength(1);
    expect(log.missed).toBe(0);
  });

  it("cannot be picked up again until it has settled, or when there is nothing to fold", () => {
    const paper = steppedPaper(cup1);
    const pointer = pointerOf(viewOf(flat), SIZE, SIZE);
    let finish: (() => void) | undefined;
    let remaining = [paper];
    const gesture = new FoldGesture({
      folds: () => remaining,
      pointer: () => pointer,
      show: () => {},
      settle: (_fold, _from, _to, done) => (finish = done),
      folded: () => (remaining = []),
    });
    const corner = pointer.screen({ x: 0.5, y: 0, z: -0.5 });
    const landing = pointer.screen({ x: -0.5, y: 0, z: 0.5 });
    gesture.down(corner.x, corner.y);
    gesture.move(landing.x, landing.y);
    gesture.up(landing.x, landing.y);
    expect(gesture.down(corner.x, corner.y)).toBe(false);
    finish!();
    // Folded: no Fold is left in this Step.
    expect(gesture.down(corner.x, corner.y)).toBe(false);
  });

  it("works the same with the view tilted and turned", () => {
    const { drag, log } = page([steppedPaper(cup1)], { ...flat, elevation: TILTED, azimuth: 0.5 });
    drag([0.97, 0.97], [0.04, 0.03]);
    expect(log.folded).toEqual([0]);
  });

  it("folds a mountain Fold by the same drag", () => {
    const { drag, log } = page([recorded([0, 1], [1, 0], [0.9, 0.9], "M")]);
    drag([1, 1], [0.03, 0.02]);
    expect(log.folded).toEqual([0]);
  });
});

describe("symmetric Folds in a Step, in any order", () => {
  // Two opposite corners folded to the centre.
  const bottomLeft = () => recorded([0.5, 0], [0, 0.5], [0.1, 0.1], "V");
  const topRight = () => recorded([1, 0.5], [0.5, 1], [0.9, 0.9], "V");

  it("makes whichever Fold he reaches for", () => {
    const first = page([bottomLeft(), topRight()]);
    first.drag([1, 1], [0.52, 0.5]);
    expect(first.log.folded).toEqual([1]);

    const other = page([bottomLeft(), topRight()]);
    other.drag([0, 0], [0.5, 0.48]);
    expect(other.log.folded).toEqual([0]);
  });

  it("shows only the Fold he has hold of", () => {
    const { drag, log } = page([bottomLeft(), topRight()]);
    drag([1, 1], [0.5, 0.5]);
    expect(log.shown.length).toBeGreaterThan(0);
    expect(log.shown.every(({ fold }) => fold === 1)).toBe(true);
  });

  it("is a miss when a corner is dragged to where the other one lands it wrongly", () => {
    const { drag, log } = page([bottomLeft(), topRight()]);
    drag([1, 1], [0, 0]);
    expect(log.folded).toEqual([]);
    expect(log.missed).toBe(1);
  });
});
