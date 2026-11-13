// `npm run library`: builds every Model file of the Library on this computer
// from its recipe (src/library/recipes.ts), replaying each Fold in the engine
// and recording it (src/model/build.ts). This part is pure and typed;
// scripts/library.mjs runs it under Node through Vite and writes each Model
// to src/library/<id>.json. Import (ticket 08) will write Model files the
// same way, from what the Claude API returns.

import { buildModel, serializeModel } from "../src/model/build";
import type { Model } from "../src/model/model";
import { RECIPES } from "../src/library/recipes";

export interface BuiltFile {
  /** The Model file's name under src/library/, without `.json`. */
  id: string;
  model: Model;
  /** The file's contents. */
  json: string;
}

/** Every Model file, freshly built: all of them, or only those named. A recipe that does not build stops the run. */
export function buildAll(only: string[] = []): BuiltFile[] {
  const unknown = only.filter((id) => !(id in RECIPES));
  if (unknown.length) throw new Error(`no recipe named ${unknown.join(", ")}; known: ${Object.keys(RECIPES).join(", ")}`);
  return Object.entries(RECIPES)
    .filter(([id]) => !only.length || only.includes(id))
    .map(([id, recipe]) => {
      const built = buildModel(recipe);
      if (!built.ok) throw new Error(`${id} did not build: ${JSON.stringify(built)}`);
      if (built.model.id !== id) throw new Error(`the recipe filed as ${id} calls itself ${built.model.id}`);
      return { id, model: built.model, json: serializeModel(built.model) };
    });
}
