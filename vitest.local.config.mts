import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

if (process.env.TERRA_LOCAL_SIMULATION !== "1") throw new Error("Use npm run test:local.");
export default defineConfig({
  envDir: false,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
      "better-sqlite3": fileURLToPath(new URL("./src/test/sqlite-forbidden.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/local-simulation-setup.ts"],
    pool: "forks",
    maxWorkers: 2,
    reporters: ["verbose"],
  },
});
