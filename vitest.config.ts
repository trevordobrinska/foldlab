import { defineConfig } from "vitest/config";

// Keep agent worktrees and ticket scratch folders out of the test run.
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**", ".scratch/**"],
    passWithNoTests: true,
  },
});
