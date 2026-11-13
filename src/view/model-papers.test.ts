// A Model's Folds as papers for the view: all placed about one centre, so
// the paper stays where it is on the table from one Fold to the next.

import { describe, expect, it } from "vitest";
import { cupRecipe } from "../library/recipes";
import { buildModel } from "../model/build";
import { modelPapers } from "./model-papers";

const built = buildModel(cupRecipe);
if (!built.ok) throw new Error("the cup did not build");
const cup = built.model;
const folds = cup.steps.flatMap((step) => step.folds);
const papers = modelPapers(cup);

/** The corners of a shape's triangles as "x z" on the table, rounded. */
const footprint = (triangles: Float32Array) => {
  const points = new Set<string>();
  for (let i = 0; i < triangles.length; i += 3) points.add(`${triangles[i].toFixed(3)} ${triangles[i + 2].toFixed(3)}`);
  return points;
};

describe("a Model's papers", () => {
  it("puts the middle of the fresh sheet at the middle of the table", () => {
    const corners = footprint(papers.of(folds[0]).at(0).triangles);
    for (const corner of ["-0.500 -0.500", "0.500 -0.500", "0.500 0.500", "-0.500 0.500"]) expect(corners).toContain(corner);
  });

  it("leaves the paper where it lies from the end of one Fold to the start of the next", () => {
    for (let i = 1; i < folds.length; i++) {
      // Copied: a paper's buffers are rewritten by every call.
      const ended = footprint(papers.of(folds[i - 1]).at(1).triangles.slice());
      const begins = footprint(papers.of(folds[i]).at(0).triangles);
      for (const corner of ended) {
        // The later mesh has more points (its new crease); every earlier corner is still one of them.
        if (isPaperCorner(corner, ended)) expect(begins, `Fold ${i + 1}`).toContain(corner);
      }
      expect(extremes(begins)).toEqual(extremes(ended));
    }
  });

  it("reaches as far as the fresh sheet does, over every Fold", () => {
    expect(papers.extent.x).toBeCloseTo(0.5, 3);
    expect(papers.extent.z).toBeCloseTo(0.5, 3);
  });

  it("gives the same paper for the same Fold, built once", () => {
    expect(papers.of(folds[2])).toBe(papers.of(folds[2]));
  });
});

/** The footprint's bounding box. */
function extremes(points: Set<string>) {
  const xz = [...points].map((p) => p.split(" ").map(Number));
  const round = (n: number) => Math.round(n * 1000) / 1000 + 0;
  return {
    left: round(Math.min(...xz.map(([x]) => x))),
    right: round(Math.max(...xz.map(([x]) => x))),
    far: round(Math.min(...xz.map(([, z]) => z))),
    near: round(Math.max(...xz.map(([, z]) => z))),
  };
}

/** True for the points on the footprint's bounding box: the paper's outline corners, whatever the mesh inside. */
function isPaperCorner(point: string, all: Set<string>): boolean {
  const { left, right, far, near } = extremes(all);
  const [x, z] = point.split(" ").map(Number);
  return [left, right].includes(x) && [far, near].includes(z);
}
