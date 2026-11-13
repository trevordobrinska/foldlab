// A plain valley Fold as a Recording, played back: the cup's first Step (the
// page's fixture until the Model player, ticket 07), through ticket 10's
// acceptance tests (acceptance.ts), plus what makes it a valley Fold of a
// flat square: the paper that doesn't move stays flat on the table, and the
// corner swings over in an arc about the fold line.

import { describe, expect, it } from "vitest";
import { cupStep1 } from "../recordings/papers";
import { apart, r, recordedFoldTests, SAMPLES, sampled } from "./acceptance";
import { length, sub } from "./vec3";

const step = cupStep1();
const run = sampled(step);

describe("the cup's first Step as a Recording played back", { timeout: 120000 }, () => {
  recordedFoldTests(step, run);

  it("swings the corner over in an arc about the fold line and lands it on the opposite corner", () => {
    const { mesh, frames } = run();
    const start = mesh.start;
    const tip = start.findIndex(([x, y]) => r(x) === 1 && r(y) === 1);
    expect(tip).toBeGreaterThanOrEqual(0);
    // The fold line runs from (1, 0) to (0, 1); the corner stays 1/√2 from it (on the plane through it) throughout.
    let lastHeight = -Infinity;
    let rising = true;
    for (const positions of frames) {
      const [x, y, z] = positions[tip];
      const fromLine = Math.hypot((x + y - 1) / Math.SQRT2, z);
      expect(fromLine).toBeCloseTo(Math.SQRT1_2, 2);
      // On the diagonal, up then down, never back.
      expect(Math.abs(x - y)).toBeLessThan(0.01);
      if (z < lastHeight - 1e-3) rising = false;
      if (rising) expect(z).toBeGreaterThanOrEqual(lastHeight - 1e-3);
      else expect(z).toBeLessThanOrEqual(lastHeight + 1e-3);
      lastHeight = z;
    }
    expect(apart(frames[SAMPLES][tip], [0, 0, frames[SAMPLES][tip][2]])).toBeLessThan(1e-4);
    expect(length(sub(frames[SAMPLES][tip], start[tip]))).toBeCloseTo(Math.SQRT2, 3);
  });

  it("keeps the still half flat on the table", () => {
    const { mesh, frames } = run();
    const still = mesh.start.flatMap((p, v) => (v < mesh.paperVertexCount && r(p[0] + p[1]) <= 1 ? [v] : []));
    expect(still.length).toBe(3);
    let worst = 0;
    for (const positions of frames) for (const v of still) worst = Math.max(worst, Math.abs(positions[v][2]));
    console.log(`the still half rises at most ${worst.toFixed(4)} off the table`);
    expect(worst).toBeLessThan(0.01);
  });
});
