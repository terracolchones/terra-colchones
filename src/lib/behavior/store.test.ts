import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  BehaviorServiceError, createBehaviorStore, validateBehaviorInstructions,
  type BehaviorState, type BehaviorStorage,
} from "@/lib/behavior/store";
import type { BehaviorVersion } from "@/lib/behavior/types";
import {
  assertBehaviorShape, authorizeBehaviorRequest, behaviorErrorResponse, behaviorRevision, readBehaviorInput,
} from "@/lib/behavior/api";

// Importing the configuration module must never open any SQLite database.
vi.mock("better-sqlite3", () => ({
  default: class ForbiddenDatabase {
    constructor() { throw new Error("SQLite must not be opened in synthetic tests."); }
  },
}));

function memoryStorage() {
  let state: BehaviorState = { revision: 0, activeId: 0, draftInstructions: null };
  let versions: BehaviorVersion[] = [];
  let failWrite = false;
  const storage: BehaviorStorage = {
    transaction<T>(operation: () => T): T {
      const previousState = { ...state };
      const previousVersions = versions.map((version) => ({ ...version }));
      try { return operation(); }
      catch (error) { state = previousState; versions = previousVersions; throw error; }
    },
    readState: () => ({ ...state }),
    writeState(next) {
      if (failWrite) throw new Error("Synthetic persistence failure");
      state = { ...next };
    },
    readVersion: (id) => versions.find((version) => version.id === id),
    listVersions: (limit) => versions.slice().reverse().slice(0, limit),
    insertVersion(input) {
      const version = { ...input, id: versions.length + 1 };
      versions.push(version);
      return version;
    },
  };
  return { storage, failWrites: () => { failWrite = true; } };
}

