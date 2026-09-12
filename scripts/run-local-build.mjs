import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
if (readdirSync(root).some((name) => name.toLowerCase().startsWith(".env") && name !== ".env.example") || existsSync(new URL("../data", import.meta.url))) {
  throw new Error("Use an isolated checkout without .env files or data/. Nothing was read.");
}
const env = { NODE_ENV: "production", CI: "1", NEXT_TELEMETRY_DISABLED: "1" };
for (const key of Object.keys(process.env)) {
  if (/^(path|systemroot|windir|temp|tmp|comspec|pathext|systemdrive)$/i.test(key) && process.env[key] !== undefined) env[key] = process.env[key];
}
env.NODE_OPTIONS = `--import=${new URL("./local-network-guard.mjs", import.meta.url).href}`;
const result = spawnSync(process.execPath, [fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)), "build", "--webpack"], {
  cwd: root, env, stdio: "inherit", windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
