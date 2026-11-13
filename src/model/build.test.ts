// Building a Model file: a recipe's engine calls replayed Step by Step, each
// Fold recorded. The cup recipe (a stand-in until Import, see
// src/library/recipes.ts) is the worked example.

import { describe, expect, it } from "vitest";
import { apply } from "../engine/geometry";
import { seenFaces } from "../engine/paper";
import { cupRecipe } from "../library/recipes";
import { LAYER_GAP } from "../motion/mesh";
import { MIN_FRAMES, type Recording } from "../motion/recording";
import { buildModel, paperOf, serializeModel } from "./build";
import { parseModel, type Model, type ModelRecipe } from "./model";

function built(recipe: unknown): Model {
  const result = buildModel(recipe);
  if (!result.ok) throw new Error(`not built: ${JSON.stringify(result)}`);
  return result.model;
}

const cup = built(cupRecipe);
const k = Math.SQRT2 - 1;

/** The Paper's own vertices in one snapshot, as he sees them (x, y) with their height. */
function seenVertices(recording: Recording, snapshot: number): [number, number, number][] {
  const start = snapshot * recording.vertexCount * 3;
  return Array.from({ length: recording.paperVertexCount }, (_, v) => {
    const [x, y, z] = recording.positions.slice(start + v * 3, start + v * 3 + 3);
    return [...apply(recording.view, [x, y]), z];
  });
}

