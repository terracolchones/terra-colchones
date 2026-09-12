import { startVitest } from "vitest/node";

if (process.env.TERRA_LOCAL_SIMULATION !== "1") throw new Error("Use npm run test:local.");
const ctx = await startVitest(process.argv.slice(2), {
  config: "vitest.local.config.mts", run: true, watch: false,
}, { envDir: false, configLoader: "runner", cacheDir: ".cache/vitest" });
await ctx.close();
