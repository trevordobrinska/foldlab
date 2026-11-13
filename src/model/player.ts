// The Model player: where he is in a Model, and where each thing he can do
// takes him. Pure: every function returns a new Place and touches nothing
// else. The page draws what `shown` says and saves what `progressOf` says
// (progress.ts); it carries no engine, because every Fold was replayed and
// recorded when the Model file was made.
//
// Folds are walked in the order the Model file holds them, because each
// Recording starts from the Paper as the Folds before it left it.

import type { Model, ModelFold } from "./model";

/** Where he is in a Model. */
export interface Place {
  /** The current Step, counted from 0. */
  step: number;
  /** How many of that Step's Folds he has made. Equal to the Step's Fold count only on the last Step, when every Fold is made. */
  fold: number;
  /** True once he has ever made the Model's last Fold: its checkmark, kept when he goes back or folds it again. */
  finished: boolean;
}

/** What is saved for a Model between visits. */
export interface Progress {
  /** The Step to reopen at, counted from 0. */
  step: number;
  finished: boolean;
}

/** The Place a Model opens at: the saved Step's start, or the first Step. */
export function opened(model: Model, saved: Progress | null): Place {
  const step = saved && Number.isInteger(saved.step) && saved.step >= 0 && saved.step < model.steps.length ? saved.step : 0;
  return { step, fold: 0, finished: saved?.finished === true };
}

/** The Fold he is to make next, or undefined when every Fold is made. */
export function nextFold(model: Model, place: Place): ModelFold | undefined {
  return model.steps[place.step].folds[place.fold];
}

/** After he makes the next Fold. Making the last Fold of the last Step finishes the Model. */
export function made(model: Model, place: Place): Place {
  if (!nextFold(model, place)) return place;
  const fold = place.fold + 1;
  if (fold < model.steps[place.step].folds.length) return { ...place, fold };
  if (place.step + 1 < model.steps.length) return { ...place, step: place.step + 1, fold: 0 };
  return { ...place, fold, finished: true };
}

/** After undo: the last Fold he made is taken back, from this Step or the one before. */
export function undone(model: Model, place: Place): Place {
  if (place.fold > 0) return { ...place, fold: place.fold - 1 };
  if (place.step === 0) return place;
  return { ...place, step: place.step - 1, fold: model.steps[place.step - 1].folds.length - 1 };
}

/** After step back: the start of this Step, or of the Step before when he is already there. */
export function steppedBack(_model: Model, place: Place): Place {
  if (place.fold > 0) return { ...place, fold: 0 };
  return { ...place, step: Math.max(0, place.step - 1) };
}

/** The first Step again; a finished Model stays finished. */
export function startedAgain(place: Place): Place {
  return { ...place, step: 0, fold: 0 };
}

/** What to save: the current Step, or the first once every Fold is made. */
export function progressOf(model: Model, place: Place): Progress {
  return { step: nextFold(model, place) ? place.step : 0, finished: place.finished };
}

/**
 * What the paper shows at a Place: the next Fold's Recording at its start,
 * or, when every Fold is made, the last Fold's Recording at its end.
 */
export function shown(model: Model, place: Place): { fold: ModelFold; progress: 0 | 1 } {
  const next = nextFold(model, place);
  if (next) return { fold: next, progress: 0 };
  return { fold: model.steps[place.step].folds[place.fold - 1], progress: 1 };
}
