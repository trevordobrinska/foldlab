// The Model file: one Model of the Library as data. Its name, its Source,
// its Paper, and its Steps; each Step holds its text, its Folds as engine
// calls with the Recordings of each, and the Paper after it as a FOLD frame
// (crease pattern and layer order). Written on Dad's computer by Import
// (build.ts replays the calls in the engine), read on the iPad by the player.
//
// This module is the iPad's side of the format: types and checking only. It
// must never import the engine or the physics (types are erased).

import type { Affine, Line, Point } from "../engine/geometry";
import type { Assignment } from "../engine/paper";
import { RECORDING_VERSION, type Recording } from "../motion/recording";

export const MODEL_VERSION = 1;

/** The Fold types a Model can carry: the one list the format, its checks and Import's answer format all read. */
export const FOLD_CALL_TYPES = ["valley", "mountain"] as const;

/**
 * One Fold as a call to the engine, described as he sees the Paper (x right,
 * y up) at the moment it is made. The Fold types the engine can replay and
 * the recorder can record for a Model today: valley and mountain.
 */
export type FoldCall = {
  type: (typeof FOLD_CALL_TYPES)[number];
  /** The fold line. */
  line: Line;
  /** A point on the flap to fold. */
  flap: Point;
  /** How many layers under `flap` to take (the engine's FoldSpec.layers). Default 1. */
  layers?: number | "all";
};

/** Where a Model's instructions came from. Only its name is published (ADR 0002). */
export interface ModelSource {
  name: string;
}

/** The Paper a Model starts from: its shape and its two sides. */
export interface ModelPaper {
  width: number;
  height: number;
  /** The colour of the side facing him when the Model starts, as #rrggbb. */
  front: string;
  /** The colour of the other side. */
  back: string;
}

/**
 * A Paper as a FOLD frame: the crease pattern with its fold angles and layer
 * order (the engine's Paper, losslessly, so the engine can pick it up again).
 */
export interface PaperFrame {
  frame_classes: ["creasePattern"];
  vertices_coords: Point[];
  edges_vertices: [number, number][];
  edges_assignment: Assignment[];
  edges_foldAngle: number[];
  faces_vertices: number[][];
  faceOrders: [number, number, 1 | -1][];
  /** The face the flat folding is rooted at. */
  "foldlab:rootFace": number;
  /** Folded coordinates to what he sees. */
  "foldlab:view": Affine;
}

/** One Fold's motion, from one state of its Step. */
export interface RecordedFold {
  /**
   * The Step's other Folds already made when this Recording starts, as their
   * places in the Step (from 0), ascending. A Recording starts from the Paper
   * as those Folds left it, so the same Fold made first and made second are
   * two Recordings.
   */
  after: number[];
  /** From the Paper before the Fold (progress 0) to the Paper after it (1). */
  recording: Recording;
}

export interface ModelFold {
  call: FoldCall;
  /**
   * The Fold's motion, once for every state of the Step it may be made in.
   * Always there: the written order (after every Fold before it in the Step
   * and none after it). When the Step's Folds may be made in any order
   * (symmetric Folds), every other state is there too.
   */
  recordings: RecordedFold[];
}

export interface ModelStep {
  /** The Step's text: what he reads under the paper, in FoldLab's own words. */
  text: string;
  /** The Step's Folds, in the order the Source gives them (the written order). */
  folds: ModelFold[];
  /** The Paper once every Fold of the Step is made. */
  frame: PaperFrame;
}

export interface Model {
  version: typeof MODEL_VERSION;
  /** The Model's name in file names and saved progress: lower-case letters, digits and dashes. */
  id: string;
  name: string;
  source: ModelSource;
  paper: ModelPaper;
  steps: ModelStep[];
}

/** How many Folds a Model has, over all its Steps. */
export const foldCount = (model: Model): number => model.steps.reduce((sum, step) => sum + step.folds.length, 0);

/** A Model before the engine has replayed it: what Import gets from a Source. */
export interface ModelRecipe {
  id: string;
  name: string;
  source: ModelSource;
  paper: ModelPaper;
  steps: { text: string; folds: FoldCall[] }[];
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; problems: string[] };

/** Checks data read from a Model file. Every problem found is listed. */
export function parseModel(data: unknown): Parsed<Model> {
  const problems: string[] = [];
  if (!isObject(data)) return { ok: false, problems: ["not a Model file"] };
  if (data.version !== MODEL_VERSION) problems.push(`version is ${String(data.version)}, not ${MODEL_VERSION}`);
  header(data, problems);
  const before = problems.length;
  steps(data.steps, problems, (fold, where, place, count) => {
    if (!isObject(fold)) return void problems.push(`${where} is not a Fold`);
    call(fold.call, where, problems);
    recordings(fold.recordings, where, place, count, problems);
  });
  if (problems.length === before) (data as unknown as Model).steps.forEach((step, s) => ways(step, `Step ${s + 1}`, problems));
  if (Array.isArray(data.steps)) {
    data.steps.forEach((step, s) => isObject(step) && frame(step.frame, `Step ${s + 1}`, problems));
  }
  return problems.length ? { ok: false, problems } : { ok: true, value: data as unknown as Model };
}

