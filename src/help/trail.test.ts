// Undo and step back over a Model's Steps, given only how many Folds each
// Step has. The examples are a Model of three Steps with 1, 2 and 1 Folds.

import { describe, expect, it } from "vitest";
import { made, START, steppedBack, undone, type Place } from "./trail";

const counts = [1, 2, 1];
const at = (step: number, fold: number): Place => ({ step, fold });

describe("making Folds", () => {
  it("making a Step's only Fold moves to the next Step", () => {
    expect(made(counts, START)).toEqual(at(1, 0));
  });

  it("a Step of two Folds is finished by the second", () => {
    expect(made(counts, at(1, 0))).toEqual(at(1, 1));
    expect(made(counts, at(1, 1))).toEqual(at(2, 0));
  });

  it("the last Fold of the last Step leaves him at the end of it, with nothing more to make", () => {
    const end = made(counts, at(2, 0));
    expect(end).toEqual(at(2, 1));
    expect(made(counts, end)).toEqual(end);
  });
});

describe("undo: the last Fold he made is taken back", () => {
  it("there is nothing to undo at the start", () => {
    expect(undone(counts, START)).toEqual(START);
  });

  it("part-way through a Step it takes back that Step's last Fold", () => {
    expect(undone(counts, at(1, 1))).toEqual(at(1, 0));
  });

  it("at the start of a Step it takes back the last Fold of the Step before", () => {
    expect(undone(counts, at(1, 0))).toEqual(at(0, 0));
    expect(undone(counts, at(2, 0))).toEqual(at(1, 1));
  });

  it("undoes every Fold he made, one at a time, back to the start", () => {
    let place = START;
    for (let i = 0; i < 4; i++) place = made(counts, place);
    const seen: Place[] = [];
    for (let i = 0; i < 4; i++) seen.push((place = undone(counts, place)));
    expect(seen).toEqual([at(2, 0), at(1, 1), at(1, 0), at(0, 0)]);
  });
});

describe("step back: the start of this Step, or of the Step before when he is already there", () => {
  it("there is nowhere to step back to at the start", () => {
    expect(steppedBack(counts, START)).toEqual(START);
  });

  it("part-way through a Step it goes to that Step's start", () => {
    expect(steppedBack(counts, at(1, 1))).toEqual(at(1, 0));
    expect(steppedBack(counts, at(2, 1))).toEqual(at(2, 0));
  });

  it("at a Step's start it goes to the start of the Step before, taking back all its Folds", () => {
    expect(steppedBack(counts, at(2, 0))).toEqual(at(1, 0));
    expect(steppedBack(counts, at(1, 0))).toEqual(at(0, 0));
  });
});
