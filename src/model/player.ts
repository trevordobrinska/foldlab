// The Model player: where he is in a Model, and where each thing he can do
// takes him. Pure: every function returns a new Place and touches nothing
// else. The page draws what `shown` says, offers his finger what `toMake`
// says, and saves what `progressOf` says (progress.ts); it carries no
// engine, because every Fold was replayed and recorded when the Model file
// was made.
//
// A Step's Folds may be made in any order the Model file has Recordings for:
// a Recording starts from the Paper as the Folds before it left it, so a
// Fold can only be made from a state of the Step it was recorded from.

import type { Recording } from "../motion/recording";
import type { Model } from "./model";

/** Where he is in a Model. */
export interface Place {
  /** The current Step, counted from 0. */
  step: number;
  /**
   * The Folds of that Step he has made, as their places in the Step (from 0),
   * in the order he made them. Every Fold of the Step only on the last Step,
   * when the whole Model is made.
   */
  made: number[];
  /** True once he has ever made the Model's last Fold: its checkmark, kept when he goes back or folds it again. */
  finished: boolean;
}

/** What is saved for a Model between visits. */
export interface Progress {
  /** The Step to reopen at, counted from 0. */
  step: number;
  finished: boolean;
}

/** A Fold he can make now. */
export interface Offer {
  /** The Fold's place in the current Step, from 0. */
  fold: number;
  /** Its motion from the paper as it lies now. */
  recording: Recording;
}

/** The Place a Model opens at: the saved Step's start, or the first Step. */
export function opened(model: Model, saved: Progress | null): Place {
  const step = saved && Number.isInteger(saved.step) && saved.step >= 0 && saved.step < model.steps.length ? saved.step : 0;
  return { step, made: [], finished: saved?.finished === true };
}

/** The Recording of a Step's Fold made after the Folds in `alreadyMade`, if the Model has one. */
function recordingOf(model: Model, step: number, fold: number, alreadyMade: number[]): Recording | undefined {
  const state = [...alreadyMade].sort((a, b) => a - b).join();
  return model.steps[step].folds[fold].recordings.find((r) => r.after.join() === state)?.recording;
}

/** The Folds he can make now, in the written order. Empty when every Fold of the Model is made. */
export function toMake(model: Model, place: Place): Offer[] {
  return model.steps[place.step].folds.flatMap((_, fold) => {
    const recording = place.made.includes(fold) ? undefined : recordingOf(model, place.step, fold, place.made);
    return recording ? [{ fold, recording }] : [];
  });
}

/**
 * After he makes Fold `fold` of the current Step (by default the next in the
 * written order). A Fold that is not on offer changes nothing. The Step's
 * last Fold moves on to the next Step; the Model's last Fold finishes it.
 */
export function afterFold(model: Model, place: Place, fold = toMake(model, place)[0]?.fold): Place {
  if (!toMake(model, place).some((offer) => offer.fold === fold)) return place;
  const all = [...place.made, fold];
  if (all.length < model.steps[place.step].folds.length) return { ...place, made: all };
  if (place.step + 1 < model.steps.length) return { ...place, step: place.step + 1, made: [] };
  return { ...place, made: all, finished: true };
}

/**
 * What undo does: the Place with the last Fold taken back, and that Fold's
 * Recording (played from 1 to 0, it is the Fold coming undone). At the start
 * of a Step it is the last Fold of the Step before, as if that Step had been
 * made in the written order. Undefined when nothing has been made.
 */
export function undoing(model: Model, place: Place): { place: Place; recording: Recording } | undefined {
  let step = place.step;
  /** The Folds of that Step in the order they were made, the last of them the one to take back. */
  let folds = place.made;
  if (!folds.length) {
    if (step === 0) return undefined;
    step -= 1;
    folds = model.steps[step].folds.map((_, f) => f);
  }
  const before = folds.slice(0, -1);
  const recording = recordingOf(model, step, folds[folds.length - 1], before);
  return recording && { place: { ...place, step, made: before }, recording };
}

/** After step back: the start of this Step, or of the Step before when he is already there. */
export function steppedBack(place: Place): Place {
  if (place.made.length) return { ...place, made: [] };
  return { ...place, step: Math.max(0, place.step - 1) };
}

/** The first Step again; a finished Model stays finished. */
export function startedAgain(place: Place): Place {
  return { ...place, step: 0, made: [] };
}

/** What to save: the current Step, or the first once every Fold is made. */
export function progressOf(model: Model, place: Place): Progress {
  return { step: toMake(model, place).length ? place.step : 0, finished: place.finished };
}

/**
 * What the paper shows at rest at a Place: the first Fold on offer at its
 * start (every Fold on offer starts from the same Paper), or, when the whole
 * Model is made, the Fold he made last at its end.
 */
export function shown(model: Model, place: Place): { recording: Recording; progress: 0 | 1 } {
  const [next] = toMake(model, place);
  if (next) return { recording: next.recording, progress: 0 };
  return { recording: undoing(model, place)!.recording, progress: 1 };
}
