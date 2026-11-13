// Recording one Fold: the paper physics run forward from progress 0 to 1,
// and its shape kept at evenly spaced snapshots. The same bar-and-hinge mesh
// and solver as motion.ts, stepped the same way, with two things a recording
// needs that a live finger didn't get:
//
// - Snapshots are spaced by how far the paper moves, not by how far the
//   hinges have turned. A first sweep drives the hinges evenly and measures
//   the paper's travel at every step; the sweep that is kept drives them to
//   the angles at which the paper has moved an equal share of that travel.
//   So the tip's fast swing gets the most snapshots, where blending two of
//   them would otherwise cut corners, and his finger moves the paper at a
//   steady speed.
// - The paper lags the hand. Driven step by step, the solver trails its
//   target by a few steps, so if the hinges reached their end angles at the
//   last snapshot the paper would still be short of the finished Paper and
//   jump there when pressed flat. Here the hinges arrive a few snapshots
//   early and the paper spends the last ones catching up, pressed flat a
//   little at a time (the hand smoothing the fold down).
//
// The first snapshot is the Paper as it is now and the last is the engine's
// finished Paper, exactly as the mesh lays them out: the engine stays the
// source of truth for both ends. This runs on the computer, never on the iPad.

import type { Paper } from "../engine/paper";
import { buildMesh, type Mesh } from "./mesh";
import { MIN_FRAMES, RECORDING_VERSION, roundCoordinate, type Recording } from "./recording";
import { initialState, relax, tuning } from "./solve";
import { length, sub, type V3 } from "./vec3";

/** Snapshots over which the hinges are driven from their start angles to their end angles: one per solver step on average. */
const DRIVEN_FRAMES = Math.round(1 / tuning.step);
/** Snapshots at the end over which the paper catches up and is pressed flat. */
const CATCH_UP_FRAMES = 4;
/** Snapshots per Recording: progress 0, the driven snapshots, then the catch-up. */
export const FRAMES = 1 + DRIVEN_FRAMES + CATCH_UP_FRAMES;

/** The Recording of the Fold that takes `before` to `after`. */
export function record(before: Paper, after: Paper): Recording {
  if (FRAMES < MIN_FRAMES) throw new Error(`a Recording needs at least ${MIN_FRAMES} snapshots, not ${FRAMES}`);
  const mesh = buildMesh(before, after);

  const evenly = Array.from({ length: DRIVEN_FRAMES }, (_, k) => (k + 1) / DRIVEN_FRAMES);
  const frames = sweep(mesh, byTravel(mesh, sweep(mesh, evenly), evenly));

  const positions: number[] = [];
  const keep = (frame: V3[]) => frame.forEach((p) => positions.push(roundCoordinate(p[0]), roundCoordinate(p[1]), roundCoordinate(p[2])));
  keep(mesh.start);
  frames.slice(0, -1).forEach(keep);
  keep(mesh.end);

  return {
    version: RECORDING_VERSION,
    paperVertexCount: mesh.paperVertexCount,
    vertexCount: mesh.start.length,
    frameCount: FRAMES,
    positions,
    triangles: mesh.triangles.flat(),
    triangleFace: [...mesh.triangleFace],
    edges: mesh.edges.map(({ chain, assignment, folded }) => ({ chain: [...chain], assignment, folded })),
    view: [...after.view] as Recording["view"],
  };
}

/**
 * One forward run of the solver from the start: the paper after the hinges
 * have been driven to each of `targets` (fractions of the way from their
 * start to their end angles, increasing, the last 1), stepping no further
 * than the solver's step at a time, then after each of the CATCH_UP_FRAMES
 * shares of settling at the end.
 */
function sweep(mesh: Mesh, targets: number[]): V3[][] {
  const state = initialState(mesh);
  const angles = (p: number) => (hinge: (typeof mesh.hinges)[number]) => hinge.start + (hinge.end - hinge.start) * p;
  const out: V3[][] = [];
  let progress = 0;
  for (const wanted of targets) {
    while (progress < wanted) {
      progress = Math.min(wanted, progress + tuning.step);
      relax(mesh, state, angles(progress), tuning.passes);
    }
    out.push(state.positions.map((p) => [...p] as V3));
  }
  for (let k = 0; k < CATCH_UP_FRAMES; k++) {
    relax(mesh, state, angles(1), Math.round(tuning.settlePasses / CATCH_UP_FRAMES), true);
    out.push(state.positions.map((p) => [...p] as V3));
  }
  return out;
}

/**
 * Targets at which the paper has moved an equal share of its travel: from
 * `frames` (a sweep over `targets`), the travel to each is the summed
 * furthest vertex move between neighbours, and the targets handed back
 * split the whole evenly, by linear interpolation. The last stays 1.
 */
function byTravel(mesh: Mesh, frames: V3[][], targets: number[]): number[] {
  const travel = [0];
  let previous = mesh.start;
  for (const frame of frames.slice(0, targets.length)) {
    let furthest = 0;
    frame.forEach((p, v) => (furthest = Math.max(furthest, length(sub(p, previous[v])))));
    travel.push(travel[travel.length - 1] + furthest);
    previous = frame;
  }
  const total = travel[travel.length - 1];
  const at = [0, ...targets];
  return targets.map((_, j) => {
    if (j === targets.length - 1) return 1;
    const wanted = (total * (j + 1)) / targets.length;
    let k = 1;
    while (travel[k] < wanted) k++;
    const f = (wanted - travel[k - 1]) / (travel[k] - travel[k - 1] || 1);
    return at[k - 1] + (at[k] - at[k - 1]) * f;
  });
}

/** The Recording as the JSON written to its data file: one line per field, one line per snapshot, so a change shows where it is. */
export function serializeRecording(recording: Recording): string {
  const { positions, edges, ...scalars } = recording;
  const stride = recording.vertexCount * 3;
  const rows: string[] = [];
  for (let k = 0; k < recording.frameCount; k++) {
    rows.push("    " + JSON.stringify(positions.slice(k * stride, (k + 1) * stride)).slice(1, -1));
  }
  const fields = Object.entries(scalars).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  fields.push(`  "edges": [\n${edges.map((edge) => "    " + JSON.stringify(edge)).join(",\n")}\n  ]`);
  fields.push(`  "positions": [\n${rows.join(",\n")}\n  ]`);
  return `{\n${fields.join(",\n")}\n}\n`;
}
