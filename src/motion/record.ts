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

import { EPSILON } from "../engine/geometry";
import type { Lift, Paper } from "../engine/paper";
import { buildMesh, placeOf, settleStack, type Mesh } from "./mesh";
import { MIN_FRAMES, RECORDING_VERSION, roundCoordinate, type Recording } from "./recording";
import { angleAt, initialState, relax, tuning } from "./solve";
import { add, cross, dot, length, scale, sub, unit, type V3 } from "./vec3";

/** Snapshots over which the hinges are driven from their start angles to their end angles: one per solver step on average. */
const DRIVEN_FRAMES = Math.round(1 / tuning.step);
/**
 * Snapshots at the end over which the paper catches up and is pressed flat.
 * A rigid Fold (a lifted flap) takes twice as many, at the driven snapshots'
 * expense: its tip hangs at the end of a long chain of stiff faces and creases
 * and comes to rest more slowly.
 */
const CATCH_UP_FRAMES = 4;
/** Snapshots per Recording: progress 0, the driven snapshots, then the catch-up. */
export const FRAMES = 1 + DRIVEN_FRAMES + CATCH_UP_FRAMES;

/**
 * The Recording of the Fold that takes `before` to `after`. With a `lift`
 * (a squash), the Recording starts with that flap already standing, as the
 * diagram draws it, and ends at `after` like any other.
 */
