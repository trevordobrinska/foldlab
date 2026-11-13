// A stand-in for ticket 07's Model player: a "Model" of one Step with one
// Fold (the cup's first Step), so that Notation, Step text, calm help, undo
// and step back can be driven on the page before the player exists. The
// player replaces this file (and trail.ts) by being the StepHost itself.

import type { SteppedPaper } from "../view/shape";
import type { StepHost } from "./page";
import { made, START, steppedBack, undone, type Place } from "./trail";

export interface FixtureSteps extends StepHost {
  /** He made the Step's Fold. */
  made(): void;
}

/**
 * `unfold` moves the paper calmly from the made Fold back to before it,
 * then calls `done`.
 */
export function fixtureSteps(paper: SteppedPaper, text: string, unfold: (done: () => void) => void): FixtureSteps {
  const counts = [1];
  let place: Place = START;
  const back = (to: (counts: readonly number[], place: Place) => Place) => (done: () => void) => {
    const next = to(counts, place);
    if (next === place || (next.step === place.step && next.fold === place.fold)) return done();
    place = next;
    unfold(done);
  };
  return {
    text: () => (place.fold < counts[place.step] ? text : "Folded."),
    folds: () => (place.fold < counts[place.step] ? [paper] : []),
    canUndo: () => place.step > 0 || place.fold > 0,
    undo: back(undone),
    canStepBack: () => place.step > 0 || place.fold > 0,
    stepBack: back(steppedBack),
    made: () => (place = made(counts, place)),
  };
}
