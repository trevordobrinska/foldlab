// The squash as a Recording, played back: ticket 10's acceptance tests
// (acceptance.ts) on what his finger plays, plus what makes it a squash:
// the Recording starts with the flap standing on its hinge line (as the
// diagram draws it, and as the hand holds it), the flap's two layers stay
// mirror images of each other across the plane of that line throughout, the
// spine opens, and the tip comes down onto the line and never rises.

import { describe, expect, it } from "vitest";
import { apply, determinant, invert, type Point } from "../engine/geometry";
import { fold, newPaper, squash, type FoldResult, type Paper } from "../engine/paper";
import { recordedFoldTests, SAMPLES, sampled } from "./acceptance";
import { dihedral } from "./hinge";
import { buildMesh, LAYER_GAP } from "./mesh";
import { length, sub, type V3 } from "./vec3";

function folded(result: FoldResult): Paper {
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return result.paper;
}

// The classic squash: a square folded in half on its diagonal, the triangle
// folded in half again, then the top flap squashed into a square on its
// hinge line from (0, 1) to the paper's centre (0.5, 0.5).
const hinge = { origin: [0, 1] as Point, vector: [1, -1] as Point };
const triangle = folded(fold(newPaper(), { line: { origin: [0, 0], vector: [1, 1] }, flap: [0.9, 0.1], assignment: "V" }));
const before = folded(fold(triangle, { line: hinge, flap: [0.9, 0.9], assignment: "V", layers: "all" }));
const result = squash(before, { line: hinge, flap: [0.2, 0.6] });
if (!result.ok || !result.lift) throw new Error("the squash was refused");
const step = { before, after: result.paper, lift: result.lift };
const run = sampled(step);

/** The hinge line in the folded frame, and the mirror across its (vertical) plane. */
const toFolded = invert(before.view);
const origin = apply(toFolded, hinge.origin);
const along = (() => {
  const [x, y] = [hinge.vector[0], hinge.vector[1]];
  const len = Math.hypot(x, y);
  return [x / len, y / len] as Point;
})();
const mirror = ([x, y, z]: V3): V3 => {
  const dx = x - origin[0];
  const dy = y - origin[1];
  const t = dx * along[0] + dy * along[1];
  return [origin[0] + 2 * t * along[0] - dx, origin[1] + 2 * t * along[1] - dy, z];
};
const foot = ([x, y]: V3): Point => {
  const t = (x - origin[0]) * along[0] + (y - origin[1]) * along[1];
  return [origin[0] + t * along[0], origin[1] + t * along[1]];
};
/** +1 when his side is the folded frame's +z: the flap stands toward him. */
const facing = Math.sign(determinant(step.after.view));
/** The standing flap's tip: the vertex highest toward him at the start. */
const tip = (start: V3[]) => start.reduce((best, p, v) => (facing * p[2] > facing * start[best][2] ? v : best), 0);

describe("the squash as a Recording played back", { timeout: 120000 }, () => {
  recordedFoldTests(step, run);

  it("starts with the flap standing on its hinge line: the flat flap turned up 90° toward him, its tip 1/√2 high", () => {
    const { mesh } = run();
    const lying = buildMesh(before, step.after).start;
    const base = lying.filter((_, v) => mesh.pinned[v]).reduce((sum, p) => sum + p[2], 0) / mesh.pinned.filter(Boolean).length;
    let lifted = 0;
    mesh.start.forEach((p, v) => {
      const flat = lying[v];
      const d = length(sub([flat[0], flat[1], 0], [...foot(flat), 0]));
      if (d < 1e-6 || length(sub(p, flat)) < 1e-9) {
        // On the line, or not part of the flap: where it lay.
        expect(length(sub(p, flat))).toBeLessThan(3 * LAYER_GAP);
        return;
      }
      lifted++;
      // Turned up about the line: its foot on the line, as high (toward him) as it was far from it.
      const [fx, fy] = foot(flat);
      expect(Math.hypot(p[0] - fx, p[1] - fy)).toBeLessThan(2 * LAYER_GAP);
      expect(Math.abs(facing * (p[2] - base) - d)).toBeLessThan(3 * LAYER_GAP);
    });
    expect(lifted).toBeGreaterThan(6);
    expect(Math.abs(facing * (mesh.start[tip(mesh.start)][2] - base) - Math.SQRT1_2)).toBeLessThan(2 * LAYER_GAP);
  });

  it("the flap's two layers stay mirror images across the spine's plane throughout", () => {
    const { mesh, frames } = run();
    const start = mesh.start;
    // Each vertex of the standing flap has its mirror image across the hinge's plane in the other layer (or is its own, on the spine).
    const partner = start.map((p) => {
      const m = mirror(p);
      let best = -1;
      let near = 2 * LAYER_GAP;
      start.forEach((q, w) => {
        const d = length(sub(q, m));
        if (d < near) [best, near] = [w, d];
      });
      return best;
    });
    const flap = start.flatMap((_, v) => (partner[v] >= 0 ? [v] : []));
    expect(flap.length).toBeGreaterThan(10);
    expect(flap.some((v) => partner[v] !== v)).toBe(true);
    let inPlane = 0;
    let inHeight = 0;
    for (const positions of frames) {
      for (const v of flap) {
        const [x, y, z] = positions[v];
        const [mx, my, mz] = mirror(positions[partner[v]]);
        inPlane = Math.max(inPlane, Math.hypot(x - mx, y - my));
        inHeight = Math.max(inHeight, Math.abs(z - mz));
      }
    }
    // In the plane of the table, mirror images to within a layer's gap; in height they may differ by
    // the layers each half comes to lie on (the inner half on the base, the outer on the table).
    console.log(
      `mirror: the two layers agree within ${inPlane.toExponential(2)} in the plane (${(inPlane / LAYER_GAP).toFixed(2)} layer gaps)` +
        ` and ${inHeight.toExponential(2)} in height (${(inHeight / LAYER_GAP).toFixed(2)} layer gaps)`,
    );
    expect(inPlane).toBeLessThan(LAYER_GAP);
    expect(inHeight).toBeLessThan(3 * LAYER_GAP);
  });

  it("opens at the spine and presses flat: the spine goes from folded to open, the tip comes down onto the line and never rises", () => {
    const { mesh, frames } = run();
    const spine = mesh.hinges.filter((h) => h.kind === "crease" && h.driven && Math.abs(h.start) > 3 && Math.abs(h.end) < 1e-6);
    expect(spine.length).toBeGreaterThan(0);
    const top = tip(mesh.start);
    let lastHeight = Infinity;
    let lastOpening = Infinity;
    for (const positions of frames) {
      const height = facing * positions[top][2];
      expect(height).toBeLessThan(lastHeight + 0.003);
      lastHeight = Math.min(lastHeight, height);
      const opening = Math.max(...spine.map((h) => Math.abs(dihedral(positions, h))));
      expect(opening).toBeLessThan(lastOpening + 0.05);
      lastOpening = Math.min(lastOpening, opening);
    }
    // The tip lands on the hinge line, 1/√2 from where it stood.
    const landed = frames[SAMPLES][top];
    const [fx, fy] = foot(landed);
    expect(Math.hypot(landed[0] - fx, landed[1] - fy)).toBeLessThan(1e-4);
    expect(Math.hypot(landed[0] - mesh.start[top][0], landed[1] - mesh.start[top][1])).toBeCloseTo(Math.SQRT1_2, 3);
  });
});
