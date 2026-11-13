// The prototype's Recordings: each committed data file is what `npm run
// record` would write today, and the page that plays them carries no
// physics.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { record, serializeRecording } from "../src/motion/record";
import { PRECISION, type Recording } from "../src/motion/recording";
import { RECORDED_STEPS } from "./papers";

const here = dirname(fileURLToPath(import.meta.url));
/** A file's text with the line endings the serializer writes, whatever git checked out. */
const read = (file: string) => readFileSync(resolve(here, file), "utf8").replace(/\r\n/g, "\n");

describe("the committed Recordings", { timeout: 120000 }, () => {
  it.each(Object.keys(RECORDED_STEPS))("%s.json is fresh: re-recording gives the same file, within the rounding", (name) => {
    const text = read(`recordings/${name}.json`);
    const committed = JSON.parse(text) as Recording;
    // Written by the serializer, not by hand.
    expect(serializeRecording(committed)).toBe(text);

    const { before, after, lift } = RECORDED_STEPS[name]();
    const fresh = record(before, after, lift);
    const { positions: freshPositions, view: freshView, ...freshRest } = fresh;
    const { positions, view, ...rest } = committed;
    expect(rest).toEqual(freshRest);
    view.forEach((m, i) => expect(m).toBeCloseTo(freshView[i], 12));
    expect(positions.length).toBe(freshPositions.length);
    // Both are rounded to PRECISION, so a coordinate either agrees or differs by a whole step.
    let worst = 0;
    positions.forEach((x, i) => (worst = Math.max(worst, Math.abs(x - freshPositions[i]))));
    expect(worst).toBeLessThanOrEqual(PRECISION + 1e-12);
  });
});

// The page's static import graph, walked from its entry module: every
// relative module reached by a value import (type-only imports are erased
// and never bundled). Robust against the bundler's minification and
// chunking, which a grep of the build output isn't, and runs without a build.
function modulesReachedFrom(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const pending = [resolve(here, entry)];
  const IMPORT = /^\s*(?:import|export)\s+(?!type\s)[^'";]*?\sfrom\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;
  while (pending.length) {
    const file = pending.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    if (!file.endsWith(".ts")) continue;
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const spec = match[1] ?? match[2];
      if (!spec.startsWith(".")) {
        packages.add(spec.split("/")[0]);
        continue;
      }
      const base = resolve(dirname(file), spec);
      const found = [base, `${base}.ts`, resolve(base, "index.ts")].find((f) => existsSync(f) && statSync(f).isFile());
      if (!found) throw new Error(`${file} imports ${spec}, which does not exist`);
      pending.push(found);
    }
  }
  return { files, packages };
}

describe("the prototype page", () => {
  const reached = modulesReachedFrom("main.ts");
  const names = [...reached.files].map((f) => f.replace(/\\/g, "/").split("/").slice(-2).join("/"));

  it("plays the Recordings", () => {
    expect(names).toContain("motion/playback.ts");
    expect(names).toContain("recordings/inside-reverse.json");
    expect(names).toContain("recordings/squash.json");
  });

  it("carries no physics: solve.ts, hinge.ts, mesh.ts, motion.ts and record.ts are never imported", () => {
    for (const physics of ["motion/solve.ts", "motion/hinge.ts", "motion/mesh.ts", "motion/motion.ts", "motion/record.ts"]) {
      expect(names, `${physics} reached from main.ts`).not.toContain(physics);
    }
  });

  it("carries no engine: the Papers come from the Recording", () => {
    expect(names).not.toContain("engine/paper.ts");
    expect(names).not.toContain("proto-gestures/papers.ts");
    expect(reached.packages).not.toContain("rabbit-ear");
    expect(reached.packages).toContain("three");
  });
});
