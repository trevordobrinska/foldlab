// The three prototype Folds and their push specs, in frame units (the
// 0..100 square of the canvas, y down; see frame.ts). Only `push` is read
// by the recognizer. Its numbers are derived from the 3D scene: the grab
// point is the Fold's moving point projected through its camera, the axis
// is where that point travels to, and travel is how far. The scene and the
// recognizer therefore always agree. No DOM, no engine.

import { anchor, VIEWS } from "./geometry";
import { makeCamera, projectToFrame } from "./frame";
import type { PushSpec } from "./recognize";

export type FoldType = "squash" | "insideReverse" | "sink";

export interface FoldGeometry {
  type: FoldType;
  name: string;
  /** One line of child-facing instruction, in his hand's terms. */
  prompt: string;
  push: PushSpec;
}

/** The grab zone's radius, a thumb-print or so of the frame. */
export const GRAB_RADIUS = 14;

/** The push spec for a Fold, read off its 3D scene: where its moving point
 *  starts in the frame, the direction to where it ends, and the distance. */
export function derivePush(type: FoldType, holdMs?: number): PushSpec {
  // The frame is aspect-independent, so a square canvas is as good as any.
  const camera = makeCamera(VIEWS[type], 1);
  const from = projectToFrame(camera, anchor(type, 0), 1, 1);
  const to = projectToFrame(camera, anchor(type, 1), 1, 1);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const travel = Math.hypot(dx, dy);
  const spec: PushSpec = {
    grab: { x: from.x, y: from.y, radius: GRAB_RADIUS },
    axis: { x: dx / travel, y: dy / travel },
    travel,
  };
  return holdMs ? { ...spec, holdMs } : spec;
}

export const FOLDS: Record<FoldType, FoldGeometry> = {
  squash: {
    type: "squash",
    name: "Squash",
    prompt: "Press the standing flap down flat.",
    push: derivePush("squash"),
  },
  insideReverse: {
    type: "insideReverse",
    name: "Inside reverse",
    prompt: "Push the point in between the layers.",
    push: derivePush("insideReverse"),
  },
  sink: {
    type: "sink",
    // A closed sink (GLOSSARY.md): the point is pushed in without opening
    // the model. Same direction as the squash, so the hold sets it apart.
    name: "Closed sink",
    prompt: "Press and hold the point, then push it down inside.",
    push: derivePush("sink", 400),
  },
};

export const FOLD_ORDER: FoldType[] = ["squash", "insideReverse", "sink"];
