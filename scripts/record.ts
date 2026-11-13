// `npm run record`: works out every recorded Fold of the prototype on this
// computer, the way Import works (ADR 0003: made here, published with the
// app). This part is pure and typed; scripts/record.mjs runs it under Node
// through Vite and writes each Recording to proto-gestures/recordings/.

import { RECORDED_STEPS } from "../proto-gestures/papers";
import { record, serializeRecording } from "../src/motion/record";
import type { Recording } from "../src/motion/recording";

export interface Recorded {
  /** The data file's name under proto-gestures/recordings/, without `.json`. */
  name: string;
  recording: Recording;
  /** The file's contents. */
  json: string;
  /** How long the physics took, in seconds. */
  seconds: number;
}

/** Every Recording the page loads, freshly made. */
export function recordAll(): Recorded[] {
  return Object.entries(RECORDED_STEPS).map(([name, step]) => {
    const started = performance.now();
    const { before, after } = step();
    const recording = record(before, after);
    return { name, recording, json: serializeRecording(recording), seconds: (performance.now() - started) / 1000 };
  });
}
