// Import, run the way `npm run import` runs it, but in folders made for the
// test and with a stand-in for the Claude API: no test here touches the
// network, the real inbox or the real Library.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Built } from "../model/build";
import { parseModel, parseRecipe } from "../model/model";
import { DEFAULT_COST_CAP, runImport, type AskRequest, type ImportClient, type ImportOptions, type Reading, type Spend } from "./import";

const made: string[] = [];
afterEach(() => made.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A fresh inbox, Library and Failed-imports folder; `sources` are the inbox's files. */
function folders(sources: Record<string, string> = { "cup.png": "a picture of a cup diagram" }) {
  const root = mkdtempSync(join(tmpdir(), "foldlab-import-"));
  made.push(root);
  const at = { inbox: join(root, "inbox"), library: join(root, "library"), failed: join(root, "failed") };
  Object.values(at).forEach((dir) => mkdirSync(dir));
  for (const [name, text] of Object.entries(sources)) writeFileSync(join(at.inbox, name), text);
  return at;
}

const point = (x: number, y: number) => ({ x, y });
const valley = (from: [number, number], to: [number, number], flap: [number, number]) => ({
  type: "valley",
  line: { from: point(...from), to: point(...to) },
  flap: point(...flap),
  layers: 1,
});

/** What Claude answers for a Source that folds a square in half, corner to corner, then a corner across. */
const twoSteps = () => ({
  unreadable: "",
  name: "Cup",
  source: "Traditional",
  paper: { width: 1, height: 1, front: "#fbf7ee", back: "#e9a65e" },
  steps: [
    { text: "Fold the top right corner down to the bottom left corner.", folds: [valley([0, 1], [1, 0], [0.9, 0.9])] },
    { text: "Fold the bottom right corner across to the left edge.", folds: [valley([0.5, 0], [1, 0.5], [0.9, 0.05])] },
  ],
});

const cheap: Spend[] = [{ model: "claude-opus-5-5", input: 10_000, output: 5_000, cacheWrite: 0, cacheRead: 0 }];

/** A Claude that answers every Source with `answer` (given as data, or as a function making the whole Reading). */
function claude(answer: unknown | ((request: AskRequest) => Reading), inputTokens = 10_000) {
  const asked: AskRequest[] = [];
  const keys: string[] = [];
  const client: ImportClient = {
    countInputTokens: async () => inputTokens,
    ask: async (request) => {
      asked.push(request);
      if (typeof answer === "function") return (answer as (r: AskRequest) => Reading)(request);
      return { stop: "end", text: JSON.stringify(answer), spend: cheap };
    },
  };
  return { asked, keys, connect: (key: string) => (keys.push(key), client) };
}

const KEY = { ANTHROPIC_API_KEY: "a-key-from-the-environment" };
const run = (at: ReturnType<typeof folders>, fake: ReturnType<typeof claude>, more: Partial<ImportOptions> = {}) =>
  runImport({ ...at, env: KEY, connect: fake.connect, log: () => {}, ...more });
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));
/** A builder that never runs the engine, for tests that are not about the Model. */
const noBuild = (): Built => ({ ok: false, reason: "invalid", problems: ["not built in this test"] });

