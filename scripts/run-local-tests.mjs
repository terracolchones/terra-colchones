import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// Inspect names only. Never read local credentials or an operational database.
if (readdirSync(root).some((name) => name.startsWith(".env") && name !== ".env.example") ||
    existsSync(new URL("../data", import.meta.url))) {
  throw new Error("Run only in an isolated checkout without .env files or data/. Nothing was read.");
}

// Do not forward provider credentials, proxy settings or inherited NODE_OPTIONS.
const env = { NODE_ENV: "test", CI: "1", TERRA_LOCAL_SIMULATION: "1", NEXT_TELEMETRY_DISABLED: "1" };
const allowedSystemKeys = /^(path|systemroot|windir|temp|tmp|comspec|pathext|systemdrive)$/i;
for (const key of Object.keys(process.env)) {
  if (allowedSystemKeys.test(key) && process.env[key] !== undefined) env[key] = process.env[key];
}
const guard = new URL("./local-network-guard.mjs", import.meta.url).href;
env.NODE_OPTIONS = `--import=${guard}`;
const result = spawnSync(process.execPath, [fileURLToPath(new URL("./local-tests-child.mjs", import.meta.url)), ...process.argv.slice(2)], {
  cwd: root, env, stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
