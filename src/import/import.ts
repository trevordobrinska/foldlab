// Import (ADR 0003), minimal: each Source in the inbox on Dad's computer is
// shown to the Claude API, which answers with Fold calls per Step and Step
// text in FoldLab's own words; the builder replays every Step in the engine;
// and only a Source whose every Step replays is written to the Library, as
// its Model file and the recipe it was built from. Any other Source becomes a
// Failed import: a record of why, kept beside the Sources, and nothing new in
// the Library (a Model imported earlier under the same id stays, and the
// record says so). A cost cap stops the run.
//
// Sources and Failed imports stay on this computer (ADR 0002): the inbox and
// the Failed-imports folder are gitignored. The Claude API is reached only
// through `ImportClient` (claude.ts is the real one), so this module and its
// tests never touch the network. The page never imports any of this.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, parse } from "node:path";
import { buildModel, serializeModel, type Built } from "../model/build";
import { foldCount } from "../model/model";
import { ANSWER_SCHEMA, INSTRUCTIONS, QUESTION, recipeFrom } from "./answer";

// --- The Claude API, as Import sees it ---------------------------------------

/** The model Import asks: the latest Opus. */
export const IMPORT_MODEL = "claude-opus-5-5";
/** The most one answer may be, thinking included. It bounds what one request can cost. */
export const MAX_ANSWER_TOKENS = 32_000;

/** One file of a Source, as it is sent. */
export interface Page {
  name: string;
  mediaType: string;
  /** The file's bytes, base64. */
  data: string;
}

export interface AskRequest {
  model: string;
  maxTokens: number;
  /** The system prompt. */
  instructions: string;
  /** The Source, whole and in order. */
  pages: Page[];
  /** What is asked about it. */
  question: string;
  /** The JSON schema the answer must match. */
  schema: object;
}

