// Building a Model file on Dad's computer: a recipe (name, Source, Paper and
// Steps of engine calls) is replayed Fold by Fold in the engine, every Fold
// recorded, and the Paper after each Step kept as a FOLD frame. Only a recipe
// that replays all the way through becomes a Model (ADR 0003); otherwise the
// answer says where it stopped and why, which is a Failed import's reason.
//
// This is Import's side of the format (ticket 08 calls `buildModel` with what
// the Claude API returned). It runs the engine and the physics, so the page
// must never import it.

import { fold, newPaper, seenFaces, type FoldResult, type Paper, type Refusal } from "../engine/paper";
import { record } from "../motion/record";
import type { Recording } from "../motion/recording";
import { MODEL_VERSION, parseRecipe, type FoldCall, type Model, type ModelFold, type ModelStep, type PaperFrame } from "./model";

export type Built =
  | { ok: true; model: Model }
  /** The recipe itself is malformed; the engine was never run. */
  | { ok: false; reason: "invalid"; problems: string[] }
  /** The engine refused a Fold in the written order. `step` and `fold` count from 1, as the Source numbers them. */
  | { ok: false; reason: "refused"; step: number; fold: number; refusal: Refusal }
  /** The Fold replayed, but its motion could not be recorded. */
  | { ok: false; reason: "unrecordable"; step: number; fold: number; message: string };

/**
 * A Step with more Folds than this is recorded in the written order only:
 * every order of n Folds is n × 2^(n-1) Recordings.
 */
export const MOST_FOLDS_IN_ANY_ORDER = 4;

/** One engine call made on a Paper. */
export function replay(paper: Paper, call: FoldCall): FoldResult {
  return fold(paper, { line: call.line, flap: call.flap, assignment: call.type === "valley" ? "V" : "M", layers: call.layers });
}

/** The Model a recipe makes, or why it makes none. `recipe` may be anything (it may come from an AI). */
export function buildModel(recipe: unknown): Built {
  const parsed = parseRecipe(recipe);
  if (!parsed.ok) return { ok: false, reason: "invalid", problems: parsed.problems };
  const { id, name, source, paper: sheet, steps: recipeSteps } = parsed.value;

  let paper = newPaper({ width: sheet.width, height: sheet.height });
  const steps: ModelStep[] = [];
  for (const [s, step] of recipeSteps.entries()) {
    // The written order: this is the replay that decides whether the Model is good.
    const folds: ModelFold[] = [];
    const written: Paper[] = [paper];
    for (const [f, call] of step.folds.entries()) {
      const result = replay(paper, call);
      if (!result.ok) return { ok: false, reason: "refused", step: s + 1, fold: f + 1, refusal: result.refusal };
      try {
        const after = Array.from({ length: f }, (_, i) => i);
        folds.push({ call: { ...call }, recordings: [{ after, recording: record(paper, result.paper, result.lift) }] });
      } catch (error) {
        return { ok: false, reason: "unrecordable", step: s + 1, fold: f + 1, message: error instanceof Error ? error.message : String(error) };
      }
      paper = result.paper;
      written.push(paper);
    }
    // Every other order, when the Step's Folds can be made in any order.
    for (const { fold: f, after, recording } of otherOrders(step.folds, written)) folds[f].recordings.push({ after, recording });
    steps.push({ text: step.text, folds, frame: frameOf(paper) });
  }
  return { ok: true, model: { version: MODEL_VERSION, id, name, source: { name: source.name }, paper: { ...sheet }, steps } };
}

/**
 * The Recordings of a Step's Folds from every state of the Step off the
 * written order, when its Folds are symmetric: every order replays, and
 * every order of the same Folds leaves the Paper looking the same. Otherwise
 * none: the Step is then made in the written order only. `written[n]` is the
 * Paper after the first n Folds in the written order.
 */
function otherOrders(calls: FoldCall[], written: Paper[]): { fold: number; after: number[]; recording: Recording }[] {
  if (calls.length < 2 || calls.length > MOST_FOLDS_IN_ANY_ORDER) return [];
  const key = (made: number[]) => made.join();
  const isWritten = (made: number[]) => made.every((f, i) => f === i);
  // The Paper after each set of Folds, however it was reached; the written order's own Papers first.
  const papers = new Map<string, Paper>(written.map((paper, n) => [key(calls.slice(0, n).map((_, i) => i)), paper]));
  const extra: { fold: number; after: number[]; recording: Recording }[] = [];
  let states: number[][] = [[]];
  for (let size = 0; size < calls.length; size++) {
    const next = new Map<string, number[]>();
    for (const made of states) {
      const before = papers.get(key(made))!;
      for (let f = 0; f < calls.length; f++) {
        if (made.includes(f)) continue;
        const all = [...made, f].sort((a, b) => a - b);
        next.set(key(all), all);
        if (isWritten(made) && f === made.length) continue; // already recorded
        const result = replay(before, calls[f]);
        if (!result.ok) return [];
        const known = papers.get(key(all));
        if (known && !looksTheSame(known, result.paper)) return [];
        if (!known) papers.set(key(all), result.paper);
        try {
          extra.push({ fold: f, after: made, recording: record(before, result.paper, result.lift) });
        } catch {
          return [];
        }
      }
    }
    states = [...next.values()];
  }
  return extra;
}

/** Whether two Papers look the same to him: the same faces in the same places, the same sides up, in the same layers. */
function looksTheSame(a: Paper, b: Paper): boolean {
  const look = (paper: Paper) =>
    seenFaces(paper)
      .map((face) => `${face.polygon.map(([x, y]) => `${x.toFixed(6)} ${y.toFixed(6)}`).sort().join("|")} ${face.front} ${face.layer}`)
      .sort()
      .join("\n")
      .replace(/-0\.000000/g, "0.000000");
  return look(a) === look(b);
}

/** A Paper as a FOLD frame. */
export function frameOf(paper: Paper): PaperFrame {
  const { vertices_coords, edges_vertices, edges_assignment, edges_foldAngle, faces_vertices, faceOrders } = paper.graph;
  return structuredClone({
    frame_classes: ["creasePattern"],
    vertices_coords,
    edges_vertices,
    edges_assignment,
    edges_foldAngle,
    faces_vertices,
    faceOrders,
    "foldlab:rootFace": paper.rootFace,
    "foldlab:view": [...paper.view],
  }) as PaperFrame;
}

/** The engine's Paper a FOLD frame holds. */
export function paperOf(frame: PaperFrame): Paper {
  const { "foldlab:rootFace": rootFace, "foldlab:view": view, frame_classes: _, ...graph } = structuredClone(frame);
  return { graph, rootFace, view };
}

/**
 * The Model as the text of its file: indented so a change shows where it is,
 * with every list of plain numbers (a point, a snapshot's positions) on one line.
 */
export function serializeModel(model: Model): string {
  const numbers = /\[\s*(-?[\d.e+-]+(?:,\s*-?[\d.e+-]+)*)\s*\]/g;
  return JSON.stringify(model, null, 1).replace(numbers, (_, list: string) => `[${list.replace(/\s+/g, "")}]`) + "\n";
}
