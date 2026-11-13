// The engine Papers behind the prototype's recorded Folds: the Paper as it
// is before each Fold and the engine's Paper after it. Read by `npm run
// record` and by the tests, never by the page, which loads the Recording
// made from them (recordings/*.json) and so carries neither the engine nor
// the physics.

import { closedSink, fold, insideReverse, newPaper, rotate, squash, turnOver, type FoldResult, type Lift, type Paper } from "../src/engine/paper";

export interface RecordedStep {
  before: Paper;
  after: Paper;
  /** For a squash: the flap the hand lifts to stand first, where the Recording starts. */
  lift?: Lift;
}

function folded(result: FoldResult): Paper {
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return result.paper;
}

function lifted(result: FoldResult): Lift {
  if (!result.ok || !result.lift) throw new Error("not a Fold that lifts a flap");
  return result.lift;
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

/**
 * The classic squash: a square folded in half on its diagonal, the triangle
 * folded in half again (earlier Steps), then the top flap squashed into a
 * square on its hinge line; then turned on the table (a Step, not a Fold)
 * so the hinge line runs down the screen toward him, with the flap's tip
 * landing at its near end: the standing tip then comes straight down the
 * screen, the same push as the closed sink, and the flap spreads left and right.
 */
export function squashStep(): RecordedStep {
  const hinge = { origin: [0, 1] as [number, number], vector: [1, -1] as [number, number] };
  const triangle = folded(fold(newPaper(), { line: { origin: [0, 0], vector: [1, 1] }, flap: [0.9, 0.1], assignment: "V" }));
  const before = folded(fold(triangle, { line: hinge, flap: [0.9, 0.9], assignment: "V", layers: "all" }));
  const result = squash(before, { line: hinge, flap: [0.2, 0.6] });
  return { before, after: rotate(folded(result), -45), lift: lifted(result) };
}

/**
 * The closed sink: a preliminary base (the halved triangle's front flap
 * squashed, then the back flap after a turn over: earlier Steps), its closed
 * point sunk along the line across the centre line 0.2 from its corners; then
 * turned on the table (a Step, not a Fold) so the closed point is at the top
 * and the push comes straight down the screen, the same push as the squash.
 */
export function closedSinkStep(): RecordedStep {
  const hinge = { origin: [0, 1] as [number, number], vector: [1, -1] as [number, number] };
  const mirrored = { origin: [0.5, 1] as [number, number], vector: [-1, -1] as [number, number] };
  const triangle = folded(fold(newPaper(), { line: { origin: [0, 0], vector: [1, 1] }, flap: [0.9, 0.1], assignment: "V" }));
  const halved = folded(fold(triangle, { line: hinge, flap: [0.9, 0.9], assignment: "V", layers: "all" }));
  const front = folded(squash(halved, { line: hinge, flap: [0.2, 0.6] }));
  const before = folded(squash(turnOver(front), { line: mirrored, flap: [0.3, 0.6] }));
  const after = folded(closedSink(before, { line: { origin: [0.2, 0.5], vector: [-1, 1] }, point: [0.04, 0.54] }));
  return { before, after: rotate(after, -135) };
}

/** Every Recording the page loads: its data file (under proto-gestures/recordings/) and the Step it records. */
export const RECORDED_STEPS: Record<string, () => RecordedStep> = {
  "inside-reverse": insideReverseStep,
  squash: squashStep,
  "closed-sink": closedSinkStep,
};
