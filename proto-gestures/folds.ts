// Canned geometry for the three prototype Folds, in paper units (an SVG
// viewBox of 0..100 on both axes, y down). Pure data: no DOM, no engine.
// Only `push` is read by the recognizer; `paper.ts` derives its drawing
// from the same numbers.

import type { PushSpec } from "./recognize";

export type FoldType = "squash" | "insideReverse" | "sink";

export interface FoldGeometry {
  type: FoldType;
  name: string;
  /** One line of child-facing instruction, in his hand's terms. */
  prompt: string;
  push: PushSpec;
}

export const FOLDS: Record<FoldType, FoldGeometry> = {
  squash: {
    type: "squash",
    name: "Squash",
    prompt: "Press the standing flap down flat.",
    push: {
      grab: { x: 50, y: 18, radius: 14 },
      axis: { x: 0, y: 1 },
      travel: 32,
    },
  },
  insideReverse: {
    type: "insideReverse",
    name: "Inside reverse",
    prompt: "Push the point in between the layers.",
    push: {
      grab: { x: 78, y: 22, radius: 14 },
      // Down and a little back: 1 across for every 3 down.
      axis: { x: -1 / Math.hypot(1, 3), y: 3 / Math.hypot(1, 3) },
      travel: 36,
    },
  },
  sink: {
    type: "sink",
    // A closed sink (GLOSSARY.md): the point is pushed in without opening
    // the model. Same direction as the squash, so the hold sets it apart.
    name: "Closed sink",
    prompt: "Press and hold the point, then push it down inside.",
    push: {
      grab: { x: 50, y: 18, radius: 14 },
      axis: { x: 0, y: 1 },
      travel: 36,
      holdMs: 400,
    },
  },
};

export const FOLD_ORDER: FoldType[] = ["squash", "insideReverse", "sink"];
