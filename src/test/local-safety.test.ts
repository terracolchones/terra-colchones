import { request } from "node:https";
import { Socket } from "node:net";
import { expect, it } from "vitest";

// Safety tests only belong to the isolated runner, not the default test command.
it.skipIf(process.env.TERRA_LOCAL_SIMULATION !== "1")("local runner blocks fetch, HTTPS and raw outbound sockets", async () => {
  await expect(fetch("https://network-check.invalid")).rejects.toThrow("TERRA_OFFLINE");
  expect(() => request("https://network-check.invalid")).toThrow("TERRA_OFFLINE");
  const socket = new Socket();
  try {
    expect(() => socket.connect(443, "network-check.invalid")).toThrow("TERRA_OFFLINE");
  } finally {
    socket.destroy();
  }
});

it.skipIf(process.env.TERRA_LOCAL_SIMULATION !== "1")("local runner replaces the SQLite constructor before database access", async () => {
  const { default: Database } = await import("better-sqlite3");
  expect(() => new Database(":memory:")).toThrow("TERRA_OFFLINE");
});
