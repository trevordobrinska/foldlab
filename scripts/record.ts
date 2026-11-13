// `npm run record`: works out every recorded Step on this computer, the way
// Import works (ADR 0003: made here, published with the app). This part is
// pure and typed; scripts/record.mjs runs it under Node through Vite and
// writes each Recording to src/recordings/<name>.json.

import { record, serializeRecording } from "../src/motion/record";
import type { Recording } from "../src/motion/recording";
import { RECORDED_STEPS } from "../src/recordings/papers";

export interface Recorded {
  /** The data file's name under src/recordings/, without `.json`. */
  name: string;
  recording: Recording;
  /** The file's contents. */
  json: string;
  /** How long the physics took, in seconds. */
  seconds: number;
}

/** Every Recording, freshly made: all of them, or only those named. */
export function recordAll(only: string[] = []): Recorded[] {
  const unknown = only.filter((name) => !(name in RECORDED_STEPS));
  if (unknown.length) throw new Error(`no recorded Step named ${unknown.join(", ")}; known: ${Object.keys(RECORDED_STEPS).join(", ")}`);
  return Object.entries(RECORDED_STEPS)
    .filter(([name]) => !only.length || only.includes(name))
    .map(([name, step]) => {
      const started = performance.now();
      const { before, after, lift } = step();
      const recording = record(before, after, lift);
      return { name, recording, json: serializeRecording(recording), seconds: (performance.now() - started) / 1000 };
    });
}
