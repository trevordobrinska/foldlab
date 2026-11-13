// Runs our TypeScript under Node for the scripts in this folder. Node can't
// load it as it is (extensionless imports), so this borrows Vite's SSR module
// loader, which is already a dependency; nothing else is installed for it.
import { createServer } from "vite";

/**
 * Calls `run` with `load`, which loads a TypeScript module by its path from
 * the repo's root ("./src/..."), and closes Vite again whatever happens.
 */
export async function withTypeScript(run) {
  const server = await createServer({
    configFile: false,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    return await run((path) => server.ssrLoadModule(path));
  } finally {
    await server.close();
  }
}
