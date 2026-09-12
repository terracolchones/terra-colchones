import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import http2 from "node:http2";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import { fileURLToPath } from "node:url";
import { syncBuiltinESMExports } from "node:module";

// Defense against accidental provider calls, not an operating-system sandbox.
// Loaded before Next and inherited by its Node workers. Errors omit destinations.
if (process.env.TERRA_BEHAVIOR_PREVIEW !== "1" || !process.env.TERRA_BEHAVIOR_PREVIEW_ROOT) {
  throw new Error("Use npm run preview:behavior to enable this guard.");
}

const root = path.resolve(process.env.TERRA_BEHAVIOR_PREVIEW_ROOT);
const rootNames = fs.readdirSync(root).map((name) => name.toLowerCase());
if (rootNames.some((name) => name.startsWith(".env") && name !== ".env.example") || rootNames.includes("data")) {
  throw new Error("TERRA_PREVIEW: checkout is not isolated. No operational file was read.");
}

function blocked() {
  throw new Error("TERRA_PREVIEW: external network access is disabled.");
}

function loopback(host) {
  const value = String(host ?? "localhost").toLowerCase();
  if (value === "localhost" || value === "127.0.0.1") return "127.0.0.1";
  if (value === "::1" || value === "[::1]") return "::1";
  return blocked();
}

function socketArgs(args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  if (typeof first === "object" && first !== null) {
    if (first.path || first.socketPath || first.host === "" || first.hostname === "") return blocked();
    return [{ ...first, host: loopback(first.hostname ?? first.host) }, ...normalized.slice(1)];
  }
  if (typeof first === "number") {
    const hasHost = typeof normalized[1] === "string";
    return [first, loopback(hasHost ? normalized[1] : undefined), ...normalized.slice(hasHost ? 2 : 1)];
  }
  return blocked();
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  return originalConnect.apply(this, socketArgs(args));
};
const originalTlsConnect = tls.connect;
tls.connect = function (...args) {
  return originalTlsConnect.apply(this, socketArgs(args));
};
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  return originalListen.apply(this, socketArgs(args));
};
dgram.Socket.prototype.send = blocked;

function checkHttpTarget(args) {
  const first = args[0];
  const isUrl = typeof first === "string" || first instanceof URL;
  const url = isUrl ? new URL(first) : null;
  if (url && url.protocol !== "http:" && url.protocol !== "https:") return blocked();
  const options = isUrl && typeof args[1] === "object" ? args[1] : !isUrl ? first : {};
  if (options?.socketPath) return blocked();
  loopback(options?.hostname ?? options?.host ?? url?.hostname);
}

for (const transportModule of [http, https]) {
  for (const method of ["request", "get"]) {
    const original = transportModule[method];
    transportModule[method] = function (...args) {
      checkHttpTarget(args);
      return original.apply(this, args);
    };
  }
}
const originalHttp2Connect = http2.connect;
http2.connect = function (...args) {
  checkHttpTarget([args[0]]);
  return originalHttp2Connect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const url = input instanceof Request ? input.url : input;
  checkHttpTarget([url]);
  return originalFetch.call(this, input, init);
};

// No DNS query for localhost: normalize it to an IP before the built-in lookup.
const originalLookup = dns.lookup;
dns.lookup = function (hostname, ...args) {
  return originalLookup.call(this, loopback(hostname), ...args);
};
const originalPromiseLookup = dnsPromises.lookup;
dnsPromises.lookup = function (hostname, ...args) {
  return originalPromiseLookup.call(this, loopback(hostname), ...args);
};
for (const dnsModule of [dns, dnsPromises]) {
  for (const method of Object.keys(dnsModule)) {
    if (method.startsWith("resolve") || method === "reverse" || method === "lookupService") dnsModule[method] = blocked;
  }
  for (const method of Object.getOwnPropertyNames(dnsModule.Resolver.prototype)) {
    if (method.startsWith("resolve") || method === "reverse") dnsModule.Resolver.prototype[method] = blocked;
  }
}

function permittedRoute(url) {
  return url.pathname === "/comportamiento" || url.pathname === "/comportamiento/" ||
    url.pathname === "/api/behavior" || url.pathname.startsWith("/api/behavior/") ||
    url.pathname.startsWith("/_next/") || url.pathname === "/favicon.ico";
}

// Restrict inbound routes before Next so navigation cannot open messages.db.
for (const Server of [http.Server, https.Server]) {
  const emit = Server.prototype.emit;
  Server.prototype.emit = function (event, ...args) {
    if (event === "request" || event === "upgrade") {
      let url;
      try { url = new URL(args[0].url, "http://127.0.0.1:3187"); } catch { url = null; }
      if (!url || !permittedRoute(url)) {
        if (event === "upgrade") {
          args[1].destroy();
        } else {
          const response = args[1];
          response.setHeader("Cache-Control", "no-store");
          if (url?.pathname === "/") {
            response.writeHead(307, { Location: "/comportamiento" });
            response.end();
          } else {
            response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Vista local: solo está habilitado el panel Comportamiento.");
          }
        }
        return true;
      }
    }
    return emit.call(this, event, ...args);
  };
}

function checkFile(value) {
  if (typeof value !== "string" && !Buffer.isBuffer(value) && !(value instanceof URL)) return;
  const filename = path.resolve(value instanceof URL ? fileURLToPath(value) : String(value));
  const relative = path.relative(root, filename).replaceAll("\\", "/").toLowerCase();
  if (!relative.includes("/") && relative.startsWith(".env") && relative !== ".env.example") {
    // Next probes absent env files on startup. Report them as absent without
    // reading anything, even if a file appeared after launcher preflight.
    const error = new Error("TERRA_PREVIEW: operational files are disabled.");
    error.code = "ENOENT";
    throw error;
  }
  if (relative === "data" || relative.startsWith("data/")) {
    throw new Error("TERRA_PREVIEW: operational files are disabled.");
  }
}

// SQLite is native; blocking getDatabase's mkdir(data) prevents its construction.
// The preview's separate behavior database is outside this protected directory.
for (const fsModule of [fs, fsPromises]) {
  for (const method of [
    "open", "openSync", "readFile", "readFileSync", "writeFile", "writeFileSync",
    "appendFile", "appendFileSync", "mkdir", "mkdirSync", "readdir", "readdirSync",
    "stat", "statSync", "lstat", "lstatSync", "access", "accessSync",
    "createReadStream", "createWriteStream", "unlink", "unlinkSync", "rm", "rmSync",
    "rmdir", "rmdirSync", "rename", "renameSync", "copyFile", "copyFileSync",
  ]) {
    const original = fsModule[method];
    if (typeof original !== "function") continue;
    fsModule[method] = function (...args) {
      checkFile(args[0]);
      if (["rename", "renameSync", "copyFile", "copyFileSync"].includes(method)) checkFile(args[1]);
      return original.apply(this, args);
    };
  }
}

syncBuiltinESMExports();
