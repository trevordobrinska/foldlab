// The recipes behind the Library's Model files: each Model as a name, a
// Source, a Paper and Steps of engine calls, which `npm run library` replays
// and records into src/library/<id>.json (build.ts). Read by that script and
// by the tests, never by the page.
//
// STAND-IN. Nobody writes Models by hand (GLOSSARY, Import): this cup is here
// only until Import (ticket 08) makes the real one from a Source, and is the
// engine tests' cup sequence (src/engine/paper.test.ts, "the cup, Fold by
// Fold") with Step text added. Ticket 08 replaces this file's cup with the
// imported one.

import type { Line, Point } from "../engine/geometry";
import type { ModelRecipe } from "../model/model";

const through = (a: Point, b: Point): Line => ({ origin: a, vector: [b[0] - a[0], b[1] - a[1]] });
/** The line that folds point a onto point b. */
const landing = (a: Point, b: Point): Line => ({
  origin: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
  vector: [a[1] - b[1], b[0] - a[0]],
});
/** Corners land where the flap's top edge runs parallel to the cup's bottom. */
const k = Math.SQRT2 - 1;

/**
 * The traditional cup, as the engine's tests fold it: the closed edge from
 * (0, 1) to (1, 0) is the cup's bottom and the corner at (0, 0) its rim.
 * White side up at the start, so the cup comes out coloured.
 */
export const cupRecipe: ModelRecipe = {
  id: "cup",
  name: "Cup",
  source: { name: "Traditional" },
  paper: { width: 1, height: 1, front: "#fbf7ee", back: "#e9a65e" },
  steps: [
    {
      text: "Fold the top right corner down to the bottom left corner.",
      folds: [{ type: "valley", line: through([0, 1], [1, 0]), flap: [0.9, 0.9] }],
    },
    {
      text: "Fold the bottom right corner across to the left edge.",
      folds: [{ type: "valley", line: landing([1, 0], [0, k]), flap: [0.9, 0.05] }],
    },
    {
      text: "Fold the top left corner across to the bottom edge.",
      folds: [{ type: "valley", line: landing([0, 1], [k, 0]), flap: [0.05, 0.9] }],
    },
    {
      text: "Fold the front flap of the bottom left corner over the two corners. Fold the back flap behind.",
      folds: [
        { type: "valley", line: through([0, k], [k, 0]), flap: [0.05, 0.05] },
        { type: "mountain", line: through([0, k], [k, 0]), flap: [0.05, 0.05] },
      ],
    },
  ],
};

/** Every Model file in src/library/, by id. */
export const RECIPES: Record<string, ModelRecipe> = { cup: cupRecipe };
