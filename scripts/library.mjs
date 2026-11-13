// Runs scripts/library.ts under Node and writes the Model files it builds to
// src/library/<id>.json (all of them, or only the ids given as arguments:
// `npm run library -- cup`). Like scripts/record.mjs, this borrows Vite's SSR
// module loader to run our TypeScript; nothing else is installed for it.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/library");

const server = await createServer({
  configFile: false,
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { buildAll } = await server.ssrLoadModule("./scripts/library.ts");
  mkdirSync(dir, { recursive: true });
  for (const { id, model, json } of buildAll(process.argv.slice(2))) {
    const file = resolve(dir, `${id}.json`);
    writeFileSync(file, json);
    const folds = model.steps.reduce((sum, step) => sum + step.folds.length, 0);
    console.log(`${id}: ${model.steps.length} Steps, ${folds} Folds, ${(json.length / 1024).toFixed(0)} kB -> ${file}`);
  }
} finally {
  await server.close();
}
