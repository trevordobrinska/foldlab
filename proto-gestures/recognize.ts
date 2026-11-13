// Gesture recognition for the prototype Folds. Pure and DOM-free:
// canned geometry + the finger's path in, progress and a verdict out.
//
// Every prototype gesture is a "push": the finger lands on a grab zone (the
// part of the paper a hand would hold) and moves it along an axis. Progress
// is how far along that axis the finger has travelled, so the paper can
// follow the finger. A Fold may also ask for a press-and-hold before the
// push (closed sink: press the point in), which is what tells it apart from
// a squash pushed the same way; timestamps are read only for that.

export interface PathPoint {
  x: number;
  y: number;
  /** Milliseconds since the gesture began. */
  t: number;
}

export interface PushSpec {
  /** Where the finger must land to take hold of the paper. */
  grab: { x: number; y: number; radius: number };
  /** Unit vector of the real hand motion. */
  axis: { x: number; y: number };
  /** Distance along the axis for a complete Fold. */
  travel: number;
  /** If set, the finger must rest on the grab zone this long before the
   *  paper follows it. */
  holdMs?: number;
}

export type Verdict = "match" | "spring-back";

/** Net finger movement split into along-axis and across-axis parts. */
function displacement(spec: PushSpec, path: PathPoint[]) {
  const start = path[0];
  const end = path[path.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // Canned axes may be rounded; measure against the true unit vector.
  const len = Math.hypot(spec.axis.x, spec.axis.y) || 1;
  const ax = spec.axis.x / len;
  const ay = spec.axis.y / len;
  return {
    along: dx * ax + dy * ay,
    across: dx * -ay + dy * ax,
  };
}

/** Did the finger land on the part of the paper this Fold is made with?
 *  The zone is generous (its radius is a thumb-print or so) and a little
 *  slack is added beyond it. */
export function tookHold(spec: PushSpec, path: PathPoint[]): boolean {
  if (path.length === 0) return false;
  const { grab } = spec;
  const dx = path[0].x - grab.x;
  const dy = path[0].y - grab.y;
  return Math.hypot(dx, dy) <= grab.radius * 1.25;
}

/** How far the finger may drift while holding still: half the grab zone. */
const HOLD_SLOP = 0.5;

/** Has the finger rested on its landing point for the hold the Fold asks for?
 *  False while the hold is still under way, and for good if it slid off. */
export function heldStill(spec: PushSpec, path: PathPoint[]): boolean {
  if (!spec.holdMs) return true;
  if (path.length === 0 || path[path.length - 1].t < spec.holdMs) return false;
  const start = path[0];
  const slop = spec.grab.radius * HOLD_SLOP;
  return path
    .filter((p) => p.t < spec.holdMs!)
    .every((p) => Math.hypot(p.x - start.x, p.y - start.y) <= slop);
}

/** Progress 0..1 of the push: distance travelled along the axis / travel.
 *  Zero when the finger never took hold (or has not finished its hold), so
 *  the paper does not follow. */
export function progressOf(spec: PushSpec, path: PathPoint[]): number {
  if (path.length < 2 || !tookHold(spec, path) || !heldStill(spec, path)) return 0;
  const { along } = displacement(spec, path);
  return Math.min(1, Math.max(0, along / spec.travel));
}

/** A push that gets past halfway counts: he is a child, and the engine
 *  finishes the Fold exactly anyway. */
const MATCH_PROGRESS = 0.55;

/** How far off the axis the net movement may point. Wobble along the way
 *  is ignored because only the net movement is measured. */
const MAX_OFF_AXIS_DEGREES = 50;

/** The verdict once the finger lifts. */
export function judge(spec: PushSpec, path: PathPoint[]): Verdict {
  if (progressOf(spec, path) < MATCH_PROGRESS) return "spring-back";
  const { along, across } = displacement(spec, path);
  const offAxis = (Math.atan2(Math.abs(across), along) * 180) / Math.PI;
  return offAxis <= MAX_OFF_AXIS_DEGREES ? "match" : "spring-back";
}
