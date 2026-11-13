// `npm run import`: Import (src/import/import.ts) on Dad's computer. Every
// Source in import/inbox/ not yet imported is shown to the Claude API; each
// one whose every Step replays in the engine is written to src/library/
// (<id>.json, the Model file, and <id>.recipe.json, what it was built from);
// each other one is recorded in import/work/failed/<id>.json with the reason.
//
//   $env:ANTHROPIC_API_KEY = "sk-ant-..."     (PowerShell; the key is never written to a file)
//   npm run import                            every Source not yet imported
//   npm run import -- cup.pdf                 only this one, again if need be
//   npm run import -- --cap 2 cup.pdf         a cost cap of $2 for the run (default $5)
//
// A Source is one file (pdf, png, jpg, gif, webp) or a folder of them (pages
// in name order); its name, less the extension, is the Model's id. Like
// scripts/library.mjs, this borrows Vite's SSR module loader to run our
// TypeScript.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let costCap;
const capAt = args.indexOf("--cap");
if (capAt >= 0) {
  costCap = Number(args[capAt + 1]);
  if (!(costCap > 0)) {
    console.error("--cap needs a number of dollars above 0, such as --cap 2");
    process.exit(2);
  }
  args.splice(capAt, 2);
}

const server = await createServer({
  configFile: false,
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { runImport } = await server.ssrLoadModule("./src/import/import.ts");
  const { connectClaude } = await server.ssrLoadModule("./src/import/claude.ts");
  const run = await runImport({
    inbox: resolve(root, "import/inbox"),
    library: resolve(root, "src/library"),
    failed: resolve(root, "import/work/failed"),
    only: args,
    env: process.env,
    connect: connectClaude,
    costCap,
  });
  const tried = run.imported.length + run.failed.length;
  if (!tried && !run.stopped) console.log("Nothing to import: put a Source in import/inbox/ (or name one to import it again).");
  console.log(`${run.imported.length} imported, ${run.failed.length} Failed imports, ${run.notTried.length} not tried; about $${run.spent.toFixed(2)} spent.`);
  if (run.imported.length) {
    console.log("Now run `npm test` and `npm run dev`, fold each new Model against its Source, then commit src/library/.");
  }
  process.exitCode = run.stopped || run.failed.length ? 1 : 0;
} finally {
  await server.close();
}