describe("a Source whose every Step replays", { timeout: 120000 }, () => {
  it("becomes a Model file in the Library, with the recipe it was built from beside it", async () => {
    const at = folders();
    const fake = claude(twoSteps());
    const result = await run(at, fake);

    expect(result.failed).toEqual([]);
    expect(result.imported.map((m) => [m.id, m.source, m.steps, m.folds])).toEqual([["cup", "cup.png", 2, 2]]);
    expect(readdirSync(at.library).sort()).toEqual(["cup.json", "cup.recipe.json"]);
    expect(readdirSync(at.failed)).toEqual([]);

    const model = parseModel(json(join(at.library, "cup.json")));
    if (!model.ok) throw new Error(model.problems.join("; "));
    expect(model.value.id).toBe("cup");
    expect(model.value.name).toBe("Cup");
    expect(model.value.source).toEqual({ name: "Traditional" });
    expect(model.value.steps.map((step) => step.text)).toEqual(twoSteps().steps.map((step) => step.text));
    expect(model.value.steps[1].folds[0].call).toEqual({ type: "valley", line: { origin: [0.5, 0], vector: [0.5, 0.5] }, flap: [0.9, 0.05] });

    // The recipe is what `npm run library` rebuilds the Model file from, without asking Claude again.
    expect(parseRecipe(json(join(at.library, "cup.recipe.json"))).ok).toBe(true);
  });

  it("is shown to Claude whole, with the answer format and FoldLab's instructions", async () => {
    const at = folders({ "cup.pdf": "%PDF-pretend" });
    const fake = claude(twoSteps());
    await run(at, fake, { build: noBuild });
    expect(fake.asked).toHaveLength(1);
    const [request] = fake.asked;
    expect(request.model).toBe("claude-opus-5-5");
    expect(request.pages).toEqual([{ name: "cup.pdf", mediaType: "application/pdf", data: Buffer.from("%PDF-pretend").toString("base64") }]);
    expect(request.instructions).toContain("own words");
    expect(JSON.stringify(request.schema)).toContain("valley");
  });

  it("may be a folder of pages, shown in name order; the folder names the Model", async () => {
    const at = folders({});
    mkdirSync(join(at.inbox, "Paper Cup"));
    writeFileSync(join(at.inbox, "Paper Cup", "page-2.jpg"), "two");
    writeFileSync(join(at.inbox, "Paper Cup", "page-1.jpg"), "one");
    writeFileSync(join(at.inbox, "Paper Cup", "notes.txt"), "not a page");
    const fake = claude(twoSteps());
    const result = await run(at, fake, { build: noBuild });
    expect(result.failed.map((f) => f.id)).toEqual(["paper-cup"]);
    expect(fake.asked[0].pages.map((page) => [page.name, page.mediaType])).toEqual([
      ["page-1.jpg", "image/jpeg"],
      ["page-2.jpg", "image/jpeg"],
    ]);
  });

  it("clears the Failed import an earlier try left behind", async () => {
    const at = folders();
    writeFileSync(join(at.failed, "cup.json"), "{}");
    await run(at, claude(twoSteps()));
    expect(readdirSync(at.failed)).toEqual([]);
  });
});