/** Checks a recipe (which may come from an AI) before the engine sees it. */
export function parseRecipe(data: unknown): Parsed<ModelRecipe> {
  const problems: string[] = [];
  if (!isObject(data)) return { ok: false, problems: ["not a Model recipe"] };
  header(data, problems);
  steps(data.steps, problems, (fold, where) => call(fold, where, problems));
  return problems.length ? { ok: false, problems } : { ok: true, value: data as unknown as ModelRecipe };
}

// --- The checks -------------------------------------------------------------

/** Data of unknown shape that is at least an object (not an array, not null). */
export type Json = Record<string, unknown>;
export const isObject = (x: unknown): x is Json => typeof x === "object" && x !== null && !Array.isArray(x);
const isText = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
const isNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isPoint = (x: unknown): x is Point => Array.isArray(x) && x.length === 2 && x.every(isNumber);
const isCount = (x: unknown): x is number => Number.isInteger(x) && (x as number) > 0;
const isIndexBelow = (n: number) => (x: unknown) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < n;
const isColour = (x: unknown) => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x);

function header(data: Json, problems: string[]) {
  if (typeof data.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.id)) {
    problems.push("id must be lower-case letters, digits and dashes");
  }
  if (!isText(data.name)) problems.push("the Model has no name");
  if (!isObject(data.source) || !isText(data.source.name)) problems.push("the Model has no Source");
  const paper = data.paper;
  if (!isObject(paper)) return void problems.push("the Model has no Paper");
  if (!isNumber(paper.width) || !isNumber(paper.height) || paper.width <= 0 || paper.height <= 0) {
    problems.push("the Paper needs a width and a height above 0");
  }
  if (!isColour(paper.front) || !isColour(paper.back)) problems.push("the Paper's two sides each need a colour like #e9a65e");
}

function steps(list: unknown, problems: string[], checkFold: (fold: unknown, where: string, place: number, count: number) => void) {
  if (!Array.isArray(list) || list.length === 0) return void problems.push("the Model has no Steps");
  list.forEach((step, s) => {
    const where = `Step ${s + 1}`;
    if (!isObject(step)) return void problems.push(`${where} is not a Step`);
    if (!isText(step.text)) problems.push(`${where} has no text`);
    const { folds } = step;
    if (!Array.isArray(folds) || folds.length === 0) return void problems.push(`${where} has no Folds`);
    folds.forEach((fold, f) => checkFold(fold, `${where}, Fold ${f + 1}`, f, folds.length));
  });
}

function call(data: unknown, where: string, problems: string[]) {
  if (!isObject(data)) return void problems.push(`${where} has no engine call`);
  if (!(FOLD_CALL_TYPES as readonly unknown[]).includes(data.type)) {
    return void problems.push(`${where}: ${JSON.stringify(data.type)} is not a Fold type a Model can hold yet (${FOLD_CALL_TYPES.join(", ")})`);
  }
  const line = data.line;
  if (!isObject(line) || !isPoint(line.origin) || !isPoint(line.vector)) {
    problems.push(`${where}: the line needs an origin and a vector`);
  } else if (Math.hypot(line.vector[0], line.vector[1]) < 1e-6) {
    problems.push(`${where}: the line has no direction`);
  }
  if (!isPoint(data.flap)) problems.push(`${where}: flap must be a point`);
  if (data.layers !== undefined && data.layers !== "all" && !isCount(data.layers)) {
    problems.push(`${where}: layers must be a whole number above 0, or "all"`);
  }
}

/** A Fold's Recordings: each from a state of the Step that can be, the written order among them. */
function recordings(list: unknown, where: string, place: number, count: number, problems: string[]) {
  if (!Array.isArray(list) || list.length === 0) return void problems.push(`${where} has no Recording`);
  const isOther = (x: unknown) => isIndexBelow(count)(x) && x !== place;
  const states = new Set<string>();
  for (const entry of list) {
    if (!isObject(entry)) return void problems.push(`${where} has no Recording`);
    const { after } = entry;
    if (!Array.isArray(after) || !after.every(isOther) || after.some((x, i) => i > 0 && x <= after[i - 1])) {
      problems.push(`${where}: a Recording does not say which of the Step's other Folds it comes after`);
    } else if (states.has(after.join())) {
      problems.push(`${where} has two Recordings from the same state of the Step`);
    } else {
      states.add(after.join());
    }
    recording(entry.recording, where, problems);
  }
  if (!states.has(Array.from({ length: place }, (_, i) => i).join())) problems.push(`${where} has no Recording in the written order`);
}

