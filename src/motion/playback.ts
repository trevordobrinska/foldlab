// Playing a Recording: the paper's shape at any progress from 0 to 1, by
// blending the two nearest snapshots. This is all the iPad does while his
// finger moves the paper, so it carries no physics (it must not import
// solve.ts, hinge.ts, mesh.ts or motion.ts) and makes no garbage per frame
// when given a buffer to write into.

import { RECORDING_VERSION, type Recording } from "./recording";

export interface Playback {
  readonly recording: Recording;
  readonly vertexCount: number;
  readonly frameCount: number;
  /**
   * The paper's positions at `progress` (clamped to 0..1): vertexCount × 3
   * numbers, x y z per vertex, written into `out` (or a new Float32Array).
   */
  at(progress: number, out?: Float32Array): Float32Array;
  /** The position of vertex `v` at `progress`, as x y z. */
  vertexAt(progress: number, v: number): [number, number, number];
  /** Snapshot `k` as recorded, x y z per vertex. */
  frame(k: number): number[];
}

export function playbackOf(recording: Recording): Playback {
  if (recording.version !== RECORDING_VERSION) {
    throw new Error(`recording version ${recording.version} is not ${RECORDING_VERSION}`);
  }
  const { frameCount, vertexCount, positions } = recording;
  const stride = vertexCount * 3;
  if (positions.length !== frameCount * stride) throw new Error("recording positions do not match its frame and vertex counts");

  /** The two snapshots around `progress` and how far between them it lies. */
  const locate = (progress: number) => {
    const p = Math.min(1, Math.max(0, progress));
    const scaled = p * (frameCount - 1);
    const k = Math.min(frameCount - 2, Math.floor(scaled));
    return { a: k * stride, b: (k + 1) * stride, t: scaled - k };
  };

  return {
    recording,
    vertexCount,
    frameCount,
    at(progress, out = new Float32Array(stride)) {
      const { a, b, t } = locate(progress);
      const s = 1 - t;
      for (let i = 0; i < stride; i++) out[i] = positions[a + i] * s + positions[b + i] * t;
      return out;
    },
    vertexAt(progress, v) {
      const { a, b, t } = locate(progress);
      const s = 1 - t;
      const i = v * 3;
      return [
        positions[a + i] * s + positions[b + i] * t,
        positions[a + i + 1] * s + positions[b + i + 1] * t,
        positions[a + i + 2] * s + positions[b + i + 2] * t,
      ];
    },
    frame(k) {
      return positions.slice(k * stride, (k + 1) * stride);
    },
  };
}
