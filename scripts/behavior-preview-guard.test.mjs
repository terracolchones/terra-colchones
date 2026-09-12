import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("preview guard isolates providers and operational files while allowing its local panel", () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "terra-preview-guard-test-"));
  const env = { TERRA_BEHAVIOR_PREVIEW: "1", TERRA_BEHAVIOR_PREVIEW_ROOT: temporaryRoot };
  const allowedSystemKeys = /^(path|systemroot|windir|temp|tmp|comspec|pathext|systemdrive)$/i;
  for (const key of Object.keys(process.env)) {
    if (allowedSystemKeys.test(key) && process.env[key] !== undefined) env[key] = process.env[key];
  }
  const code = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import fsPromises from "node:fs/promises";
    import path from "node:path";
    import http from "node:http";
    import https from "node:https";
    import http2 from "node:http2";
    import net from "node:net";
    import tls from "node:tls";
    import dns from "node:dns";
    import dnsPromises from "node:dns/promises";
    const blocked = /TERRA_PREVIEW/;
    assert.throws(() => http.get("http://external.invalid/"), blocked);
    assert.throws(() => https.request("https://external.invalid/"), blocked);
    assert.throws(() => http2.connect("https://external.invalid/"), blocked);
    await assert.rejects(fetch("https://external.invalid/"), blocked);
    assert.throws(() => new net.Socket().connect(443, "external.invalid"), blocked);
    assert.throws(() => tls.connect({ host: "external.invalid", port: 443 }), blocked);
    assert.throws(() => dns.lookup("external.invalid", () => {}), blocked);
    assert.throws(() => dnsPromises.lookup("external.invalid"), blocked);
    assert.throws(() => new dns.Resolver().resolve4("external.invalid", () => {}), blocked);
    assert.throws(() => new dnsPromises.Resolver().resolve4("external.invalid"), blocked);
    assert.throws(() => net.createServer().listen(0, "0.0.0.0"), blocked);
    const data = path.join(process.env.TERRA_BEHAVIOR_PREVIEW_ROOT, "data");
    assert.throws(() => fs.mkdirSync(data), blocked);
    assert.throws(() => fs.writeFileSync(path.join(data, "messages.db"), "synthetic"), blocked);
    assert.throws(() => fsPromises.readFile(path.join(data, "messages.db")), blocked);
    assert.throws(() => fs.readFileSync(path.join(process.env.TERRA_BEHAVIOR_PREVIEW_ROOT, ".env.local")), blocked);
    assert.equal(fs.existsSync(data), false);
    let delivered = 0;
    const server = http.createServer((request, response) => {
      delivered += 1;
      if (request.url === "/api/behavior/redirect") {
        response.writeHead(307, { Location: "https://external.invalid/" });
      } else {
        response.writeHead(200, { "Content-Type": "text/plain" });
      }
      response.end("synthetic preview");
    });
    await new Promise((resolve) => server.listen(0, resolve));
    assert.equal(server.address().address, "127.0.0.1");
    const base = "http://localhost:" + server.address().port;
    try {
      for (const pathname of ["/comportamiento", "/api/behavior", "/api/behavior/test", "/_next/static/example.js", "/favicon.ico"]) {
        const response = await fetch(base + pathname);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), "synthetic preview");
      }
      assert.equal(delivered, 5);
      const denied = await fetch(base + "/api/webhook");
      assert.equal(denied.status, 403);
      await denied.text();
      const navigation = await fetch(base + "/", { redirect: "manual" });
      assert.equal(navigation.status, 307);
      assert.equal(navigation.headers.get("location"), "/comportamiento");
      await navigation.text();
      assert.equal(delivered, 5);
      await assert.rejects(fetch(base + "/api/behavior/redirect"), (error) => blocked.test(String(error.cause)));
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    console.log("Guard checks passed; no application server or operational database was started.");
  `;
  try {
    const result = spawnSync(process.execPath, [
      `--import=${new URL("./behavior-preview-guard.mjs", import.meta.url).href}`,
      "--input-type=module", "-e", code,
    ], { env, encoding: "utf8", timeout: 20000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.error?.message || "Guard smoke failed.");
    assert.match(result.stdout, /Guard checks passed/);
  } finally {
    // Nonrecursive removal of the empty directory created by this test only.
    rmdirSync(temporaryRoot);
  }
});
