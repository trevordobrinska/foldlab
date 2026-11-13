// Notation worked out from real Recordings: the cup's first Step (the page's
// fixture), and Folds recorded here from the engine for what the fixture
// can't show (a mountain Fold, a Fold of two layers). Expected values are
// the Fold as the engine was asked for it, in paper coordinates (x right, y
// up, the square from 0 to 1), placed on the table by hand.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fold, newPaper, type Paper, type Point } from "../engine/paper";
import { record } from "../motion/record";
import type { Recording } from "../motion/recording";
import { steppedPaper } from "../view/shape";
import { arrowOnScreen, notationOf, withoutRepeats, type FoldNotation } from "./notation";

const here = dirname(fileURLToPath(import.meta.url));
const cup1 = JSON.parse(readFileSync(resolve(here, "../recordings/cup-1.json"), "utf8")) as Recording;

const through = (a: Point, b: Point) => ({ origin: a, vector: [b[0] - a[0], b[1] - a[1]] as Point });
function folded(paper: Paper, a: Point, b: Point, flap: Point, assignment: "V" | "M", layers?: number | "all"): Paper {
  const result = fold(paper, { line: through(a, b), flap, assignment, layers });
  if (!result.ok) throw new Error(result.refusal);
  return result.paper;
}

/** A point of the paper (x right, y up, 0..1) on the table (x right, z toward him, from the centre). */
const table = (x: number, y: number) => ({ x: x - 0.5, z: -(y - 0.5) });

/** The line's two ends, in either order, as table points. */
function expectLine(line: FoldNotation["lines"][number], a: [number, number], b: [number, number]) {
  const ends = [table(...a), table(...b)].sort((p, q) => p.x - q.x || p.z - q.z);
  const got = [line[0], line[1]].sort((p, q) => p.x - q.x || p.z - q.z);
  for (const i of [0, 1]) {
    expect(got[i].x).toBeCloseTo(ends[i].x, 4);
    expect(got[i].z).toBeCloseTo(ends[i].z, 4);
  }
}