describe("a Source that cannot be checked all the way through", { timeout: 120000 }, () => {
  /** Runs one Import that must fail, with a Model already in the Library, and returns the Failed import on record. */
  async function failing(answer: unknown | ((request: AskRequest) => Reading), more: Partial<ImportOptions> = {}) {
    const at = folders();
    writeFileSync(join(at.library, "cup.json"), "the cup already in the Library");
    const result = await run(at, claude(answer), more);

    // Nothing reaches the Library, and what was there stays.
    expect(result.imported).toEqual([]);
    expect(readdirSync(at.library)).toEqual(["cup.json"]);
    expect(readFileSync(join(at.library, "cup.json"), "utf8")).toBe("the cup already in the Library");
    // The Failed import is on record, with its reason.
    expect(result.failed).toHaveLength(1);
    expect(readdirSync(at.failed)).toEqual(["cup.json"]);
    const record = json(join(at.failed, "cup.json"));
    expect(record.id).toBe("cup");
    expect(record.source).toBe("cup.png");
    expect(record.reason).toEqual(result.failed[0].reason);
    // The Model imported earlier is kept, and the record says so.
    expect(record.earlierModelKept).toBe(true);
    expect(result.failed[0].earlierModelKept).toBe(true);
    return record as { reason: { kind: string; message: string }; answer: unknown; cost: number };
  }

  it("because the engine refuses a Fold: the Failed import names the Step, the Fold and the refusal", async () => {
    const answer = twoSteps();
    answer.steps[1].folds[0] = valley([0.5, 0], [1, 0.5], [3, 3]); // no paper there
    const record = await failing(answer);
    expect(record.reason).toMatchObject({ kind: "refused", step: 2, fold: 1, refusal: "no-flap" });
    expect(record.reason.message).toContain("Step 2, Fold 1");
    expect(record.answer).toEqual(answer);
    expect(record.cost).toBeCloseTo(0.14, 6); // 10,000 in at $4 and 5,000 out at $20 a million
  });

  it("because the answer is not a Model recipe: every problem is listed", async () => {
    const answer = twoSteps();
    answer.paper.front = "white";
    answer.steps[0].text = " ";
    (answer.steps[1].folds[0] as { flap: unknown }).flap = "the corner";
    const record = await failing(answer);
    expect(record.reason.kind).toBe("invalid");
    expect(record.reason.message).toContain("Step 1 has no text");
    expect(record.reason.message).toContain("colour");
    expect(record.reason.message).toContain("Step 2, Fold 1: flap must be a point");
  });

  it("because a Fold replays but its motion cannot be recorded", async () => {
    const build = (): Built => ({ ok: false, reason: "unrecordable", step: 1, fold: 1, message: "the solver gave up" });
    const record = await failing(twoSteps(), { build });
    expect(record.reason).toMatchObject({ kind: "unrecordable", step: 1, fold: 1 });
    expect(record.reason.message).toContain("the solver gave up");
  });

  it("because the Source uses a Fold type a Model cannot carry yet: the Failed import names every one, and the engine is never run", async () => {
    const answer = twoSteps() as { steps: { text: string; folds: unknown[] }[] };
    answer.steps.push({ text: "Turn the paper over.", folds: [{ type: "turn-over" }] });
    answer.steps.push({ text: "Open the pocket and press it flat.", folds: [{ type: "squash" }] });
    let built = 0;
    const record = await failing(answer, { build: () => (built++, noBuild()) });
    expect(built).toBe(0);
    expect(record.reason.kind).toBe("unsupported");
    expect(record.reason.message).toContain("Step 3, Fold 1 is a turn over");
    expect(record.reason.message).toContain("Step 4, Fold 1 is a squash");
  });

  it("because Claude says it cannot read the Source", async () => {
    const record = await failing({ ...twoSteps(), unreadable: "The photo is too blurred to see Step 3.", steps: [] });
    expect(record.reason).toEqual({ kind: "source-unreadable", message: "Claude could not read the Source: The photo is too blurred to see Step 3." });
  });

  it("because Claude declines, is cut short, or answers something that is not the answer format", async () => {
    const declined = await failing(() => ({ stop: "refusal", text: "", refusal: "general_harms", spend: cheap }));
    expect(declined.reason.kind).toBe("claude-refused");
    expect(declined.reason.message).toContain("general_harms");
    expect((await failing(() => ({ stop: "max_tokens", text: '{"name": "Cu', spend: cheap }))).reason.kind).toBe("cut-short");
    expect((await failing(() => ({ stop: "end", text: "Here is the cup!", spend: cheap }))).reason.kind).toBe("unreadable-answer");
    expect((await failing(() => ({ stop: "end", text: "[1, 2]", spend: cheap }))).reason.kind).toBe("unreadable-answer");
  });
});

