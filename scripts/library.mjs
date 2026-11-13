// Runs scripts/library.ts under Node and writes the Model files it builds to
// src/library/<id>.json (all of them, or only the ids given as arguments:
// `npm run library -- cup`). Our TypeScript is loaded through Vite
// (scripts/typescript.mjs).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withTypeScript } from "./typescript.mjs";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/library");

await withTypeScript(async (load) => {
  const { buildAll } = await load("./scripts/library.ts");
  mkdirSync(dir, { recursive: true });
  for (const { id, model, folds, json } of buildAll(process.argv.slice(2))) {
    const file = resolve(dir, `${id}.json`);
    writeFileSync(file, json);
    console.log(`${id}: ${model.steps.length} Steps, ${folds} Folds, ${(json.length / 1024).toFixed(0)} kB -> ${file}`);
  }
});
