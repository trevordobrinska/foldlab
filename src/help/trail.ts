// Where he is among a Model's Steps, and where undo and step back take him.
// Pure, and knows nothing of a Model but how many Folds each Step has.
//
// This stands in for ticket 07's Model player (src/model/player.ts on its
// branch has the same `made`, `undone` and `steppedBack` over a Model): it
// drives the fixture Step (fixture.ts) until the player is on the page, and
// can be deleted then.

/** Where he is: the current Step (from 0) and how many of its Folds he has made. */
export interface Place {
  step: number;
  /** Equal to the Step's Fold count only on the last Step, when every Fold is made. */
  fold: number;
}

export const START: Place = { step: 0, fold: 0 };

/** After he makes the next Fold. `counts` is the number of Folds in each Step. */
export function made(counts: readonly number[], place: Place): Place {
  if (place.fold >= counts[place.step]) return place;
  const fold = place.fold + 1;
  if (fold < counts[place.step] || place.step + 1 >= counts.length) return { step: place.step, fold };
  return { step: place.step + 1, fold: 0 };
}

/** After undo: the last Fold he made is taken back, from this Step or the one before. */
export function undone(counts: readonly number[], place: Place): Place {
  if (place.fold > 0) return { step: place.step, fold: place.fold - 1 };
  if (place.step === 0) return place;
  return { step: place.step - 1, fold: counts[place.step - 1] - 1 };
}

/** After step back: the start of this Step, or of the Step before when he is already there. */
export function steppedBack(_counts: readonly number[], place: Place): Place {
  if (place.fold > 0) return { step: place.step, fold: 0 };
  return { step: Math.max(0, place.step - 1), fold: 0 };
}
