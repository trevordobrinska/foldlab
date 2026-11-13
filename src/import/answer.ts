// What Import asks the Claude API for, and how its answer becomes a Model
// recipe (model.ts) for the builder to replay. Pure: no files, no network,
// no engine. Dad's computer only; the page never imports this.
//
// A Model can hold valley and mountain Folds today (FoldCall). Claude is
// asked to say honestly when a Source needs any other Fold type, turn over
// and rotate included, rather than to work around it; that Source becomes a
// Failed import naming the Fold types, to retry when a Model can carry them.

import type { ModelRecipe } from "../model/model";

/** The Fold types a Model can carry (FoldCall["type"]). */
const SUPPORTED = ["valley", "mountain"] as const;

/** Every other Fold type of the glossary: Claude names them, and Import fails the Source on them. */
const NOT_YET = [
  "fold-and-unfold",
  "squash",
  "petal",
  "inside-reverse",
  "outside-reverse",
  "rabbit-ear",
  "crimp",
  "pleat",
  "open-sink",
  "closed-sink",
  "swivel",
  "turn-over",
  "rotate",
  "inflate",
] as const;

const POINT = {
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" } },
  required: ["x", "y"],
  additionalProperties: false,
};

/** The answer format, as the JSON schema given to the Claude API's structured outputs. */
export const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    unreadable: {
      type: "string",
      description: "Empty when the Source could be read. Otherwise one sentence saying what could not be made out; then steps is empty.",
    },
    name: { type: "string", description: "The Model's name, such as Cup." },
    source: {
      type: "string",
      description: "Where the Model comes from, as a short credit: Traditional, or the designer or book the Source names.",
    },
    paper: {
      type: "object",
      properties: {
        width: { type: "number" },
        height: { type: "number" },
        front: { type: "string", description: "The colour of the side facing up at the start, as #rrggbb." },
        back: { type: "string", description: "The colour of the other side, as #rrggbb." },
      },
      required: ["width", "height", "front", "back"],
      additionalProperties: false,
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "The Step's instruction in FoldLab's own words." },
          folds: {
            type: "array",
            items: {
              anyOf: [
                {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: [...SUPPORTED] },
                    line: {
                      type: "object",
                      description: "The fold line, through two points.",
                      properties: { from: POINT, to: POINT },
                      required: ["from", "to"],
                      additionalProperties: false,
                    },
                    flap: { ...POINT, description: "A point on the paper that moves, well inside it and off the fold line." },
                    layers: { anyOf: [{ type: "integer" }, { type: "string", enum: ["all"] }] },
                  },
                  required: ["type", "line", "flap", "layers"],
                  additionalProperties: false,
                },
                {
                  type: "object",
                  description: "A Fold of a type that cannot be written as a call yet. Name it and nothing more.",
                  properties: { type: { type: "string", enum: [...NOT_YET] } },
                  required: ["type"],
                  additionalProperties: false,
                },
              ],
            },
          },
        },
        required: ["text", "folds"],
        additionalProperties: false,
      },
    },
  },
  required: ["unreadable", "name", "source", "paper", "steps"],
  additionalProperties: false,
} as const;

/** FoldLab's instructions to Claude: the system prompt of every Import request. */
export const INSTRUCTIONS = `You are reading origami diagrams for FoldLab, an app where a child practises origami on an iPad without paper. The paper on his screen waits for him to make each fold with his finger, so FoldLab needs every Model as an exact sequence of folds that its fold engine can replay. You are given one Source: a diagram, as images or a PDF, that shows how to fold one Model. Turn it into that sequence.

Your answer is checked, not trusted: FoldLab's engine replays every fold you write on a simulated sheet, and the Model is published only if every one of them can be made. A fold placed a little wrong may still replay and then teach him the wrong thing, so work the geometry out exactly (where a corner lands, where a line meets an edge) rather than estimating it from the picture. Use full precision in your numbers; do not round them.

Steps and Folds
- A Step is one numbered step exactly as the Source shows it. Keep the Source's Steps one for one and in order: do not merge, split, add or skip any.
- A Step is made of one or more Folds. A Fold is one action on the paper. When a Step says to repeat on the other side or behind, write the repeated folds out as real Folds of that Step.
- Each Step has a text: the instruction he reads under the paper. Write it in your own words, as one or two short plain sentences a child can follow. Never copy or closely paraphrase wording from the Source: Sources are private and often copyrighted, and FoldLab publishes only its own words.

The paper and its coordinates
- The paper starts flat and unfolded. A square is width 1 and height 1; for a rectangle, make the shorter side 1.
- Points are (x, y) as he sees the paper lying in front of him: x runs to the right and y runs up, the bottom left corner of the unfolded sheet is (0, 0) and the top right corner is (width, height). Draw the Source's first diagram in these coordinates and keep to its orientation.
- The paper does not move between Folds: the part that is not folded stays where it is, and later Folds are written in the same coordinates.
- paper.front is the colour of the side facing up at the start and paper.back the colour of the other side, as #rrggbb. Take them from the Source; if it shows a white side and a coloured side, use #fbf7ee for white.

How a Fold is written
- type "valley" brings the flap up toward him and lands it on top. type "mountain" takes the flap behind and lands it underneath.
- line is the fold line, given by two points it passes through (it need not stop at the paper's edge).
- flap is a point on the part of the paper that moves, as it lies before the Fold. Choose it well inside that part and away from the line and the edges.
- layers is how many layers under the flap point to take, counted from the side the flap moves toward: from the top for a valley, from underneath for a mountain. Layers joined to those along a folded edge on the flap's side of the line always come with them. Use 1 for a single flap, a number for that many, and "all" to fold everything under the point.
- A flap folded behind, such as the back flap of a pair, is a mountain Fold of the bottom layer, written from the front. Do not turn the paper over to make it unless the Source does.

Fold types that cannot be written yet
Only valley and mountain Folds can be written as calls today. If the Source uses anything else (a crease that is folded and unfolded, turning the paper over, rotating it, a squash, a reverse fold, a sink, opening or inflating the Model, and so on), do not approximate it, leave it out or work around it. Write that Fold with only its type, chosen from the list in the answer format, and still write every other Step as well as you can. FoldLab will hold the Source back until its engine can carry that Fold type.

If you cannot read it
If the Source is not an origami diagram, or a part you need cannot be made out, do not guess. Say what is wrong in "unreadable" in one sentence and leave steps empty. Otherwise leave "unreadable" empty.`;

