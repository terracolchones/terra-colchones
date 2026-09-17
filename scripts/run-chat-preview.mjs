import { existsSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const names = readdirSync(root).map((name) => name.toLowerCase());
if (names.some((name) => name.startsWith(".env") && name !== ".env.example") || names.includes("data")) {
  throw new Error("Use an isolated checkout without env files or operational data. Nothing was read.");
}
const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
if (!existsSync(next)) throw new Error("Local dependencies are required.");
const env = { NODE_ENV: "development", CI: "1", NEXT_TELEMETRY_DISABLED: "1", TERRA_CHAT_PREVIEW: "1", TERRA_CHAT_PREVIEW_ROOT: root };
for (const key of Object.keys(process.env)) {
  if (/^(path|systemroot|windir|temp|tmp|comspec|pathext|systemdrive)$/i.test(key)) env[key] = process.env[key];
}
env.NODE_OPTIONS = `--import=${new URL("./chat-preview-guard.mjs", import.meta.url).href}`;
console.log("Local chat preview: http://127.0.0.1:3191/preview/chat");
console.log("Synthetic browser data only. No credentials, databases or external service connections.");
const child = spawn(process.execPath, [next, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3191"], { cwd: root, env, stdio: "inherit", windowsHide: true });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("Could not start the local preview."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 0; });
