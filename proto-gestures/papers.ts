// The engine Papers behind the prototype's recorded Folds: the Paper as it
// is before each Fold and the engine's Paper after it. Read by `npm run
// record` and by the tests, never by the page, which loads the Recording
// made from them (recordings/*.json) and so carries neither the engine nor
// the physics.

import { fold, insideReverse, newPaper, rotate, type FoldResult, type Paper } from "../src/engine/paper";

export interface RecordedStep {
  before: Paper;
  after: Paper;
}

function folded(result: FoldResult): Paper {
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return result.paper;
}

/**
 * A square folded in half along its diagonal (an earlier Step), then the
 * corner at the end of the spine reversed in between the two layers along
 * the line from (0.6, 0.6) to (0.7, 1), so its head comes out across the
 * top edge; then turned on the table (a Step, not a Fold) so the tip's
 * travel comes straight down the screen.
 */
export function insideReverseStep(): RecordedStep {
  const before = folded(fold(newPaper(), { line: { origin: [0, 0], vector: [1, 1] }, flap: [0.9, 0.1], assignment: "V" }));
  const after = rotate(folded(insideReverse(before, { line: { origin: [0.6, 0.6], vector: [0.1, 0.4] }, tip: [0.95, 0.95] })), 104);
  return { before, after };
}

/** Every Recording the page loads: its data file (under proto-gestures/recordings/) and the Step it records. */
export const RECORDED_STEPS: Record<string, () => RecordedStep> = {
  "inside-reverse": insideReverseStep,
};
