import { startVitest } from "vitest/node";

if (process.env.TERRA_LOCAL_SIMULATION !== "1") throw new Error("Use npm run test:local.");
const ctx = await startVitest(process.argv.slice(2), {
  config: "vitest.local.config.mts", run: true, watch: false,
}, { envDir: false, configLoader: "runner", cacheDir: ".cache/vitest" });
try {
  // The programmatic API returns a context even after test/collection failures.
  // Read the final result explicitly; never convert an existing error exit to 0.
  const modules = ctx.state.getTestModules();
  const incompleteOrFailed = modules.some((testModule) => !["passed", "skipped"].includes(testModule.state()));
  if (modules.length === 0 || incompleteOrFailed || ctx.state.getUnhandledErrors().length > 0) {
    process.exitCode ||= 1;
  }
} finally {
  await ctx.close();
}
