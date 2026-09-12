import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diagnostic, messageRef, type ClosedEvent } from "./diagnostics";

const output = vi.fn();
let restoreOutput: () => void;
beforeEach(() => {
  output.mockReset();
  const spy = vi.spyOn(console, "info").mockImplementation(output);
  restoreOutput = () => spy.mockRestore();
});
afterEach(() => restoreOutput());

describe("sanitized operational diagnostics", () => {
  it("correlates a synthetic WAMID without exposing it or an unsalted hash", () => {
    const id = "synthetic-wamid-containing-private-parts";
    expect(messageRef(id)).toMatch(/^[a-f0-9]{32}$/);
    expect(messageRef(id)).toBe(messageRef(id));
    expect(messageRef(id)).not.toBe(messageRef(`${id}-other`));
    expect(messageRef(id)).not.toContain(id);
    expect(messageRef(null)).toBeUndefined();
    expect(messageRef({ id })).toBeUndefined();
    expect(messageRef("")).toBeUndefined();
    expect(messageRef("x".repeat(2049))).toBeUndefined();
  });

  it("serializes only allowed fields, never provider content or arbitrary properties", () => {
    diagnostic({
      event: "message.status", status: "failed", message_ref: messageRef("synthetic-wamid"),
      code: 123, subcode: 456, error_codes: [123, 456], elapsed_ms: 5, http_status: 400,
      body: "test-only-private-body", phone: "test-only-private-recipient", token: "test-only-private-token",
      error: new Error("test-only-private-error"), url: "https://test-only-private.invalid",
    } as ClosedEvent);
    expect(output).toHaveBeenCalledTimes(1);
    const record = JSON.parse(String(output.mock.calls[0][1]));
    expect(record).toEqual({
      ts: expect.any(String), event: "message.status", status: "failed",
      message_ref: messageRef("synthetic-wamid"), code: 123, subcode: 456, error_codes: [123, 456], elapsed_ms: 5, http_status: 400,
    });
    expect(Number.isNaN(Date.parse(record.ts))).toBe(false);
    expect(JSON.stringify(output.mock.calls)).not.toContain("test-only-private");
  });

  it("rejects unknown events and removes invalid runtime types or injected values", () => {
    diagnostic({ event: "test-only-private-event" } as unknown as ClosedEvent);
    expect(output).not.toHaveBeenCalled();
    diagnostic({
      event: "send.uncertain", kind: "test-only-private-kind", status: "test-only-private-status",
      message_ref: "synthetic-raw-wamid", attempt_ref: "synthetic-raw-attempt",
      code: "test-only-private-code", subcode: Number.NaN, elapsed_ms: -1, http_status: 999,
      error_codes: [1, "test-only-private-code", -1, 2.5, Number.POSITIVE_INFINITY],
    } as unknown as ClosedEvent);
    expect(JSON.parse(String(output.mock.calls[0][1]))).toEqual({ ts: expect.any(String), event: "send.uncertain", error_codes: [1] });
  });

  it("caps error code arrays and does not let an output failure fail message processing", () => {
    diagnostic({ event: "message.status", error_codes: Array.from({ length: 100 }, (_, index) => index) });
    expect(JSON.parse(String(output.mock.calls[0][1])).error_codes).toHaveLength(16);
    output.mockImplementationOnce(() => { throw new Error("test-only-log-failure"); });
    expect(() => diagnostic({ event: "send.accepted" })).not.toThrow();
  });
});