describe("the cost cap", { timeout: 120000 }, () => {
  const two = { "a-boat.png": "boat", "b-cup.png": "cup" };
  const spending = (spend: Spend[]) => claude(() => ({ stop: "end", text: JSON.stringify(twoSteps()), spend }));

  it("is $5 a run unless Dad says otherwise", () => {
    expect(DEFAULT_COST_CAP).toBe(5);
  });

  it("prices a run from the tokens Claude reports; a model whose price is not known is priced at the dearest", async () => {
    const fake = spending([
      { model: "claude-opus-5-5", input: 100_000, output: 10_000, cacheWrite: 0, cacheRead: 0 }, // $0.40 + $0.20
      { model: "some-other-model", input: 100_000, output: 10_000, cacheWrite: 0, cacheRead: 0 }, // $0.50 + $0.25
    ]);
    const result = await run(folders(), fake, { build: noBuild });
    expect(result.spent).toBeCloseTo(1.35, 6);
    expect(result.failed[0].cost).toBeCloseTo(1.35, 6);
  });

  it("stops the run once it is spent: the Sources left are not sent, and are not Failed imports", async () => {
    const at = folders(two);
    // The first Source costs 1,000,000 in at $4 and 100,000 out at $20: $6, over the $5 cap.
    const fake = spending([{ model: "claude-opus-5-5", input: 1_000_000, output: 100_000, cacheWrite: 0, cacheRead: 0 }]);
    const said: string[] = [];
    const result = await run(at, fake, { log: (line) => said.push(line) });
    expect(said.join(" ")).toContain("Not tried: b-cup.png");
    expect(fake.asked).toHaveLength(1);
    expect(result.imported.map((m) => m.id)).toEqual(["a-boat"]);
    expect(result.spent).toBeCloseTo(6, 6);
    expect(result.stopped?.why).toBe("cost-cap");
    expect(result.notTried).toEqual(["b-cup.png"]);
    expect(readdirSync(at.failed)).toEqual([]);
    expect(existsSync(join(at.library, "b-cup.json"))).toBe(false);
  });

  it("does not send a Source that could take the run over the cap", async () => {
    // Each Source could cost up to 10,000 in at $5 and 32,000 out at $25 a million: $0.85.
    const fake = claude(twoSteps(), 10_000);
    const result = await run(folders(two), fake, { costCap: 0.95, build: noBuild });
    expect(fake.asked).toHaveLength(1); // $0.14 spent; another $0.85 could pass $0.95
    expect(result.stopped?.why).toBe("cost-cap");
    expect(result.stopped?.message).toContain("$0.95");
    expect(result.notTried).toEqual(["b-cup.png"]);

    const none = await run(folders(two), claude(twoSteps(), 10_000), { costCap: 0.5, build: noBuild });
    expect(none.failed).toEqual([]);
    expect(none.spent).toBe(0);
    expect(none.notTried).toEqual(["a-boat.png", "b-cup.png"]);
  });
});

describe("the API key", () => {
  it("comes from the environment, and nowhere else", async () => {
    const fake = claude(twoSteps());
    await run(folders(), fake, { build: noBuild });
    expect(fake.keys).toEqual(["a-key-from-the-environment"]);
  });

  it("when it is not set, nothing is sent or written", async () => {
    const at = folders();
    for (const env of [{}, { ANTHROPIC_API_KEY: "  " }]) {
      const fake = claude(twoSteps());
      const result = await run(at, fake, { env });
      expect(fake.keys).toEqual([]);
      expect(fake.asked).toEqual([]);
      expect(result.stopped?.why).toBe("no-api-key");
      expect(result.stopped?.message).toContain("ANTHROPIC_API_KEY");
      expect(result.notTried).toEqual(["cup.png"]);
      expect([...readdirSync(at.library), ...readdirSync(at.failed)]).toEqual([]);
    }
  });
});