/** What is asked alongside the Source's pages. */
export const QUESTION = "This is the Source. Read every Step, then answer in the answer format.";

/** Why an answer could not become a recipe, before the engine is ever run. */
export type NoRecipe =
  | { kind: "unreadable-answer"; message: string }
  | { kind: "source-unreadable"; message: string }
  | { kind: "unsupported"; message: string; unsupported: { step: number; fold: number; type: string }[] };

type Json = Record<string, unknown>;
const isObject = (x: unknown): x is Json => typeof x === "object" && x !== null && !Array.isArray(x);
const pointOf = (p: unknown): unknown => (isObject(p) ? [p.x, p.y] : p);

/**
 * The Model recipe an answer holds, for the builder to check and replay. The
 * answer's shape is converted, not vouched for: anything missing or
 * malformed is left for `parseRecipe` to list (a Failed import, "invalid").
 * `id` is the Model's id, which comes from the Source's file name.
 */
export function recipeFrom(answer: unknown, id: string): { ok: true; recipe: unknown } | { ok: false; reason: NoRecipe } {
  if (!isObject(answer)) return { ok: false, reason: { kind: "unreadable-answer", message: "Claude's answer is not in the answer format" } };
  if (typeof answer.unreadable === "string" && answer.unreadable.trim()) {
    return { ok: false, reason: { kind: "source-unreadable", message: `Claude could not read the Source: ${answer.unreadable.trim()}` } };
  }
  const steps = Array.isArray(answer.steps) ? answer.steps : [];
  const foldsOf = (step: unknown): unknown[] => (isObject(step) && Array.isArray(step.folds) ? step.folds : []);

  const unsupported = steps.flatMap((step, s) =>
    foldsOf(step).flatMap((fold, f) =>
      isObject(fold) && typeof fold.type === "string" && !(SUPPORTED as readonly string[]).includes(fold.type) ? [{ step: s + 1, fold: f + 1, type: fold.type }] : [],
    ),
  );
  if (unsupported.length) {
    const named = unsupported.map(({ step, fold, type }) => `Step ${step}, Fold ${fold} is a ${type.replace(/-/g, " ")}`).join("; ");
    return { ok: false, reason: { kind: "unsupported", message: `${named}. A Model can only carry valley and mountain Folds yet.`, unsupported } };
  }

  const call = (fold: unknown): unknown => {
    if (!isObject(fold)) return fold;
    const { from, to } = isObject(fold.line) ? fold.line : ({} as Json);
    const vector = isObject(from) && isObject(to) ? [Number(to.x) - Number(from.x), Number(to.y) - Number(from.y)] : undefined;
    const made: Json = { type: fold.type, line: { origin: pointOf(from), vector }, flap: pointOf(fold.flap) };
    if (fold.layers !== 1 && fold.layers !== undefined) made.layers = fold.layers;
    return made;
  };
  const recipe: Record<keyof ModelRecipe, unknown> = {
    id,
    name: answer.name,
    source: { name: answer.source },
    paper: answer.paper,
    steps: steps.map((step) => (isObject(step) ? { text: step.text, folds: foldsOf(step).map(call) } : step)),
  };
  return { ok: true, recipe };
}
