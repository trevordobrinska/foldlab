// A Model's Folds as papers for the view (shape.ts): every Recording placed
// about the same point, the middle of the fresh sheet, so the paper stays
// where it lies on the table from one Fold to the next, and the camera can
// be fitted once to everywhere the paper goes. Each paper is built on first
// use and kept. No physics and no engine: Recordings only.

import type { Model } from "../model/model";
import type { Recording } from "../motion/recording";
import { centreOf, steppedPaper, type SteppedPaper } from "./shape";

export interface ModelPapers {
  /** Half the paper's extent on the table over every Fold of the Model, from the origin: x right, z toward him. */
  extent: { x: number; z: number };
  /** The paper for one of the Model's Recordings. */
  of(recording: Recording): SteppedPaper;
  /**
   * The point of the Paper as he sees it (the coordinates of a Fold's call)
   * that lies at the world's origin: a seen point (x, y) is on the table at
   * world (x - centre.x, -(y - centre.y)) in (x, z).
   */
  centre: { x: number; y: number };
}

export function modelPapers(model: Model): ModelPapers {
  const recordings = model.steps.flatMap((step) => step.folds.flatMap((fold) => fold.recordings.map((r) => r.recording)));
  const centre = centreOf(recordings[0]);
  const built = new Map<Recording, SteppedPaper>();
  const of = (recording: Recording) => {
    let paper = built.get(recording);
    if (!paper) built.set(recording, (paper = steppedPaper(recording, centre)));
    return paper;
  };
  const extent = { x: 0, z: 0 };
  for (const recording of recordings) {
    extent.x = Math.max(extent.x, of(recording).extent.x);
    extent.z = Math.max(extent.z, of(recording).extent.z);
  }
  return { extent, of, centre };
}