describe("which Sources a run takes", () => {
  it("says so and succeeds when there is nothing to import, API key or no key", async () => {
    const imported = folders();
    writeFileSync(join(imported.library, "cup.recipe.json"), "{}");
    for (const at of [folders({}), imported]) {
      const fake = claude(twoSteps());
      const said: string[] = [];
      const result = await run(at, fake, { env: {}, log: (line) => said.push(line) });
      expect(result.stopped).toBeUndefined();
      expect(said.join(" ")).toContain("Nothing to import");
      expect(fake.keys).toEqual([]);
    }
  });

  it("leaves out a Source already imported, unless it is named", async () => {
    const at = folders({ "cup.png": "cup", "boat.png": "boat" });
    writeFileSync(join(at.library, "cup.recipe.json"), "{}");
    const all = claude(twoSteps());
    const result = await run(at, all, { build: noBuild });
    expect(result.alreadyImported).toEqual(["cup.png"]);
    expect(all.asked.map((request) => request.pages[0].name)).toEqual(["boat.png"]);

    const named = claude(twoSteps());
    await run(at, named, { build: noBuild, only: ["cup.png"] });
    expect(named.asked.map((request) => request.pages[0].name)).toEqual(["cup.png"]);
  });

  it("stops when a named Source is not in the inbox, or two Sources would be the same Model", async () => {
    const missing = await run(folders(), claude(twoSteps()), { build: noBuild, only: ["crane.pdf"] });
    expect(missing.stopped?.why).toBe("inbox");
    expect(missing.stopped?.message).toContain("crane.pdf");

    const fake = claude(twoSteps());
    const twice = await run(folders({ "cup.png": "one", "Cup.pdf": "two" }), fake, { build: noBuild });
    expect(twice.stopped?.why).toBe("inbox");
    expect(fake.asked).toEqual([]);
  });

  it("when the Claude API fails on a Source that was sent: a Failed import with the reason, its input counted as spent, and the run stops", async () => {
    const at = folders({ "a-boat.png": "boat", "b-cup.png": "cup" });
    const fake = claude(() => {
      throw new Error("529 overloaded");
    });
    const said: string[] = [];
    const result = await run(at, fake, { build: noBuild, log: (line) => said.push(line) });
    expect(result.stopped).toEqual({ why: "claude-api", message: expect.stringContaining("529 overloaded") });
    expect(result.notTried).toEqual(["b-cup.png"]);
    expect(said.join(" ")).toContain("Not tried: b-cup.png");

    expect(readdirSync(at.failed)).toEqual(["a-boat.json"]);
    const record = json(join(at.failed, "a-boat.json"));
    expect(record.reason.kind).toBe("claude-api");
    expect(record.reason.message).toContain("529 overloaded");
    expect(record.reason.message).toContain("not known");
    // 10,000 tokens in at the dearest price, $5 a million: what was sent before it failed.
    expect(record.cost).toBeCloseTo(0.05, 6);
    expect(result.spent).toBeCloseTo(0.05, 6);
  });

  it("when the Claude API fails before a Source is sent: the run stops, and the Source is not tried, not a Failed import", async () => {
    const at = folders({ "a-boat.png": "boat", "b-cup.png": "cup" });
    const fake = claude(twoSteps());
    const connect = (key: string): ImportClient => ({
      ...fake.connect(key),
      countInputTokens: async () => {
        throw new Error("401 not accepted");
      },
    });
    const result = await run(at, fake, { build: noBuild, connect });
    expect(result.stopped).toEqual({ why: "claude-api", message: expect.stringContaining("401 not accepted") });
    expect(fake.asked).toEqual([]);
    expect(result.notTried).toEqual(["a-boat.png", "b-cup.png"]);
    expect(result.spent).toBe(0);
    expect(readdirSync(at.failed)).toEqual([]);
  });
});

describe("writing a Model to the Library", { timeout: 120000 }, () => {
  /** A Library whose cup recipe cannot be written: a folder is in its place. */
  function blocked() {
    const at = folders();
    mkdirSync(join(at.library, "cup.recipe.json"));
    writeFileSync(join(at.library, "cup.recipe.json", "in-the-way"), "");
    return at;
  }

  it("is all or nothing: when a file cannot be written, the Library is left as it was and the Source is a Failed import", async () => {
    const at = blocked();
    const result = await run(at, claude(twoSteps()), { only: ["cup.png"] });
    expect(result.imported).toEqual([]);
    expect(readdirSync(at.library)).toEqual(["cup.recipe.json"]);
    expect(result.failed.map((f) => [f.id, f.reason.kind, f.earlierModelKept])).toEqual([["cup", "library-write", false]]);
    expect(json(join(at.failed, "cup.json")).reason.message).toContain("could not be written");
    expect(result.spent).toBeCloseTo(0.14, 6);
  });

  it("puts back the Model imported earlier when the new one cannot be written whole", async () => {
    const at = blocked();
    writeFileSync(join(at.library, "cup.json"), "the cup already in the Library");
    const result = await run(at, claude(twoSteps()), { only: ["cup.png"] });
    expect(readdirSync(at.library).sort()).toEqual(["cup.json", "cup.recipe.json"]);
    expect(readFileSync(join(at.library, "cup.json"), "utf8")).toBe("the cup already in the Library");
    expect(result.failed.map((f) => [f.reason.kind, f.earlierModelKept])).toEqual([["library-write", true]]);
  });
});
