import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && !["--start", "--check"].includes(args[0]))) {
  throw new Error("Use npm run preview:behavior [-- --start|--check].");
}

// Inspect names only, including dangling links. Never read operational files.
const names = readdirSync(root).map((name) => name.toLowerCase());
if (names.some((name) => name.startsWith(".env") && name !== ".env.example") || names.includes("data")) {
  throw new Error("Use an isolated checkout without .env files or data/. Nothing was read.");
}

const nextCli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
if (!existsSync(nextCli)) throw new Error("Install the local dependencies before starting the preview.");
if (args[0] === "--start" && !existsSync(path.join(root, ".next", "BUILD_ID"))) {
  throw new Error("A completed local build is required for --start. Omit --start to use Next development mode.");
}
if (args[0] === "--check") {
  console.log("Preview preflight passed: isolated checkout, dependencies available. No server or database was created.");
  process.exit(0);
}

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "terra-behavior-preview-"));
// Credentials below are intentionally synthetic and only accepted by this local process.
const username = "terra-preview";
const password = "local-preview-only";
const env = {
  NODE_ENV: args[0] === "--start" ? "production" : "development",
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  TERRA_LOCAL_SIMULATION: "1",
  TERRA_BEHAVIOR_PREVIEW: "1",
  TERRA_BEHAVIOR_PREVIEW_ROOT: root,
  TERRA_BEHAVIOR_DB_PATH: path.join(temporaryDirectory, "behavior-preview.db"),
  DASHBOARD_BASIC_AUTH_USER: username,
  DASHBOARD_BASIC_AUTH_PASSWORD: password,
};
// Never forward provider credentials, proxy settings, npm config or NODE_OPTIONS.
const allowedSystemKeys = /^(path|systemroot|windir|temp|tmp|comspec|pathext|systemdrive)$/i;
for (const key of Object.keys(process.env)) {
  if (allowedSystemKeys.test(key) && process.env[key] !== undefined) env[key] = process.env[key];
}
env.NODE_OPTIONS = `--import=${new URL("./behavior-preview-guard.mjs", import.meta.url).href}`;

console.log("Local preview: http://127.0.0.1:3187/comportamiento");
console.log(`Synthetic preview login: ${username} / ${password}`);
console.log(`Drafts and versions use a new temporary database: ${temporaryDirectory}`);
console.log("Only the behavior panel is enabled. External network and operational data access are blocked.");
console.log("Stop with Ctrl+C. Temporary drafts remain in that directory for local review.");

const nextArgs = args[0] === "--start" ? ["start"] : ["dev", "--webpack"];
const child = spawn(process.execPath, [nextCli, ...nextArgs, "--hostname", "127.0.0.1", "--port", "3187"], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
  detached: false,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
child.on("error", () => {
  console.error("The local preview process could not start.");
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" || signal === "SIGTERM" ? 0 : 1);
});
