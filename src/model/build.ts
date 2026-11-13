// Building a Model file on Dad's computer: a recipe (name, Source, Paper and
// Steps of engine calls) is replayed Fold by Fold in the engine, every Fold
// recorded, and the Paper after each Step kept as a FOLD frame. Only a recipe
// that replays all the way through becomes a Model (ADR 0003); otherwise the
// answer says where it stopped and why, which is a Failed import's reason.
//
// This is Import's side of the format (ticket 08 calls `buildModel` with what
// the Claude API returned). It runs the engine and the physics, so the page
// must never import it.

import { fold, newPaper, type FoldResult, type Paper, type Refusal } from "../engine/paper";
import { record } from "../motion/record";
import { MODEL_VERSION, parseRecipe, type FoldCall, type Model, type ModelStep, type PaperFrame } from "./model";

export type Built =
  | { ok: true; model: Model }
  /** The recipe itself is malformed; the engine was never run. */
  | { ok: false; reason: "invalid"; problems: string[] }
  /** The engine refused a Fold. `step` and `fold` count from 1, as the Source numbers them. */
  | { ok: false; reason: "refused"; step: number; fold: number; refusal: Refusal }
  /** The Fold replayed, but its motion could not be recorded. */
  | { ok: false; reason: "unrecordable"; step: number; fold: number; message: string };

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
    const folds: ModelStep["folds"] = [];
    for (const [f, call] of step.folds.entries()) {
      const result = replay(paper, call);
      if (!result.ok) return { ok: false, reason: "refused", step: s + 1, fold: f + 1, refusal: result.refusal };
      try {
        folds.push({ call: { ...call }, recording: record(paper, result.paper, result.lift) });
      } catch (error) {
        return { ok: false, reason: "unrecordable", step: s + 1, fold: f + 1, message: error instanceof Error ? error.message : String(error) };
      }
      paper = result.paper;
    }
    steps.push({ text: step.text, folds, frame: frameOf(paper) });
  }
  return { ok: true, model: { version: MODEL_VERSION, id, name, source: { name: source.name }, paper: { ...sheet }, steps } };
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