function fixture() {
  const persistence = memoryStorage();
  return {
    ...persistence,
    store: createBehaviorStore(persistence.storage, "Instrucciones iniciales", () => "2026-09-12T12:00:00.000Z"),
  };
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("versioned agent behavior", () => {
  it("starts with the built-in version and keeps drafts out of the active instructions", () => {
    const { store } = fixture();
    const initial = store.getBehaviorSnapshot();
    expect(initial).toMatchObject({ revision: 0, active: { id: 0 }, draft: null, source: "built_in" });
    const saved = store.saveBehaviorDraft("  Responde con cercanía  ", initial.revision);
    expect(saved).toMatchObject({ revision: 1, draft: { instructions: "Responde con cercanía" }, active: initial.active });
    expect(store.getActiveBehavior()).toEqual(initial.active);
    const published = store.publishBehaviorDraft(saved.revision);
    expect(published).toMatchObject({ revision: 2, draft: null, source: "saved", active: {
      id: 1, instructions: "Responde con cercanía", createdAt: "2026-09-12T12:00:00.000Z",
    } });
    expect(store.getActiveBehavior()).toEqual(published.active);
  });

  it("rejects stale saves, publications and restores without overwriting work", () => {
    const { store } = fixture();
    const first = store.saveBehaviorDraft("Primer borrador", 0);
    for (const action of [
      () => store.saveBehaviorDraft("Edición antigua", 0),
      () => store.publishBehaviorDraft(0),
      () => store.restoreBehaviorVersion(0, 0),
    ]) {
      expect(action).toThrow(expect.objectContaining({ status: 409 }));
      expect(store.getBehaviorSnapshot()).toEqual(first);
    }
  });

  it("reads publication from another store immediately instead of caching active content", () => {
    const { store, storage } = fixture();
    const secondProcess = createBehaviorStore(storage, "Instrucciones iniciales");
    expect(secondProcess.getActiveBehavior().id).toBe(0);
    store.saveBehaviorDraft("Nueva versión", 0);
    store.publishBehaviorDraft(1);
    expect(secondProcess.getActiveBehavior()).toMatchObject({ id: 1, instructions: "Nueva versión" });
    expect(() => secondProcess.saveBehaviorDraft("Borrador desactualizado", 0)).toThrow(expect.objectContaining({ status: 409 }));
  });

  it("restores as a new immutable version while preserving an existing draft", () => {
    const { store } = fixture();
    store.saveBehaviorDraft("Versión uno", 0);
    const first = store.publishBehaviorDraft(1);
    store.saveBehaviorDraft("Versión dos", 2);
    store.publishBehaviorDraft(3);
    store.saveBehaviorDraft("Trabajo sin publicar", 4);
    const restored = store.restoreBehaviorVersion(1, 5);
    expect(restored).toMatchObject({ revision: 6, active: { id: 3, instructions: "Versión uno", restoredFrom: 1 }, draft: { instructions: "Trabajo sin publicar" } });
    expect(restored.versions.find((version) => version.id === 1)).toEqual(first.active);
    const builtIn = store.restoreBehaviorVersion(0, 6);
    expect(builtIn.active).toMatchObject({ id: 4, instructions: "Instrucciones iniciales", restoredFrom: 0 });
    expect(builtIn.source).toBe("saved");
  });

  it("does not leave a partial version when activation fails", () => {
    const { store, failWrites } = fixture();
    const draft = store.saveBehaviorDraft("Borrador recuperable", 0);
    failWrites();
    expect(() => store.publishBehaviorDraft(1)).toThrow("Synthetic persistence failure");
    expect(store.getBehaviorSnapshot()).toEqual(draft);
  });

  it("retains older versions even when the panel returns only the recent history", () => {
    const { store } = fixture();
    for (let index = 0; index < 23; index++) {
      store.saveBehaviorDraft(`Versión ${index + 1}`, index * 2);
      store.publishBehaviorDraft(index * 2 + 1);
    }
    const snapshot = store.getBehaviorSnapshot();
    expect(snapshot.versions).toHaveLength(20);
    expect(snapshot.versions.some((version) => version.id === 0)).toBe(true);
    expect(snapshot.versions.some((version) => version.id === 1)).toBe(false);
    expect(store.restoreBehaviorVersion(1, snapshot.revision).active.instructions).toBe("Versión 1");
  });

  it("validates input and does not publish without a saved draft", () => {
    const { store } = fixture();
    expect(() => store.publishBehaviorDraft(0)).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => store.restoreBehaviorVersion(999, 0)).toThrow(expect.objectContaining({ status: 404 }));
    for (const invalid of ["", "  ", "x".repeat(12_001), null, 42, {}]) {
      expect(() => validateBehaviorInstructions(invalid)).toThrow(BehaviorServiceError);
    }
    expect(validateBehaviorInstructions("x".repeat(12_000))).toHaveLength(12_000);
    for (const invalid of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => store.saveBehaviorDraft("Texto", invalid)).toThrow(BehaviorServiceError);
      expect(() => store.restoreBehaviorVersion(invalid, 0)).toThrow(BehaviorServiceError);
    }
    expect(store.getBehaviorSnapshot().revision).toBe(0);
  });
});

const url = "https://agent.invalid/api/behavior";
function request(body: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "PUT", body,
    headers: { "content-type": "application/json", origin: "https://agent.invalid", ...headers },
  });
}