/** Whichever of a Step's Folds he makes first, there must be a Recording to go on with until all are made. */
function ways(step: ModelStep, where: string, problems: string[]) {
  const seen = new Set<string>();
  const pending: number[][] = [[]];
  while (pending.length) {
    const made = pending.pop()!;
    if (made.length === step.folds.length || seen.has(made.join())) continue;
    seen.add(made.join());
    const next = step.folds.flatMap((fold, f) => (!made.includes(f) && fold.recordings.some((r) => r.after.join() === made.join()) ? [f] : []));
    if (!next.length) problems.push(`${where}: after Fold ${made.map((f) => f + 1).join(" and ")} there is no Recording to go on with`);
    for (const f of next) pending.push([...made, f].sort((a, b) => a - b));
  }
}

function recording(data: unknown, where: string, problems: string[]) {
  if (!isObject(data)) return void problems.push(`${where} has no Recording`);
  const bad = (what: string) => void problems.push(`${where}: its Recording ${what}`);
  if (data.version !== RECORDING_VERSION) return bad(`is version ${String(data.version)}, not ${RECORDING_VERSION}`);
  const { vertexCount, frameCount, paperVertexCount, positions, triangles, triangleFace, edges, view } = data;
  if (!isCount(vertexCount) || !isCount(frameCount) || frameCount < 2) return bad("needs vertices and at least two snapshots");
  if (!isCount(paperVertexCount) || paperVertexCount > vertexCount) bad("has a wrong count of the Paper's own vertices");
  if (!Array.isArray(positions) || positions.length !== frameCount * vertexCount * 3 || !positions.every(isNumber)) {
    bad("has positions that do not match its snapshot and vertex counts");
  }
  if (!Array.isArray(triangles) || triangles.length === 0 || triangles.length % 3 !== 0 || !triangles.every(isIndexBelow(vertexCount))) {
    bad("has triangles that are not triples of its vertices");
  } else if (!Array.isArray(triangleFace) || triangleFace.length !== triangles.length / 3) {
    bad("does not say which face each triangle belongs to");
  }
  const isEdge = (edge: unknown) =>
    isObject(edge) && Array.isArray(edge.chain) && edge.chain.length >= 2 && edge.chain.every(isIndexBelow(vertexCount)) && isAssignment(edge.assignment);
  if (!Array.isArray(edges) || !edges.every(isEdge)) bad("has edges that are not chains of its vertices");
  if (!isAffine(view)) bad("has no view");
}

const isAssignment = (x: unknown) => x === "B" || x === "V" || x === "M" || x === "F";
const isAffine = (x: unknown) => Array.isArray(x) && x.length === 6 && x.every(isNumber);

function frame(data: unknown, where: string, problems: string[]) {
  if (!isObject(data)) return void problems.push(`${where} has no FOLD frame`);
  const bad = (what: string) => void problems.push(`${where}: its FOLD frame ${what}`);
  const { vertices_coords: vertices, edges_vertices: edges, edges_assignment, edges_foldAngle, faces_vertices: faces, faceOrders } = data;
  if (!Array.isArray(vertices) || vertices.length < 3 || !vertices.every(isPoint)) return bad("has no vertices");
  const isVertex = isIndexBelow(vertices.length);
  if (!Array.isArray(edges) || !edges.every((e) => Array.isArray(e) && e.length === 2 && e.every(isVertex))) return bad("has edges that do not join its vertices");
  if (!Array.isArray(edges_assignment) || edges_assignment.length !== edges.length || !edges_assignment.every(isAssignment)) {
    bad("needs one assignment per edge");
  }
  if (!Array.isArray(edges_foldAngle) || edges_foldAngle.length !== edges.length || !edges_foldAngle.every(isNumber)) {
    bad("needs one fold angle per edge");
  }
  if (!Array.isArray(faces) || faces.length === 0 || !faces.every((f) => Array.isArray(f) && f.length >= 3 && f.every(isVertex))) {
    return bad("has faces that are not loops of its vertices");
  }
  const isFace = isIndexBelow(faces.length);
  const isOrder = (o: unknown) => Array.isArray(o) && o.length === 3 && isFace(o[0]) && isFace(o[1]) && (o[2] === 1 || o[2] === -1);
  if (!Array.isArray(faceOrders) || !faceOrders.every(isOrder)) bad("has a layer order that does not name its faces");
  if (!isFace(data["foldlab:rootFace"])) bad("has no root face");
  if (!isAffine(data["foldlab:view"])) bad("has no view");
}
