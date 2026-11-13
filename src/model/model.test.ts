// Checking a Model file as the page reads it: a good one passes, and a
// damaged one is refused with the place of every problem.

import { describe, expect, it } from "vitest";
import { cupRecipe } from "../library/recipes";
import { buildModel } from "./build";
import { parseModel, parseRecipe, type Model } from "./model";

const result = buildModel(cupRecipe);
if (!result.ok) throw new Error("the cup did not build");
const cup = result.model;

/** The cup with one thing changed. */
function damaged(change: (model: Model) => void): unknown {
  const copy = structuredClone(cup);
  change(copy);
  return copy;
}
const problemsOf = (data: unknown) => {
  const parsed = parseModel(data);
  return parsed.ok ? [] : parsed.problems;
};

describe("a Model file", () => {
  it("is accepted as it was built", () => {
    expect(problemsOf(cup)).toEqual([]);
  });

  it("is refused when it is not a Model at all", () => {
    for (const data of [null, "cup", 3, []]) expect(problemsOf(data)).toEqual(["not a Model file"]);
  });

  it("is refused when it is another version of the format", () => {
    expect(problemsOf(damaged((m) => ((m as { version: number }).version = 2)))).toEqual(["version is 2, not 1"]);
  });

  it("needs a name, a Source, and an id that is safe in a file name", () => {
    expect(problemsOf(damaged((m) => (m.name = " ")))).toEqual(["the Model has no name"]);
    expect(problemsOf(damaged((m) => (m.source = { name: "" })))).toEqual(["the Model has no Source"]);
    expect(problemsOf(damaged((m) => (m.id = "My Cup")))).toEqual(["id must be lower-case letters, digits and dashes"]);
  });

  it("needs a Paper with a shape and two coloured sides", () => {
    expect(problemsOf(damaged((m) => (m.paper.height = 0)))).toEqual(["the Paper needs a width and a height above 0"]);
    expect(problemsOf(damaged((m) => (m.paper.back = "orange")))).toEqual(["the Paper's two sides each need a colour like #e9a65e"]);
  });

  it("needs Steps, each with text and at least one Fold", () => {
    expect(problemsOf(damaged((m) => (m.steps = [])))).toEqual(["the Model has no Steps"]);
    expect(problemsOf(damaged((m) => (m.steps[1].text = "")))).toEqual(["Step 2 has no text"]);
    expect(problemsOf(damaged((m) => (m.steps[2].folds = [])))).toEqual(["Step 3 has no Folds"]);
  });

  it("names the Step and Fold of a call the engine does not have", () => {
    expect(problemsOf(damaged((m) => ((m.steps[3].folds[1].call as { type: string }).type = "petal")))).toEqual([
      'Step 4, Fold 2: "petal" is not a Fold type a Model can hold yet (valley, mountain)',
    ]);
    expect(problemsOf(damaged((m) => (m.steps[0].folds[0].call.line.vector = [0, 0])))).toEqual(["Step 1, Fold 1: the line has no direction"]);
  });

  it("names the Step and Fold of a Recording that is missing or cut short", () => {
    expect(problemsOf(damaged((m) => delete (m.steps[1].folds[0] as { recording?: unknown }).recording))).toEqual(["Step 2, Fold 1 has no Recording"]);
    expect(problemsOf(damaged((m) => m.steps[3].folds[0].recording.positions.pop()))).toEqual([
      "Step 4, Fold 1: its Recording has positions that do not match its snapshot and vertex counts",
    ]);
  });

  it("names the Step of a FOLD frame that is missing or does not hold together", () => {
    expect(problemsOf(damaged((m) => delete (m.steps[0] as { frame?: unknown }).frame))).toEqual(["Step 1 has no FOLD frame"]);
    expect(problemsOf(damaged((m) => (m.steps[2].frame.faces_vertices[0][0] = 999)))).toEqual([
      "Step 3: its FOLD frame has faces that are not loops of its vertices",
    ]);
  });

  it("lists every problem, not just the first", () => {
    const data = damaged((m) => {
      m.name = "";
      m.steps[0].text = "";
      m.steps[3].folds[1].call.flap = [Number.NaN, 0];
    });
    expect(problemsOf(data)).toEqual(["the Model has no name", "Step 1 has no text", "Step 4, Fold 2: flap must be a point"]);
  });
});

describe("a recipe", () => {
  it("is accepted with engine calls alone", () => {
    expect(parseRecipe(cupRecipe)).toEqual({ ok: true, value: cupRecipe });
  });

  it("is refused for the same faults as a Model file", () => {
    expect(parseRecipe({ ...cupRecipe, name: "", steps: [{ text: "Fold.", folds: [{ type: "valley", flap: [0, 0], layers: 0 }] }] })).toEqual({
      ok: false,
      problems: [
        "the Model has no name",
        "Step 1, Fold 1: the line needs an origin and a vector",
        'Step 1, Fold 1: layers must be a whole number above 0, or "all"',
      ],
    });
  });
});
