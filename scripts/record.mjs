// Runs scripts/record.ts under Node and writes the Recordings it makes to
// proto-gestures/recordings/<name>.json. Node can't load our TypeScript as
// it is (extensionless imports), so this borrows Vite's SSR module loader,
// which is already a dependency; nothing else is installed for it.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../proto-gestures/recordings");

const server = await createServer({
  configFile: false,
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { recordAll } = await server.ssrLoadModule("./scripts/record.ts");
  mkdirSync(dir, { recursive: true });
  for (const { name, recording, json, seconds } of recordAll()) {
    const file = resolve(dir, `${name}.json`);
    writeFileSync(file, json);
    console.log(
      `${name}: ${recording.frameCount} snapshots of ${recording.vertexCount} vertices, ` +
        `${(json.length / 1024).toFixed(0)} kB, ${seconds.toFixed(1)} s -> ${file}`,
    );
  }
} finally {
  await server.close();
}
