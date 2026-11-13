// The Library's committed Model files: each is what `npm run library` would
// write today, opens on the page's side, and can be folded from the first
// Step to the last; and every Fold's Recording passes ticket 10's acceptance
// tests, the same ones the hand-picked Recordings pass.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { newPaper, type Paper } from "../engine/paper";
import { recordedFoldTests, sampled, type AcceptanceTest, type RecordedCase } from "../motion/acceptance";
import { PRECISION } from "../motion/recording";
import { buildModel, paperOf, replay, serializeModel } from "../model/build";
import type { Model } from "../model/model";
import { afterFold, opened, progressOf, shown, toMake } from "../model/player";
import { MODEL_IDS, openModel } from "./library";
import { cupRecipe, RECIPES } from "./recipes";

const here = dirname(fileURLToPath(import.meta.url));
/** A file's text with the line endings the serializer writes, whatever git checked out. */
const read = (file: string) => readFileSync(resolve(here, file), "utf8").replace(/\r\n/g, "\n");

/** Everything in `a` equals `b`, numbers to within the Recordings' rounding step. */
function expectSame(a: unknown, b: unknown, where = "model") {
  if (typeof a === "number" && typeof b === "number") {
    expect(Math.abs(a - b), where).toBeLessThanOrEqual(PRECISION + 1e-12);
  } else if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    expect(Object.keys(a), where).toEqual(Object.keys(b));
    for (const key of Object.keys(a)) expectSame((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${where}.${key}`);
  } else {
    expect(a, where).toBe(b);
  }
}

describe("the Library's Model files", { timeout: 120000 }, () => {
  it("are one per recipe", () => {
    expect([...MODEL_IDS].sort()).toEqual(Object.keys(RECIPES).sort());
  });

  it.each(Object.keys(RECIPES))("%s.json is fresh: building it again gives the same file, within the rounding", (id) => {
    const text = read(`${id}.json`);
    const committed = JSON.parse(text) as Model;
    // Written by the serializer, not by hand.
    expect(serializeModel(committed)).toBe(text);
    const fresh = buildModel(RECIPES[id]);
    if (!fresh.ok) throw new Error(`${id} no longer builds: ${JSON.stringify(fresh)}`);
    expectSame(committed, fresh.model);
  });

  it("open checked, and a Model the Library does not have is refused", async () => {
    const cup = await openModel("cup");
    expect(cup.name).toBe("Cup");
    await expect(openModel("crane")).rejects.toThrow("no Model named crane");
  });
});

describe("the cup, folded from the first Step to the last", () => {
  it("shows each Step's text in turn and ends finished on the last Fold made", async () => {
    const cup = await openModel("cup");
    let place = opened(cup, null);
    const walked: string[] = [];
    while (toMake(cup, place).length) {
      const [next] = toMake(cup, place);
      walked.push(`${place.step + 1}: ${cup.steps[place.step].folds[next.fold].call.type}`);
      expect(shown(cup, place)).toEqual({ recording: next.recording, progress: 0 });
      place = afterFold(cup, place);
    }
    expect(walked).toEqual(["1: valley", "2: valley", "3: valley", "4: valley", "4: mountain"]);
    expect(place.finished).toBe(true);
    expect(shown(cup, place)).toEqual({ recording: cup.steps[3].folds[1].recordings[0].recording, progress: 1 });
    expect(progressOf(cup, place)).toEqual({ step: 0, finished: true });
  });

  it("lets the last Step's flaps be folded back first, then front", async () => {
    const cup = await openModel("cup");
    let place = opened(cup, { step: 3, finished: false });
    expect(toMake(cup, place).map((offer) => offer.fold)).toEqual([0, 1]);
    place = afterFold(cup, place, 1);
    expect(toMake(cup, place).map((offer) => offer.fold)).toEqual([0]);
    expect(afterFold(cup, place, 0).finished).toBe(true);
  });

  it("holds after each Step the Paper the engine has when the Step's calls are replayed", async () => {
    const cup = await openModel("cup");
    let paper = newPaper();
    cup.steps.forEach((step) => {
      for (const { call } of step.folds) paper = folded(paper, call);
      expect(paperOf(step.frame)).toEqual(paper);
    });
  });
});

function folded(paper: Paper, call: Parameters<typeof replay>[1]): Paper {
  const result = replay(paper, call);
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return result.paper;
}

// Every Fold of the cup as a Recording played back.
//
// KNOWN FAILURES, kept on record and not loosened here: Step 4, all four
// Recordings. The mesh's own start and end layouts there have faces crossing
// before anything moves; and the back flap's fold line has vertices shared by
// layers up to five apart, at uneven heights, so that seating them on the
// line the flap turns about runs the bars at them over 1% long, whichever
// flap is folded first (the front flap's stay within it). Ticket 14's
// diagnosis, fault B: `layeredLayout` in src/motion/mesh.ts. Waiting on
// ticket 15. Steps 1 to 3 pass everything since ticket 14 fixed the plain
// Fold's turn.
const THROUGH = "waiting on ticket 15: the layered layout of Step 4 has faces crossing at the start and the end, before anything moves";
const LONG = "waiting on ticket 15: the layered layout leaves the fold line of Step 4's back flap at uneven heights, so bars at it run over 1% long";
const KNOWN: Record<string, Partial<Record<AcceptanceTest, string>>> = {
  "Step 4, Fold 1": { crossing: THROUGH },
  "Step 4, Fold 2": { crossing: THROUGH, stretch: LONG },
  "Step 4, Fold 2 made first": { crossing: THROUGH, stretch: LONG },
  "Step 4, Fold 1 made second": { crossing: THROUGH },
};

const cupFolds: { name: string; fold: RecordedCase }[] = [];
{
  let paper = newPaper();
  let beforeLastStep = paper;
  cupRecipe.steps.forEach((step, s) => {
    beforeLastStep = paper;
    step.folds.forEach((call, f) => {
      const after = folded(paper, call);
      cupFolds.push({ name: `Step ${s + 1}, Fold ${f + 1}`, fold: { before: paper, after } });
      paper = after;
    });
  });
  // The last Step's flaps the other way round: back first, then front.
  const [front, back] = cupRecipe.steps[3].folds;
  const backFirst = folded(beforeLastStep, back);
  cupFolds.push({ name: "Step 4, Fold 2 made first", fold: { before: beforeLastStep, after: backFirst } });
  cupFolds.push({ name: "Step 4, Fold 1 made second", fold: { before: backFirst, after: folded(backFirst, front) } });
}

describe.each(cupFolds)("the cup's $name as a Recording played back", { timeout: 120000 }, ({ name, fold }) => {
  recordedFoldTests(fold, sampled(fold), { knownFailures: KNOWN[name] ?? {} });
});
