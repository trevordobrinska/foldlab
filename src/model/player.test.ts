// The Model player: a pure walk through a Model's Steps, Fold by Fold.

import { describe, expect, it } from "vitest";
import type { Model, ModelFold } from "./model";
import { made, opened, progressOf, shown, startedAgain, steppedBack, undone, type Place } from "./player";

// The player never looks inside a Fold, so stand-ins are enough here; the
// real cup is walked in src/library/library.test.ts.
const foldNamed = (name: string) => ({ name }) as unknown as ModelFold;
const [a, b, c, d1, d2] = ["a", "b", "c", "d1", "d2"].map(foldNamed);
/** Four Steps, the last with two Folds: the shape of the cup. */
const model = {
  steps: [{ folds: [a] }, { folds: [b] }, { folds: [c] }, { folds: [d1, d2] }],
} as unknown as Model;

const fresh = opened(model, null);
function after(folds: number): Place {
  let place = fresh;
  for (let i = 0; i < folds; i++) place = made(model, place);
  return place;
}

describe("opening a Model", () => {
  it("starts a new Model at its first Step, showing the first Fold not yet made", () => {
    expect(fresh).toEqual({ step: 0, fold: 0, finished: false });
    expect(shown(model, fresh)).toEqual({ fold: a, progress: 0 });
  });

  it("reopens an unfinished Model at the Step he left it on", () => {
    const place = opened(model, { step: 2, finished: false });
    expect(place).toEqual({ step: 2, fold: 0, finished: false });
    expect(shown(model, place)).toEqual({ fold: c, progress: 0 });
  });

  it("starts at the first Step when the saved Step is not one of this Model's", () => {
    for (const step of [-1, 4, 99, 1.5, Number.NaN]) {
      expect(opened(model, { step, finished: true })).toEqual({ step: 0, fold: 0, finished: true });
    }
  });
});

describe("making Folds", () => {
  it("moves to the next Step when a Step's only Fold is made", () => {
    expect(after(1)).toEqual({ step: 1, fold: 0, finished: false });
    expect(shown(model, after(1))).toEqual({ fold: b, progress: 0 });
  });

  it("stays on a Step until every one of its Folds is made", () => {
    expect(after(4)).toEqual({ step: 3, fold: 1, finished: false });
    expect(shown(model, after(4))).toEqual({ fold: d2, progress: 0 });
  });

  it("finishes the Model with its last Fold, and shows that Fold made", () => {
    expect(after(5)).toEqual({ step: 3, fold: 2, finished: true });
    expect(shown(model, after(5))).toEqual({ fold: d2, progress: 1 });
  });

  it("has nothing more to make once every Fold is made", () => {
    expect(made(model, after(5))).toEqual(after(5));
  });
});

describe("going back", () => {
  it("undo takes back one Fold, within a Step or into the Step before", () => {
    expect(undone(model, after(5))).toEqual({ step: 3, fold: 1, finished: true });
    expect(undone(model, after(4))).toEqual({ step: 3, fold: 0, finished: false });
    expect(undone(model, after(3))).toEqual({ step: 2, fold: 0, finished: false });
    expect(undone(model, fresh)).toEqual(fresh);
  });

  it("step back returns to the start of this Step, or of the Step before when already there", () => {
    expect(steppedBack(model, after(4))).toEqual({ step: 3, fold: 0, finished: false });
    expect(steppedBack(model, after(3))).toEqual({ step: 2, fold: 0, finished: false });
    expect(steppedBack(model, after(5))).toEqual({ step: 3, fold: 0, finished: true });
    expect(steppedBack(model, fresh)).toEqual(fresh);
  });

  it("starting again goes to the first Step and keeps the Model finished", () => {
    expect(startedAgain(after(5))).toEqual({ step: 0, fold: 0, finished: true });
  });
});

describe("what is saved", () => {
  it("is the current Step and whether the Model was ever finished", () => {
    expect(progressOf(model, after(2))).toEqual({ step: 2, finished: false });
    expect(progressOf(model, after(4))).toEqual({ step: 3, finished: false });
  });

  it("is the first Step once every Fold is made, so a finished Model opens from the start", () => {
    expect(progressOf(model, after(5))).toEqual({ step: 0, finished: true });
    expect(opened(model, progressOf(model, after(5)))).toEqual({ step: 0, fold: 0, finished: true });
  });

  it("keeps the checkmark while he folds a finished Model again", () => {
    const again = made(model, made(model, startedAgain(after(5))));
    expect(progressOf(model, again)).toEqual({ step: 2, finished: true });
  });
});
