// A Model's saved progress on this iPad: the Step to reopen at and whether
// it was ever finished. Saved only through src/storage.ts, so every name
// starts with the Game's slug (suite rule 2): "foldlab:progress:<model id>".

import { load, save } from "../storage";
import type { Progress } from "./player";

const keyOf = (modelId: string) => "progress:" + modelId;

/** What was saved for a Model, or null when there is nothing readable. */
export function loadProgress(modelId: string): Progress | null {
  try {
    const data: unknown = JSON.parse(load(keyOf(modelId)) ?? "null");
    if (typeof data !== "object" || data === null) return null;
    const { step, finished } = data as Record<string, unknown>;
    if (typeof step !== "number" || typeof finished !== "boolean") return null;
    return { step, finished };
  } catch {
    return null;
  }
}

/** Saves a Model's progress. Quietly does nothing when the browser refuses (private browsing, storage full). */
export function saveProgress(modelId: string, progress: Progress): void {
  try {
    save(keyOf(modelId), JSON.stringify({ step: progress.step, finished: progress.finished }));
  } catch {
    // Folding goes on; only the reopening is lost.
  }
}
