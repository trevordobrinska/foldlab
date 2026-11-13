// The Library as the page reads it: every Model file published with the app,
// fetched only when it is opened (each is its own chunk, at a relative URL)
// and checked before it is played. For now the Library is one Model, the cup,
// built from a hand-written recipe (recipes.ts) and not by Import: no cup
// Source can be imported until a Model can carry more Fold types (ticket 16).

import { parseModel, type Model } from "../model/model";

const FILES: Record<string, () => Promise<{ default: unknown }>> = {
  cup: () => import("./cup.json"),
};

/** The ids of every Model in the Library. */
export const MODEL_IDS: readonly string[] = Object.keys(FILES);

/** Fetches and checks one Model. Rejects when there is no such Model or its file is damaged. */
export async function openModel(id: string): Promise<Model> {
  if (!Object.hasOwn(FILES, id)) throw new Error(`no Model named ${id} in the Library`);
  const parsed = parseModel((await FILES[id]()).default);
  if (!parsed.ok) throw new Error(`the Model file ${id} is damaged: ${parsed.problems.join("; ")}`);
  return parsed.value;
}