describe("the Notation of a Fold, from its Recording", () => {
  it("the cup's first Step: one valley line along the diagonal, and an arrow from the top-right corner to the bottom-left", () => {
    const notation = notationOf(steppedPaper(cup1))!;
    expect(notation.kind).toBe("valley");
    expect(notation.lines).toHaveLength(1);
    expectLine(notation.lines[0], [0, 1], [1, 0]);
    expect(notation.arrow.from.x).toBeCloseTo(0.5, 4);
    expect(notation.arrow.from.z).toBeCloseTo(-0.5, 4);
    expect(notation.arrow.to.x).toBeCloseTo(-0.5, 4);
    expect(notation.arrow.to.z).toBeCloseTo(0.5, 4);
  });

  it("a mountain Fold is a mountain line: the flap goes underneath", () => {
    const before = newPaper();
    const after = folded(before, [0.5, 0], [0.5, 1], [0.9, 0.5], "M");
    const notation = notationOf(steppedPaper(record(before, after)))!;
    expect(notation.kind).toBe("mountain");
    expect(notation.lines).toHaveLength(1);
    expectLine(notation.lines[0], [0.5, 0], [0.5, 1]);
    // The right edge lands on the left edge.
    expect(notation.arrow.from.x).toBeCloseTo(0.5, 4);
    expect(notation.arrow.to.x).toBeCloseTo(-0.5, 4);
    expect(notation.arrow.to.z).toBeCloseTo(notation.arrow.from.z, 4);
  });

  it("a Fold through two layers lying on each other is drawn as one line, on top of the paper", () => {
    // The right half folded onto the left, then the top-left corner of both layers folded down.
    const halved = folded(newPaper(), [0.5, 0], [0.5, 1], [0.9, 0.5], "V");
    const after = folded(halved, [0, 0.5], [0.5, 1], [0.1, 0.9], "V", "all");
    const paper = steppedPaper(record(halved, after));
    const notation = notationOf(paper)!;
    expect(notation.kind).toBe("valley");
    expect(notation.lines).toHaveLength(1);
    const top = Math.max(...Array.from(paper.at(0).triangles).filter((_, i) => i % 3 === 1));
    expect(notation.lines[0][0].y).toBeCloseTo(top, 4);
    expect(Math.hypot(notation.lines[0][1].x - notation.lines[0][0].x, notation.lines[0][1].z - notation.lines[0][0].z)).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it("describes the paper as it lies before the Fold, wherever its buffers were left", () => {
    const paper = steppedPaper(cup1);
    paper.at(0.7);
    expectLine(notationOf(paper)!.lines[0], [0, 1], [1, 0]);
  });
});

describe("a Step of several Folds", () => {
  const line = (x: number): FoldNotation["lines"][number] => [
    { x, y: 0.01, z: -0.5 },
    { x, y: 0.01, z: 0.5 },
  ];
  const arrow = { from: { x: 0.5, y: 0.01, z: 0 }, to: { x: -0.5, y: 0.01, z: 0 } };

  it("a line two Folds share (a flap folded in front, another behind) is drawn once, as the first Fold's; both keep their arrows", () => {
    const front: FoldNotation = { kind: "valley", lines: [line(0)], arrow };
    const behind: FoldNotation = { kind: "mountain", lines: [[line(0)[1], line(0)[0]]], arrow };
    const [a, b] = withoutRepeats([front, behind]);
    expect(a).toEqual(front);
    expect(b.lines).toEqual([]);
    expect(b.kind).toBe("mountain");
    expect(b.arrow).toEqual(arrow);
  });

  it("Folds along different lines each keep their own", () => {
    const left: FoldNotation = { kind: "valley", lines: [line(-0.25)], arrow };
    const right: FoldNotation = { kind: "valley", lines: [line(0.25)], arrow };
    expect(withoutRepeats([left, right])).toEqual([left, right]);
  });

  it("an arrow that shares its ends with a valley arrow bows the other way when it is a mountain arrow, so both can be seen", () => {
    const valley = arrowOnScreen({ x: 100, y: 100 }, { x: 500, y: 100 }, "valley")!;
    const mountain = arrowOnScreen({ x: 100, y: 100 }, { x: 500, y: 100 }, "mountain")!;
    expect(Math.sign(valley.curve[1].y - 100)).toBe(-Math.sign(mountain.curve[1].y - 100));
  });
});

describe("the fold arrow on screen", () => {
  const from = { x: 100, y: 100 };
  const to = { x: 500, y: 100 };
  type P = { x: number; y: number };
  /** Which side of the shaft's last stretch (bend to tip) a point is on: 1, -1, or 0 on it. */
  const sideOf = (bend: P, tip: P) => (p: P) => {
    const cross = (tip.x - bend.x) * (p.y - bend.y) - (tip.y - bend.y) * (p.x - bend.x);
    return Math.abs(cross) < 1e-6 ? 0 : Math.sign(cross);
  };

  it("curves from near the point to near where it lands, its head pointing at the landing", () => {
    const arrow = arrowOnScreen(from, to, "valley")!;
    const [start, bend, tip] = arrow.curve;
    expect(start.x).toBeGreaterThan(100);
    expect(start.x).toBeLessThan(160);
    expect(start.y).toBeCloseTo(100, 6);
    expect(tip.x).toBeLessThan(500);
    expect(tip.x).toBeGreaterThan(440);
    expect(tip.y).toBeCloseTo(100, 6);
    // Bowed to one side of the straight line.
    expect(Math.abs(bend.y - 100)).toBeGreaterThan(40);
    expect(arrow.head[0]).toEqual(tip);
  });

  it("a valley arrow has a filled head with a barb each side of the shaft", () => {
    const arrow = arrowOnScreen(from, to, "valley")!;
    expect(arrow.hollow).toBe(false);
    const sides = arrow.head.slice(1).map(sideOf(arrow.curve[1], arrow.curve[2]));
    expect(sides).toContain(1);
    expect(sides).toContain(-1);
  });

  it("a mountain arrow has a hollow head with its barb on one side only", () => {
    const arrow = arrowOnScreen(from, to, "mountain")!;
    expect(arrow.hollow).toBe(true);
    const sides = new Set(arrow.head.slice(1).map(sideOf(arrow.curve[1], arrow.curve[2])));
    sides.delete(0);
    expect(sides.size).toBe(1);
  });

  it("is nothing for a point that lands where it began", () => {
    expect(arrowOnScreen(from, from, "valley")).toBeUndefined();
  });
});