describe("behavior API boundaries", () => {
  it("fails closed when dashboard authentication is missing or incorrect", () => {
    vi.stubEnv("DASHBOARD_BASIC_AUTH_USER", "");
    vi.stubEnv("DASHBOARD_BASIC_AUTH_PASSWORD", "");
    expect(authorizeBehaviorRequest(request("{}"), true)?.status).toBe(503);
    vi.stubEnv("DASHBOARD_BASIC_AUTH_USER", "synthetic");
    vi.stubEnv("DASHBOARD_BASIC_AUTH_PASSWORD", "local-test");
    expect(authorizeBehaviorRequest(request("{}"), true)?.status).toBe(401);
  });

  it("requires the request's own origin for mutations even with valid authentication", () => {
    vi.stubEnv("DASHBOARD_BASIC_AUTH_USER", "synthetic");
    vi.stubEnv("DASHBOARD_BASIC_AUTH_PASSWORD", "local-test");
    const authorization = `Basic ${Buffer.from("synthetic:local-test").toString("base64")}`;
    expect(authorizeBehaviorRequest(request("{}", { authorization, "sec-fetch-site": "same-origin" }), true)).toBeNull();
    const rejectedHeaders: Record<string, string>[] = [
      { origin: "https://other.invalid" }, { origin: "null" }, { origin: "" },
      { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" },
    ];
    for (const overrides of rejectedHeaders) {
      expect(authorizeBehaviorRequest(request("{}", { authorization, ...overrides }), true)?.status).toBe(403);
    }
  });

  it("checks the real Host when Next normalizes the request URL hostname", () => {
    vi.stubEnv("DASHBOARD_BASIC_AUTH_USER", "synthetic");
    vi.stubEnv("DASHBOARD_BASIC_AUTH_PASSWORD", "local-test");
    const authorization = `Basic ${Buffer.from("synthetic:local-test").toString("base64")}`;
    const normalized = (overrides: Record<string, string> = {}) => new NextRequest("http://localhost:3187/api/behavior", {
      method: "PUT", body: "{}", headers: {
        authorization, "content-type": "application/json", host: "127.0.0.1:3187",
        origin: "http://127.0.0.1:3187", "sec-fetch-site": "same-origin", ...overrides,
      },
    });
    expect(authorizeBehaviorRequest(normalized(), true)).toBeNull();
    expect(authorizeBehaviorRequest(normalized({ origin: "http://localhost:3187" }), true)?.status).toBe(403);
    expect(authorizeBehaviorRequest(normalized({ origin: "https://127.0.0.1:3187" }), true)?.status).toBe(403);
    expect(authorizeBehaviorRequest(normalized({ host: "other.invalid" }), true)?.status).toBe(403);
    expect(authorizeBehaviorRequest(normalized({ origin: "http://other.invalid", "x-forwarded-host": "other.invalid" }), true)?.status).toBe(403);
    expect(authorizeBehaviorRequest(normalized({ host: "127.0.0.1:3187@other.invalid" }), true)?.status).toBe(403);
  });

  it("bounds declared and streamed bodies before parsing JSON", async () => {
    await expect(readBehaviorInput(request("{}", { "content-length": "100000" }))).rejects.toMatchObject({ status: 413 });
    await expect(readBehaviorInput(request(JSON.stringify({ instructions: "x".repeat(66_000) })))).rejects.toMatchObject({ status: 413 });
    await expect(readBehaviorInput(request("{}", { "content-type": "text/plain" }))).rejects.toMatchObject({ status: 415 });
    await expect(readBehaviorInput(request("not-json"))).rejects.toMatchObject({ status: 400 });
    await expect(readBehaviorInput(request("[]"))).rejects.toMatchObject({ status: 400 });
    await expect(readBehaviorInput(request("null"))).rejects.toMatchObject({ status: 400 });
    expect(await readBehaviorInput(request('{"expectedRevision":0}'))).toEqual({ expectedRevision: 0 });
  });

  it("rejects unknown fields and coerced revisions", () => {
    expect(() => assertBehaviorShape({ expectedRevision: 0, extra: true }, ["expectedRevision"])).toThrow();
    expect(() => assertBehaviorShape({}, ["expectedRevision"])).toThrow();
    expect(() => assertBehaviorShape({ expectedRevision: 0 }, ["expectedRevision"])).not.toThrow();
    for (const value of ["0", null, true, -1, 0.5, Number.NaN]) expect(() => behaviorRevision(value)).toThrow();
    expect(behaviorRevision(0)).toBe(0);
  });

  it("returns safe errors without private data or driver details", async () => {
    const response = behaviorErrorResponse(new Error("SQL private-path private-instructions"));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toMatch(/SQL|private/);
    expect(behaviorErrorResponse(new BehaviorServiceError("Conflicto", 409)).status).toBe(409);
  });
});
