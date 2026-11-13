// Saved progress, through src/storage.ts (suite rule 2), with the browser's
// localStorage stood in for by a Map.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadProgress, saveProgress } from "./progress";

const saved = new Map<string, string>();

beforeEach(() => {
  saved.clear();
  vi.stubGlobal("localStorage", {
    getItem: (name: string) => saved.get(name) ?? null,
    setItem: (name: string, value: string) => void saved.set(name, value),
    removeItem: (name: string) => void saved.delete(name),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("saved progress", () => {
  it("is nothing for a Model he has never opened", () => {
    expect(loadProgress("cup")).toBeNull();
  });

  it("comes back as it was saved, each Model's its own", () => {
    saveProgress("cup", { step: 2, finished: false });
    saveProgress("crane", { step: 0, finished: true });
    expect(loadProgress("cup")).toEqual({ step: 2, finished: false });
    expect(loadProgress("crane")).toEqual({ step: 0, finished: true });
  });

  it("is saved under names that start with the Game's slug", () => {
    saveProgress("cup", { step: 1, finished: false });
    expect([...saved.keys()]).toEqual(["foldlab:progress:cup"]);
  });

  it("is nothing when what was saved can't be read", () => {
    for (const broken of ["", "not json", "null", "[]", '{"step":"2","finished":false}', '{"step":1}']) {
      saved.set("foldlab:progress:cup", broken);
      expect(loadProgress("cup")).toBeNull();
    }
  });

  it("does not stop him folding when the iPad refuses to save", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    });
    expect(() => saveProgress("cup", { step: 1, finished: false })).not.toThrow();
    expect(loadProgress("cup")).toBeNull();
  });
});