export function record(before: Paper, after: Paper, lift?: Lift): Recording {
  if (FRAMES < MIN_FRAMES) throw new Error(`a Recording needs at least ${MIN_FRAMES} snapshots, not ${FRAMES}`);
  const mesh = buildMesh(before, after, lift);
  const catchUp = mesh.rigid ? 2 * CATCH_UP_FRAMES : CATCH_UP_FRAMES;
  const driven = FRAMES - 1 - catchUp;

  const axis = plainFoldAxis(mesh);
  const evenly = Array.from({ length: driven }, (_, k) => (k + 1) / driven);
  const frames = axis ? turn(mesh, axis, driven, catchUp) : sweep(mesh, byTravel(mesh, sweep(mesh, evenly, catchUp), evenly), catchUp);

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

/** The line a plain Fold's flap turns about: a point on it and its unit direction. */
interface Axis {
  point: V3;
  direction: V3;
  /**
   * The height the paper that stays gains from the start layout to the end
   * layout: the stack is centred anew once the flap has changed sides. The
   * line rises with it.
   */
  shift: number;
  /** The mesh vertices along the fold line: on the creases this Fold makes. */
  onLine: number[];
}

/**
 * Snapshots at the start of a plain Fold over which the fold line's vertices
 * are brought onto the line the flap turns about, and at the end over which
 * they take up their finished heights. In a stack each layer's fold-line
 * vertices lie at that layer's own height, off the line; left there while the
 * flap turns, the bars from them into the flap change length (by their
 * distance from the line, at most when the flap stands upright) and the
 * flap's layers cross along the fold line (ticket 14). So they are off the
 * line only while the flap is nearly flat, at either end.
 */
const SEATING_FRAMES = 10;

/**
 * The line a plain Fold turns about, if this Fold is one: a valley or
 * mountain Fold of a flap, which is exactly a rigid turn of the flap about
 * its line (ticket 10: a Fold that can be solved exactly is). It is one when
 * every crease this Fold drives lies on one line, every other crease keeps
 * its angle, and every moving vertex lands at its mirror image across that
 * line. An inside reverse (its spine turns inside out), a squash (its flap
 * is lifted) and a sink (creases invert) are not, and go to the solver.
 *
 * The line's height is where the flap is mirrored between the two layouts,
 * not the flap's own: a flap of a stack turns about the surface it lands on,
 * so that it comes down on top of the stack (or beneath it) with its layers
 * in the finished order.
 */
function plainFoldAxis(mesh: Mesh): Axis | undefined {
  if (mesh.rigid) return undefined;
  const creases = mesh.hinges.filter((h) => h.kind === "crease");
  const driven = creases.filter((h) => h.driven);
  if (!driven.length) return undefined;
  // The layered layouts tilt a facet where layers share a vertex, so an unchanged crease is only nearly so.
  if (creases.some((h) => !h.driven && Math.abs(h.end - h.start) > 0.1)) return undefined;

  const [a, b] = driven[0].edge.map((v) => mesh.start[v]);
  const direction = unit([b[0] - a[0], b[1] - a[1], 0]);
  if (length(direction) < 0.5) return undefined;
  const offLine = (p: V3) => (p[0] - a[0]) * direction[1] - (p[1] - a[1]) * direction[0];
  if (driven.some((h) => h.edge.some((v) => Math.abs(offLine(mesh.start[v])) > EPSILON))) return undefined;

  // The moving vertices are mirrored across the line.
  const travels = mesh.start.map((p, v) => Math.hypot(p[0] - mesh.end[v][0], p[1] - mesh.end[v][1]) > EPSILON);
  const moving = mesh.start.flatMap((_, v) => (travels[v] ? [v] : []));
  if (!moving.length) return undefined;
  for (const v of moving) {
    const s = mesh.start[v];
    const d = offLine(s);
    const mirrored = [s[0] - 2 * d * direction[1], s[1] + 2 * d * direction[0]];
    if (Math.hypot(mirrored[0] - mesh.end[v][0], mirrored[1] - mesh.end[v][1]) > 1e-6) return undefined;
  }
  // A flap mirrored in a line at height h, the paper then moved by `shift`, ends at 2h - start + shift.
  const mean = (vs: number[], of: (v: number) => number) => vs.reduce((sum, v) => sum + of(v), 0) / (vs.length || 1);
  const onLine = [...new Set(driven.flatMap((h) => h.edge))];
  const stays = mesh.start.flatMap((_, v) => (travels[v] || onLine.includes(v) ? [] : [v]));
  const shift = mean(stays, (v) => mesh.end[v][2] - mesh.start[v][2]);
  const height = (mean(moving, (v) => mesh.start[v][2] + mesh.end[v][2]) - shift) / 2;
  return { point: [a[0], a[1], height], direction, shift, onLine };
}

/**
 * The exact motion of a plain Fold: over the `driven` snapshots the flap is
 * turned rigidly about its line through half a turn (its corner at a steady
 * speed), coming down on the paper it lands on (or beneath it) where the
 * engine's finished layout has it. Meanwhile the paper that stays moves to
 * its finished heights, a steady share per snapshot, the line rising with
 * it; and the fold line's vertices ride on the line, but for the first and
 * last SEATING_FRAMES, where they leave and reach the layouts' heights. With
 * them ride the vertices the layouts bundle with them at the same folded
 * points (the edges and corners of the layers the crease wraps: ticket 15),
 * and the rest of the paper that stays gives way to those as it does in a
 * layout (`settleStack`), so its layers keep their order throughout. The
 * turn ends at the finished layout, so the `catchUp` snapshots have nothing
 * left to settle: the paper lies still through them, as the hand rests on
 * the finished Fold.
 */
function turn(mesh: Mesh, axis: Axis, driven: number, catchUp: number): V3[][] {
  const { point, direction: u, shift, onLine } = axis;
  const moving = mesh.start.flatMap((p, v) => (Math.hypot(p[0] - mesh.end[v][0], p[1] - mesh.end[v][1]) > EPSILON ? [v] : []));
  const still = mesh.start.flatMap((_, v) => (moving.includes(v) ? [] : [v]));
  // The flap turns toward the side it lands on: over the paper (a valley) or beneath it (a mountain).
  const mean = (vs: number[]) => vs.reduce((sum, v) => sum + mesh.end[v][2], 0) / (vs.length || 1);
  const side = Math.sign(mean(moving) - mean(still)) || 1;
  // Each moving vertex: its part along the axis, its arm from the axis, and the arm turned a quarter.
  const arms = moving.map((v) => {
    const r = sub(mesh.start[v], point);
    const along = scale(u, dot(r, u));
    const arm = sub(r, along);
    // Mirrored in the line and moved with the paper, the vertex is this far in height from the finished layout
    // (nothing, but for the layouts' tilts); it is fed in with the shift.
    const short = mesh.end[v][2] - (point[2] - arm[2] + shift);
    return { v, foot: add(point, along), arm, quarter: cross(u, arm), short };
  });
  // Which way the quarter turn lifts the flap is read from where it lies on the flat, not from its height off the line.
  const rise = arms.reduce((sum, { arm }) => sum + cross(u, [arm[0], arm[1], 0])[2], 0);
  const sense = Math.sign(rise) === side ? 1 : -1;
  const eased = (t: number) => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  };
  // With the fold line's vertices go the others lying at the same folded points: the edges and corners of the
  // layers the crease wraps, which the layouts hold at the crease's height at either end.
  const sameHeight = (a: number, b: number) => Math.abs(a - b) < EPSILON;
  const seated = still.filter((v) =>
    onLine.some(
      (l) =>
        placeOf(mesh.start[l]) === placeOf(mesh.start[v]) &&
        (sameHeight(mesh.start[l][2], mesh.start[v][2]) || sameHeight(mesh.end[l][2], mesh.end[v][2])),
    ),
  );
  // The rest of the paper that stays gives way to them, as it does in a layout.
  const travels = mesh.start.map((_, v) => moving.includes(v));
  const fixed = mesh.stack.held.map((held, v) => held || seated.includes(v));
  const frames: V3[][] = [];
  for (let k = 1; k <= driven; k++) {
    const w = k / driven;
    const angle = Math.PI * w;
    const out = mesh.start.map((p, v): V3 => [p[0], p[1], p[2] + w * (mesh.end[v][2] - p[2])]);
    // The fold line's vertices: off the line by their start heights at first, by their finished heights at last.
    const leaving = 1 - eased(k / SEATING_FRAMES);
    const arriving = eased((k - (driven - SEATING_FRAMES)) / SEATING_FRAMES);
    for (const v of seated) {
      out[v][2] = point[2] + w * shift + leaving * (mesh.start[v][2] - point[2]) + arriving * (mesh.end[v][2] - point[2] - shift);
    }
    if (k < driven) settleStack(mesh, out, fixed, travels);
    for (const { v, foot, arm, quarter, short } of arms) {
      const q = add(foot, add(scale(arm, Math.cos(angle)), scale(quarter, sense * Math.sin(angle))));
      out[v] = [q[0], q[1], q[2] + w * (shift + short)];
    }
    frames.push(out);
  }
  for (let j = 0; j < catchUp; j++) frames.push(mesh.end);
  return frames;
}

/**
 * One forward run of the solver from the start: the paper after the hinges
 * have been driven to each of `targets` (fractions of the way from their
 * start to their end angles, increasing, the last 1), stepping no further
 * than the solver's step at a time, then after each of `catchUp` shares of
 * settling at the end.
 */
function sweep(mesh: Mesh, targets: number[], catchUp: number): V3[][] {
  const state = initialState(mesh);
  const angles = (p: number) => (hinge: (typeof mesh.hinges)[number]) => angleAt(hinge, p);
  const out: V3[][] = [];
  let progress = 0;
  for (const wanted of targets) {
    while (progress < wanted) {
      progress = Math.min(wanted, progress + tuning.step);
      relax(mesh, state, angles(progress), tuning.passes);
    }
    out.push(state.positions.map((p) => [...p] as V3));
  }
  for (let k = 0; k < catchUp; k++) {
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