describe("building the cup", { timeout: 60000 }, () => {
  it("keeps the name, the Source, the Paper and every Step's text and calls", () => {
    expect(cup).toMatchObject({ version: 1, id: "cup", name: "Cup", source: cupRecipe.source, paper: cupRecipe.paper });
    expect(cup.steps.map((step) => step.text)).toEqual(cupRecipe.steps.map((step) => step.text));
    expect(cup.steps.map((step) => step.folds.map((fold) => fold.call))).toEqual(cupRecipe.steps.map((step) => step.folds));
  });

  it("is a Model file the page accepts", () => {
    expect(parseModel(cup)).toEqual({ ok: true, value: cup });
  });

  it("records every Fold in the written order", () => {
    const folds = cup.steps.flatMap((step) => step.folds);
    expect(folds.length).toBe(5);
    for (const { recordings } of folds) expect(recordings[0].recording.frameCount).toBeGreaterThanOrEqual(MIN_FRAMES);
    expect(cup.steps.map((step) => step.folds.map((fold) => fold.recordings[0].after))).toEqual([[[]], [[]], [[]], [[], [0]]]);
  });

  it("records the last Step's two flaps in either order: front then back, or back then front", () => {
    const [front, back] = cup.steps[3].folds;
    expect(front.recordings.map((r) => r.after)).toEqual([[], [1]]);
    expect(back.recordings.map((r) => r.after)).toEqual([[0], []]);
    // Either way round ends as the same cup, seen from above.
    const ends = [front.recordings[1].recording, back.recordings[0].recording].map((recording) =>
      seenVertices(recording, recording.frameCount - 1)
        .map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`)
        .sort(),
    );
    expect(new Set(ends[0])).toEqual(new Set(ends[1]));
  });

  it("records a Step in the written order only when its Folds are not symmetric", () => {
    // Fold the square in half, then fold the doubled corner: the other way round is another paper.
    const model = built({
      ...cupRecipe,
      steps: [
        {
          text: "Fold in half, then fold the corner.",
          folds: [
            { type: "valley", line: { origin: [0.5, 0], vector: [0, 1] }, flap: [0.9, 0.5] },
            { type: "valley", line: { origin: [0.3, 1], vector: [0.2, -0.2] }, flap: [0.45, 0.95], layers: "all" },
          ],
        },
      ],
    });
    expect(model.steps[0].folds.map((fold) => fold.recordings.map((r) => r.after))).toEqual([[[]], [[0]]]);
    expect(parseModel(model).ok).toBe(true);
  });

  it("holds the Paper after each Step as a FOLD frame: the last one is the cup", () => {
    const paper = paperOf(cup.steps[3].frame);
    const faces = seenFaces(paper);
    for (const face of faces) {
      for (const [x, y] of face.polygon) {
        expect(x + y).toBeGreaterThan(k - 1e-9);
        expect(x + y).toBeLessThan(1 + 1e-9);
      }
    }
    // One sheet, still: the faces' areas add up to the square's.
    const { vertices_coords, faces_vertices } = cup.steps[3].frame;
    const area = (loop: number[]) =>
      Math.abs(loop.reduce((sum, v, i) => sum + vertices_coords[v][0] * vertices_coords[loop[(i + 1) % loop.length]][1] - vertices_coords[loop[(i + 1) % loop.length]][0] * vertices_coords[v][1], 0)) / 2;
    expect(faces_vertices.reduce((sum, loop) => sum + area(loop), 0)).toBeCloseTo(1, 9);
  });

  it("the first Step's frame is the square folded once: two faces and one valley", () => {
    const { faces_vertices, edges_assignment, faceOrders } = cup.steps[0].frame;
    expect(faces_vertices.length).toBe(2);
    expect(edges_assignment.filter((a) => a === "V").length).toBe(1);
    expect(faceOrders.length).toBe(1);
  });

  it("each Recording begins where the one before it ended, so the paper never jumps between Folds", () => {
    const recordings = cup.steps.flatMap((step) => step.folds).map((fold) => fold.recordings[0].recording);
    let worstHeight = 0;
    for (let i = 1; i < recordings.length; i++) {
      const ended = seenVertices(recordings[i - 1], recordings[i - 1].frameCount - 1);
      const begins = seenVertices(recordings[i], 0);
      for (const [x, y, z] of ended) {
        // As he sees it from above, exactly; in height, within the stack's own thickness: the
        // recorder centres each Recording's stack on its own faces, so the stack sits a layer
        // gap or two higher or lower from one Recording to the next.
        const same = begins.filter(([bx, by]) => Math.abs(bx - x) < 1e-4 && Math.abs(by - y) < 1e-4);
        expect(same.length, `Fold ${i + 1} begins away from where Fold ${i} ended`).toBeGreaterThan(0);
        const height = Math.min(...same.map(([, , bz]) => Math.abs(bz - z)));
        worstHeight = Math.max(worstHeight, height);
        expect(height).toBeLessThan(3 * LAYER_GAP);
      }
    }
    console.log(`between Folds the stack's height shifts by at most ${worstHeight.toFixed(4)} (a layer gap is ${LAYER_GAP})`);
  });

  it("writes a file that reads back as the same Model", () => {
    const text = serializeModel(cup);
    expect(JSON.parse(text)).toEqual(cup);
    expect(text.endsWith("\n")).toBe(true);
  });
});

describe("a recipe that can't be built", () => {
  const withStep2 = (fold: unknown): unknown => ({
    ...cupRecipe,
    steps: [cupRecipe.steps[0], { text: "Fold it.", folds: [cupRecipe.steps[1].folds[0], fold] }],
  });

  it("says which Step and Fold the engine refused, and why", () => {
    const offThePaper = { type: "valley", line: { origin: [0, 0.2], vector: [1, 0] }, flap: [2, 2] };
    expect(buildModel(withStep2(offThePaper))).toEqual({ ok: false, reason: "refused", step: 2, fold: 2, refusal: "no-flap" });
  });

  it("is turned away before the engine when a call is not one a Model can hold", () => {
    const result = buildModel(withStep2({ type: "crumple", line: { origin: [0, 0.2], vector: [1, 0] }, flap: [0.1, 0.1] }));
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(result.ok === false && result.reason === "invalid" && result.problems.join()).toContain("Step 2, Fold 2");
  });

  it("is turned away when it has no Steps", () => {
    const empty: ModelRecipe = { ...cupRecipe, steps: [] };
    expect(buildModel(empty)).toEqual({ ok: false, reason: "invalid", problems: ["the Model has no Steps"] });
  });
});