/** Tokens one model was billed for. */
export interface Spend {
  model: string;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface Reading {
  /** Why Claude stopped: "end" for a finished answer, "refusal", "max_tokens", or the API's other stop reasons. */
  stop: string;
  /** The answer's text (JSON when finished). */
  text: string;
  /** When Claude declined: what the API said about why. */
  refusal?: string;
  /** What the request cost in tokens, one entry for each model that was billed (one, unless the API says otherwise). */
  spend: Spend[];
}

export interface ImportClient {
  /** How many input tokens a request would be billed for. Sends nothing to a model. */
  countInputTokens(request: AskRequest): Promise<number>;
  ask(request: AskRequest): Promise<Reading>;
}

// --- Cost --------------------------------------------------------------------

/** The most one run may spend, in US dollars, unless Dad gives another cap. */
export const DEFAULT_COST_CAP = 5;

/** US dollars per million tokens (claude-api skill's table, cached 2026-10-06). A cache write is 1.25 × input. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
};
/** The dearest Opus price: for a model not in the table (the API may name the model differently), and for what a request might cost before it is sent. */
const DEAREST = { input: 5, output: 25, cacheRead: 0.5 };

/** What tokens cost, in dollars. An estimate: the Console's bill is the record. */
export function costOf(spend: Spend[]): number {
  return spend.reduce((sum, s) => {
    const price = PRICES[s.model] ?? DEAREST;
    return sum + (s.input * price.input + s.cacheWrite * price.input * 1.25 + s.cacheRead * price.cacheRead + s.output * price.output) / 1e6;
  }, 0);
}

/** What sending that many input tokens costs at the dearest price, whatever comes back. */
const inputCost = (inputTokens: number) => (inputTokens * DEAREST.input) / 1e6;
/**
 * The most a request of that many input tokens could cost: a full-length
 * answer, at the dearest price. One request is one billed pass: claude.ts
 * asks for no fallback to another model.
 */
const couldCost = (inputTokens: number) => inputCost(inputTokens) + (MAX_ANSWER_TOKENS * DEAREST.output) / 1e6;

const dollars = (amount: number) => `$${amount.toFixed(2)}`;

// --- A run -------------------------------------------------------------------

export interface ImportOptions {
  /** The folder of Sources (import/inbox/). Each file is a Source; so is each folder of pages. */
  inbox: string;
  /** The published Library's folder (src/library/). */
  library: string;
  /** Where Failed imports are recorded (import/work/failed/). */
  failed: string;
  /** Only these Sources, by their names in the inbox. Default: every Source not yet imported. */
  only?: string[];
  /** The environment: the API key is read from ANTHROPIC_API_KEY here and nowhere else. */
  env: Record<string, string | undefined>;
  /** Makes the Claude API client from the key. */
  connect: (apiKey: string) => ImportClient;
  /** The most the run may spend, in dollars. */
  costCap?: number;
  /** Replays a recipe into a Model (build.ts). */
  build?: (recipe: unknown) => Built;
  log?: (line: string) => void;
  now?: () => Date;
}

/** Why a Source became a Failed import. `message` says it in a sentence. */
export type FailedReason = { kind: string; message: string; [detail: string]: unknown };

export interface ImportRun {
  imported: { id: string; source: string; steps: number; folds: number; cost: number; files: string[] }[];
  failed: {
    id: string;
    source: string;
    reason: FailedReason;
    cost: number;
    file: string;
    /** True when the Library still holds a Model of this id from before: a Failed import never removes one. */
    earlierModelKept: boolean;
  }[];
  /** Sources left out because the Library already has their Model by Import. */
  alreadyImported: string[];
  /** Set when the run ended before every Source was tried. */
  stopped?: { why: "no-api-key" | "inbox" | "cost-cap" | "claude-api"; message: string };
  /** The Sources that were never sent. They are not Failed imports. */
  notTried: string[];
  /** Dollars spent, as estimated from the tokens Claude reported (for a request that failed after it was sent: from its input alone). */
  spent: number;
}

const MEDIA_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
/** The Claude API takes 32 MB a request; base64 adds a third. */
const MOST_BYTES = 20 * 1024 * 1024;

interface Source {
  /** Its name in the inbox. */
  name: string;
  /** The Model's id: the name in lower case, anything but letters and digits as dashes. */
  id: string;
  /** Its pages' files, in order. */
  files: string[];
}

const isPage = (file: string) => extname(file).toLowerCase() in MEDIA_TYPES;
const byName = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

function sourcesIn(inbox: string): Source[] {
  if (!existsSync(inbox)) return [];
  const sources: Source[] = [];
  for (const name of readdirSync(inbox).sort(byName)) {
    const path = join(inbox, name);
    const folder = statSync(path).isDirectory();
    const files = folder
      ? readdirSync(path).filter(isPage).sort(byName).map((file) => join(path, file))
      : isPage(name) ? [path] : [];
    const id = (folder ? name : parse(name).name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (files.length && id) sources.push({ name, id, files });
  }
  return sources;
}

/**
 * Writes all the files or none: each under a temporary name first, then
 * renamed into place. If anything fails, the temporary files are removed,
 * every file already put in place is put back as it was, and the error is thrown.
 */
function writeTogether(files: { path: string; text: string }[]): void {
  const temporary = (path: string) => `${path}.tmp`;
  const placed: { path: string; before: Buffer | undefined }[] = [];
  try {
    for (const { path, text } of files) writeFileSync(temporary(path), text);
    for (const { path } of files) {
      const before = existsSync(path) && statSync(path).isFile() ? readFileSync(path) : undefined;
      renameSync(temporary(path), path);
      placed.push({ path, before });
    }
  } catch (error) {
    for (const { path, before } of placed) {
      if (before) writeFileSync(path, before);
      else rmSync(path, { force: true });
    }
    for (const { path } of files) rmSync(temporary(path), { force: true });
    throw error;
  }
}

const said = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One Import run. Never throws for a Source, for the Claude API or for writing the Library: the answer says what happened. */
export async function runImport(options: ImportOptions): Promise<ImportRun> {
  const { inbox, library, failed, env, connect } = options;
  const cap = options.costCap ?? DEFAULT_COST_CAP;
  const build = options.build ?? buildModel;
  const log = options.log ?? console.log;
  const now = options.now ?? (() => new Date());
  const run: ImportRun = { imported: [], failed: [], alreadyImported: [], notTried: [], spent: 0 };
  const stop = (why: NonNullable<ImportRun["stopped"]>["why"], message: string, left: Source[]) => {
    run.stopped = { why, message };
    run.notTried = left.map((source) => source.name);
    log(`Stopped: ${message}.${left.length ? ` Not tried: ${run.notTried.join(", ")}.` : ""}`);
    return run;
  };

  // Which Sources.
  const all = sourcesIn(inbox);
  const duplicate = all.find((source, i) => all.findIndex((other) => other.id === source.id) < i);
  if (duplicate) return stop("inbox", `more than one Source in the inbox would be the Model "${duplicate.id}"; keep one`, []);
  const missing = (options.only ?? []).filter((name) => !all.some((source) => source.name === name));
  if (missing.length) {
    return stop("inbox", `no Source named ${missing.join(", ")} in ${inbox} (there: ${all.map((source) => source.name).join(", ") || "nothing"})`, []);
  }
  const sources = all.filter((source) => {
    if (options.only?.length) return options.only.includes(source.name);
    if (!existsSync(join(library, `${source.id}.recipe.json`))) return true;
    run.alreadyImported.push(source.name);
    log(`${source.name}: already imported; name it to import it again`);
    return false;
  });

  if (!sources.length) {
    log("Nothing to import: put a Source in the inbox (or name one to import it again).");
    return run;
  }

  // The key, from the environment only.
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return stop("no-api-key", "set the ANTHROPIC_API_KEY environment variable to Dad's Claude API key", sources);
  const client = connect(apiKey);

  for (const [i, source] of sources.entries()) {
    const left = sources.slice(i);
    if (run.spent >= cap) return stop("cost-cap", `the run has spent ${dollars(run.spent)} of its ${dollars(cap)} cost cap`, left);

    const fail = (reason: FailedReason, cost: number, answer: unknown) => {
      mkdirSync(failed, { recursive: true });
      const file = join(failed, `${source.id}.json`);
      // A Failed import writes nothing to the Library and removes nothing from it: a Model imported earlier stays.
      const earlier = join(library, `${source.id}.json`);
      const earlierModelKept = existsSync(earlier);
      const record = { id: source.id, source: source.name, when: now().toISOString(), askedOf: IMPORT_MODEL, reason, cost, earlierModelKept, answer };
      writeFileSync(file, JSON.stringify(record, null, 1) + "\n");
      run.failed.push({ id: source.id, source: source.name, reason, cost, file, earlierModelKept });
      log(`${source.name}: Failed import (${reason.kind}). ${reason.message} -> ${file}`);
      if (earlierModelKept) log(`${source.name}: the Library still has the "${source.id}" Model from before this try (${earlier}); it was not changed.`);
    };

    const bytes = source.files.reduce((sum, file) => sum + statSync(file).size, 0);
    if (bytes > MOST_BYTES) {
      fail({ kind: "too-large", message: `the Source is ${(bytes / 1024 / 1024).toFixed(0)} MB; the Claude API takes about 20 MB a request` }, 0, null);
      continue;
    }
    const request: AskRequest = {
      model: IMPORT_MODEL,
      maxTokens: MAX_ANSWER_TOKENS,
      instructions: INSTRUCTIONS,
      pages: source.files.map((file) => ({
        name: parse(file).base,
        mediaType: MEDIA_TYPES[extname(file).toLowerCase()],
        data: readFileSync(file).toString("base64"),
      })),
      question: QUESTION,
      schema: ANSWER_SCHEMA,
    };

    // Counting sends nothing to a model: if it fails, the Source was not tried.
    let inputTokens: number;
    try {
      inputTokens = await client.countInputTokens(request);
    } catch (error) {
      return stop("claude-api", `the Claude API failed on ${source.name}, before it was sent: ${said(error)}`, left);
    }
    const could = couldCost(inputTokens);
    if (run.spent + could > cap) {
      return stop("cost-cap", `${source.name} could cost up to ${dollars(could)}; with ${dollars(run.spent)} spent that could pass the ${dollars(cap)} cost cap`, left);
    }
    log(`${source.name}: asking ${IMPORT_MODEL} (up to ${dollars(could)})...`);
    let reading: Reading;
    try {
      reading = await client.ask(request);
    } catch (error) {
      // The Source was sent, so it was tried: a Failed import. What it was billed is not known; its input is counted.
      const sent = inputCost(inputTokens);
      run.spent += sent;
      const message = `the Claude API failed on ${source.name}: ${said(error)}`;
      fail({ kind: "claude-api", message: `${message}. What the request cost is not known; its input, ${dollars(sent)}, is counted as spent` }, sent, null);
      return stop("claude-api", `${message}; what that request cost is not known (the Console has the bill)`, sources.slice(i + 1));
    }
    const cost = costOf(reading.spend);
    run.spent += cost;

    if (reading.stop === "refusal") {
      fail({ kind: "claude-refused", message: `Claude declined to read the Source${reading.refusal ? ` (${reading.refusal})` : ""}` }, cost, null);
      continue;
    }
    if (reading.stop === "max_tokens") {
      fail({ kind: "cut-short", message: `Claude's answer was cut short at ${MAX_ANSWER_TOKENS} tokens` }, cost, reading.text);
      continue;
    }
    let answer: unknown;
    try {
      answer = JSON.parse(reading.text);
    } catch {
      fail({ kind: "unreadable-answer", message: `Claude's answer is not JSON (it stopped with "${reading.stop}")` }, cost, reading.text);
      continue;
    }
    const read = recipeFrom(answer, source.id);
    if (!read.ok) {
      fail(read.reason, cost, answer);
      continue;
    }

    // The check: every Step replayed in the engine, every Fold recorded.
    const built = build(read.recipe);
    if (!built.ok) {
      fail(whyNotBuilt(built), cost, answer);
      continue;
    }
    // The Model file and its recipe go into the Library together or not at all.
    const files = [join(library, `${source.id}.json`), join(library, `${source.id}.recipe.json`)];
    try {
      mkdirSync(library, { recursive: true });
      writeTogether([
        { path: files[0], text: serializeModel(built.model) },
        { path: files[1], text: JSON.stringify(read.recipe, null, 1) + "\n" },
      ]);
    } catch (error) {
      fail({ kind: "library-write", message: `every Step replayed, but the Model could not be written to the Library: ${said(error)}` }, cost, answer);
      continue;
    }
    rmSync(join(failed, `${source.id}.json`), { force: true });
    const folds = foldCount(built.model);
    run.imported.push({ id: source.id, source: source.name, steps: built.model.steps.length, folds, cost, files });
    log(`${source.name}: imported as "${built.model.name}", ${built.model.steps.length} Steps, ${folds} Folds, ${dollars(cost)} -> ${files[0]}`);
  }
  return run;
}

function whyNotBuilt(built: Exclude<Built, { ok: true }>): FailedReason {
  switch (built.reason) {
    case "invalid":
      return { kind: "invalid", message: `Claude's answer is not a Model recipe: ${built.problems.join("; ")}`, problems: built.problems };
    case "refused":
      return {
        kind: "refused",
        message: `Step ${built.step}, Fold ${built.fold}: the engine refused it (${built.refusal})`,
        step: built.step,
        fold: built.fold,
        refusal: built.refusal,
      };
    case "unrecordable":
      return {
        kind: "unrecordable",
        message: `Step ${built.step}, Fold ${built.fold} replays, but its motion could not be recorded: ${built.message}`,
        step: built.step,
        fold: built.fold,
      };
  }
}
