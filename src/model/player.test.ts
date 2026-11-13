// The Model player: a pure walk through a Model's Steps, Fold by Fold.

import { describe, expect, it } from "vitest";
import type { Recording } from "../motion/recording";
import type { Model } from "./model";
import { afterFold, opened, progressOf, shown, startedAgain, steppedBack, toMake, undoing, type Place } from "./player";

// The player never looks inside a Recording, so names stand in for them here;
// the real cup is walked in src/library/library.test.ts.
const rec = (name: string) => name as unknown as Recording;
const one = (name: string) => ({ recordings: [{ after: [], recording: rec(name) }] });
/**
 * Four Steps. The fourth has two Folds that may be made in either order (the
 * shape of the cup); the third has two that must be made in the written order.
 */
const model = {
  steps: [
    { folds: [one("a")] },
    { folds: [one("b")] },
    { folds: [one("c1"), { recordings: [{ after: [0], recording: rec("c2") }] }] },
    {
      folds: [
        { recordings: [{ after: [], recording: rec("d1 first") }, { after: [1], recording: rec("d1 second") }] },
        { recordings: [{ after: [0], recording: rec("d2 second") }, { after: [], recording: rec("d2 first") }] },
      ],
    },
  ],
} as unknown as Model;

const fresh = opened(model, null);
/** The Place after making these Folds, each named by its place in its Step. */
function after(...folds: number[]): Place {
  return folds.reduce((place, fold) => afterFold(model, place, fold), fresh);
}

describe("opening a Model", () => {
  it("starts a new Model at its first Step, showing the first Fold not yet made", () => {
    expect(fresh).toEqual({ step: 0, made: [], finished: false });
    expect(shown(model, fresh)).toEqual({ recording: "a", progress: 0 });
  });

  it("reopens an unfinished Model at the Step he left it on", () => {
    const place = opened(model, { step: 2, finished: false });
    expect(place).toEqual({ step: 2, made: [], finished: false });
    expect(shown(model, place)).toEqual({ recording: "c1", progress: 0 });
  });

  it("starts at the first Step when the saved Step is not one of this Model's", () => {
    for (const step of [-1, 4, 99, 1.5, Number.NaN]) {
      expect(opened(model, { step, finished: true })).toEqual({ step: 0, made: [], finished: true });
    }
  });
});

describe("making Folds", () => {
  it("moves to the next Step when a Step's only Fold is made", () => {
    expect(after(0)).toEqual({ step: 1, made: [], finished: false });
    expect(shown(model, after(0))).toEqual({ recording: "b", progress: 0 });
  });

  it("stays on a Step until every one of its Folds is made", () => {
    expect(after(0, 0, 0)).toEqual({ step: 2, made: [0], finished: false });
    expect(shown(model, after(0, 0, 0))).toEqual({ recording: "c2", progress: 0 });
    expect(after(0, 0, 0, 1)).toEqual({ step: 3, made: [], finished: false });
  });

  it("offers only the Folds that have a Recording from the paper as it lies", () => {
    expect(toMake(model, after(0, 0))).toEqual([{ fold: 0, recording: "c1" }]);
    expect(toMake(model, after(0, 0, 0))).toEqual([{ fold: 1, recording: "c2" }]);
    // A Fold that is not offered is not made.
    expect(afterFold(model, after(0, 0), 1)).toEqual(after(0, 0));
    expect(afterFold(model, after(0, 0, 0), 0)).toEqual(after(0, 0, 0));
  });

  it("offers symmetric Folds in any order, each with the Recording for that order", () => {
    const step4 = after(0, 0, 0, 1);
    expect(toMake(model, step4)).toEqual([
      { fold: 0, recording: "d1 first" },
      { fold: 1, recording: "d2 first" },
    ]);
    expect(toMake(model, afterFold(model, step4, 1))).toEqual([{ fold: 0, recording: "d1 second" }]);
    expect(toMake(model, afterFold(model, step4, 0))).toEqual([{ fold: 1, recording: "d2 second" }]);
  });

  it("finishes the Model with its last Fold, whichever that is, and shows that Fold made", () => {
    expect(after(0, 0, 0, 1, 0, 1)).toEqual({ step: 3, made: [0, 1], finished: true });
    expect(shown(model, after(0, 0, 0, 1, 0, 1))).toEqual({ recording: "d2 second", progress: 1 });
    expect(after(0, 0, 0, 1, 1, 0)).toEqual({ step: 3, made: [1, 0], finished: true });
    expect(shown(model, after(0, 0, 0, 1, 1, 0))).toEqual({ recording: "d1 second", progress: 1 });
  });

  it("has nothing more to make once every Fold is made", () => {
    const end = after(0, 0, 0, 1, 0, 1);
    expect(toMake(model, end)).toEqual([]);
    expect(afterFold(model, end, 0)).toEqual(end);
  });
});

describe("going back", () => {
  it("undo takes back the Fold he made last, with the Recording it was made by", () => {
    expect(undoing(model, after(0, 0, 0, 1, 1, 0))).toEqual({ place: { step: 3, made: [1], finished: true }, recording: "d1 second" });
    expect(undoing(model, after(0, 0, 0, 1, 1))).toEqual({ place: { step: 3, made: [], finished: false }, recording: "d2 first" });
  });

  it("undo at the start of a Step takes back the last Fold of the Step before, in the written order", () => {
    expect(undoing(model, after(0, 0, 0, 1))).toEqual({ place: { step: 2, made: [0], finished: false }, recording: "c2" });
    expect(undoing(model, after(0))).toEqual({ place: { step: 0, made: [], finished: false }, recording: "a" });
  });

  it("there is nothing to undo on a Model not yet begun", () => {
    expect(undoing(model, fresh)).toBeUndefined();
  });

  it("step back returns to the start of this Step, or of the Step before when already there", () => {
    expect(steppedBack(after(0, 0, 0))).toEqual({ step: 2, made: [], finished: false });
    expect(steppedBack(after(0, 0))).toEqual({ step: 1, made: [], finished: false });
    expect(steppedBack(after(0, 0, 0, 1, 0, 1))).toEqual({ step: 3, made: [], finished: true });
    expect(steppedBack(fresh)).toEqual(fresh);
  });

  it("starting again goes to the first Step and keeps the Model finished", () => {
    expect(startedAgain(after(0, 0, 0, 1, 0, 1))).toEqual({ step: 0, made: [], finished: true });
  });
});

describe("what is saved", () => {
  it("is the current Step and whether the Model was ever finished", () => {
    expect(progressOf(model, after(0, 0))).toEqual({ step: 2, finished: false });
    expect(progressOf(model, after(0, 0, 0))).toEqual({ step: 2, finished: false });
  });

  it("is the first Step once every Fold is made, so a finished Model opens from the start", () => {
    const end = after(0, 0, 0, 1, 0, 1);
    expect(progressOf(model, end)).toEqual({ step: 0, finished: true });
    expect(opened(model, progressOf(model, end))).toEqual({ step: 0, made: [], finished: true });
  });

  it("keeps the checkmark while he folds a finished Model again", () => {
    const again = afterFold(model, afterFold(model, startedAgain(after(0, 0, 0, 1, 0, 1)), 0), 0);
    expect(progressOf(model, again)).toEqual({ step: 2, finished: true });
  });
});
