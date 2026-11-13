// The data format of a Recording: one Fold worked out ahead of time as a
// short series of snapshots of the paper from progress 0 to 1, plus the
// mesh they are snapshots of. Made on the computer (record.ts), played on
// the iPad (playback.ts), so this module carries no physics: types, two
// constants and the rounding, nothing else.
//
// A Recording is the in-between frames of one Step. It is laid out the way
// FOLD lays out a frame (topology once, positions per frame), so when Models
// are stored as FOLD with one frame per Step, a Step's frame can inherit this
// topology and the snapshots sit alongside as extra frames.

import type { Affine } from "../engine/geometry";
import type { Assignment } from "../engine/paper";

export const RECORDING_VERSION = 1;

/** Positions are rounded to this, in paper units (the Paper is about one unit across). */
export const PRECISION = 1e-5;

/** The fewest snapshots a Recording may have. */
export const MIN_FRAMES = 51;

/** An edge of the Paper, for drawing. */
export interface RecordedEdge {
  /** The mesh vertices along the edge, end to end. */
  chain: number[];
  assignment: Assignment;
  /** True when the edge is folded flat at the start or the end of the Fold. */
  folded: boolean;
}

export interface Recording {
  version: typeof RECORDING_VERSION;
  /** Mesh vertices 0..paperVertexCount-1 are the Paper's own; the rest are face centres and subdivision points. */
  paperVertexCount: number;
  vertexCount: number;
  /** Snapshots, evenly spaced from progress 0 (the first) to 1 (the last). */
  frameCount: number;
  /**
   * frameCount × vertexCount × 3 numbers: snapshot by snapshot, vertex by
   * vertex, x y z in the engine's folded frame (`view` maps x and y to what
   * he sees; z is toward the root face's front). Rounded to PRECISION.
   */
  positions: number[];
  /** Three vertex indices per triangle, wound with the paper's front side counter-clockwise. */
  triangles: number[];
  /** The Paper face (after the Fold) each triangle belongs to. */
  triangleFace: number[];
  edges: RecordedEdge[];
  /** The Paper's view after the Fold: folded-frame x and y to what he sees. */
  view: Affine;
}

/** A coordinate rounded to PRECISION, as the shortest number that reads back the same (never -0). */
export function roundCoordinate(x: number): number {
  return Number(x.toFixed(5)) + 0;
}
