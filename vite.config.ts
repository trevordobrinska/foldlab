import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works under the GitHub Pages project path
  // (https://trevordobrinska.github.io/foldlab/) without hard-coding the repo name.
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        // Throwaway gesture prototype (ticket 02): remove with the folder.
        protoGestures: "proto-gestures/index.html",
      },
    },
  },
});
