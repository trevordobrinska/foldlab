// Runs scripts/record.ts under Node and writes the Recordings it makes to
// src/recordings/<name>.json (all of them, or only the names given as
// arguments: `npm run record -- cup-1`). Our TypeScript is loaded through
// Vite (scripts/typescript.mjs).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withTypeScript } from "./typescript.mjs";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/recordings");

await withTypeScript(async (load) => {
  const { recordAll } = await load("./scripts/record.ts");
  mkdirSync(dir, { recursive: true });
  for (const { name, recording, json, seconds } of recordAll(process.argv.slice(2))) {
    const file = resolve(dir, `${name}.json`);
    writeFileSync(file, json);
    console.log(
      `${name}: ${recording.frameCount} snapshots of ${recording.vertexCount} vertices, ` +
        `${(json.length / 1024).toFixed(0)} kB, ${seconds.toFixed(1)} s -> ${file}`,
    );
  }
});
