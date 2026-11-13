// The inside reverse as a Recording, played back: ticket 10's acceptance
// tests (acceptance.ts) on what his finger plays, plus what makes it an
// inside reverse: the tip goes down into the middle.

import { describe, expect, it } from "vitest";
import { fold, insideReverse, newPaper, type FoldResult, type Paper } from "../engine/paper";
import { r, recordedFoldTests, SAMPLES, sampled } from "./acceptance";
import { length, sub } from "./vec3";

type Point = [number, number];

function folded(result: FoldResult): Paper {
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return result.paper;
}

// A square folded in half along its diagonal (an earlier Step), then the
// corner at (1, 1) reversed in between the two layers along a line from the
// spine at (0.6, 0.6) to the top edge at (0.7, 1): the tip swings through
// the middle and its head comes out across the top edge.
const across = { origin: [0.6, 0.6] as Point, vector: [0.1, 0.4] as Point };
const point = () =>
  folded(fold(newPaper(), { line: { origin: [0, 0], vector: [1, 1] }, flap: [0.9, 0.1], assignment: "V" }));
const before = point();
const after = folded(insideReverse(before, { line: across, tip: [0.95, 0.95] }));
const step = { before, after };
const run = sampled(step);

describe("the inside reverse as a Recording played back", { timeout: 120000 }, () => {
  recordedFoldTests(step, run);

  it("goes down into the middle: the tip stays between the two layers, which stay mirror images", () => {
    const { mesh, frames } = run();
    const start = mesh.start;
    // The tip is the corner at (1, 1); the point's two layers meet there, at the middle plane z = 0.
    const tip = start.findIndex(([x, y]) => r(x) === 1 && r(y) === 1);
    expect(tip).toBeGreaterThanOrEqual(0);
    expect(Math.abs(start[tip][2])).toBe(0);
    // Every vertex has its mirror image across the middle plane in the other layer.
    const mirrorOf = start.map(([x, y, z]) => start.findIndex(([x2, y2, z2]) => r(x2) === r(x) && r(y2) === r(y) && r(z2) === r(-z)));
    expect(mirrorOf.every((m) => m >= 0)).toBe(true);
    for (const positions of frames) {
      // Between the layers: never beyond the upper layer, never beneath the lower one.
      const above = positions.filter((_, v) => start[v][2] > 0).map((p) => p[2]);
      const below = positions.filter((_, v) => start[v][2] < 0).map((p) => p[2]);
      expect(positions[tip][2]).toBeLessThanOrEqual(Math.max(...above) + 1e-6);
      expect(positions[tip][2]).toBeGreaterThanOrEqual(Math.min(...below) - 1e-6);
      expect(Math.abs(positions[tip][2])).toBeLessThan(1e-3);
      // Mirror images: the two layers of the tip (and the whole point) stay symmetric.
      positions.forEach(([x, y, z], v) => {
        const [mx, my, mz] = positions[mirrorOf[v]];
        expect(Math.hypot(x - mx, y - my, z + mz)).toBeLessThan(1e-3);
      });
    }
    // And it really travels: the tip ends far from where it began.
    expect(length(sub(frames[SAMPLES][tip], start[tip]))).toBeGreaterThan(0.3);
  });
});
