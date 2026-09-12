import "server-only";

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import {
  MAX_BEHAVIOR_INSTRUCTIONS_LENGTH,
  type BehaviorSnapshot,
  type BehaviorVersion,
} from "@/lib/behavior/types";

export class BehaviorServiceError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409 | 503 = 400) {
    super(message);
    this.name = "BehaviorServiceError";
  }
}

export interface BehaviorState {
  revision: number;
  activeId: number;
  draftInstructions: string | null;
}

/** All methods in a transaction must observe the same committed state. */
export interface BehaviorStorage {
  transaction<T>(operation: () => T): T;
  readState(): BehaviorState;
  writeState(state: BehaviorState): void;
  readVersion(id: number): BehaviorVersion | undefined;
  listVersions(limit: number): BehaviorVersion[];
  insertVersion(version: Omit<BehaviorVersion, "id">): BehaviorVersion;
}

function validateRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BehaviorServiceError("La revisión no es válida.");
  }
}

export function validateBehaviorInstructions(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_BEHAVIOR_INSTRUCTIONS_LENGTH || !value.trim()) {
    throw new BehaviorServiceError("Las instrucciones deben tener entre 1 y 12.000 caracteres.");
  }
  return value.trim();
}

/** Injectable persistence keeps local tests independent from operational databases. */
export function createBehaviorStore(
  storage: BehaviorStorage,
  builtInInstructions = SYSTEM_PROMPT,
  now: () => string = () => new Date().toISOString(),
) {
  const builtIn: BehaviorVersion = {
    id: 0,
    instructions: builtInInstructions,
    createdAt: "1970-01-01T00:00:00.000Z",
  };

  function versionById(id: number): BehaviorVersion {
    if (id === 0) return { ...builtIn };
    const version = storage.readVersion(id);
    if (!version) throw new BehaviorServiceError("La versión solicitada no está disponible.", 404);
    return { ...version };
  }

  function snapshot(): BehaviorSnapshot {
    const state = storage.readState();
    return {
      revision: state.revision,
      active: versionById(state.activeId),
      draft: state.draftInstructions === null ? null : { instructions: state.draftInstructions },
      versions: [...storage.listVersions(19).map((version) => ({ ...version })), { ...builtIn }],
      source: state.activeId === 0 ? "built_in" : "saved",
    };
  }

  function checkedState(expectedRevision: number): BehaviorState {
    const state = storage.readState();
    if (state.revision !== expectedRevision) {
      throw new BehaviorServiceError("Otra edición cambió la configuración. Recarga antes de guardar o publicar.", 409);
    }
    return state;
  }

  return {
    getBehaviorSnapshot(): BehaviorSnapshot {
      return storage.transaction(snapshot);
    },
    getActiveBehavior(): BehaviorVersion {
      return storage.transaction(() => versionById(storage.readState().activeId));
    },
    saveBehaviorDraft(instructions: string, expectedRevision: number): BehaviorSnapshot {
      const validated = validateBehaviorInstructions(instructions);
      validateRevision(expectedRevision);
      return storage.transaction(() => {
        const state = checkedState(expectedRevision);
        storage.writeState({ ...state, revision: state.revision + 1, draftInstructions: validated });
        return snapshot();
      });
    },
    publishBehaviorDraft(expectedRevision: number): BehaviorSnapshot {
      validateRevision(expectedRevision);
      return storage.transaction(() => {
        const state = checkedState(expectedRevision);
        if (state.draftInstructions === null) throw new BehaviorServiceError("Guarda un borrador antes de publicar.");
        const version = storage.insertVersion({
          instructions: validateBehaviorInstructions(state.draftInstructions),
          createdAt: now(),
        });
        storage.writeState({ revision: state.revision + 1, activeId: version.id, draftInstructions: null });
        return snapshot();
      });
    },
    restoreBehaviorVersion(versionId: number, expectedRevision: number): BehaviorSnapshot {
      validateRevision(expectedRevision);
      if (!Number.isSafeInteger(versionId) || versionId < 0) throw new BehaviorServiceError("La versión no es válida.");
      return storage.transaction(() => {
        const state = checkedState(expectedRevision);
        const restored = versionById(versionId);
        const version = storage.insertVersion({
          instructions: restored.instructions,
          createdAt: now(),
          restoredFrom: versionId,
        });
        // Restoring changes the active version; it does not discard another draft.
        storage.writeState({ ...state, revision: state.revision + 1, activeId: version.id });
        return snapshot();
      });
    },
  };
}

type VersionRow = { id: number; instructions: string; created_at: string; restored_from: number | null };

function fromRow(row: VersionRow): BehaviorVersion {
  return {
    id: row.id,
    instructions: row.instructions,
    createdAt: row.created_at,
    ...(row.restored_from === null ? {} : { restoredFrom: row.restored_from }),
  };
}

function sqliteStorage(filename: string): BehaviorStorage {
  mkdirSync(path.dirname(filename), { recursive: true });
  const database = new Database(filename);
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS behavior_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instructions TEXT NOT NULL,
      created_at TEXT NOT NULL,
      restored_from INTEGER
    );
    CREATE TABLE IF NOT EXISTS behavior_state (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      revision INTEGER NOT NULL DEFAULT 0,
      active_id INTEGER NOT NULL DEFAULT 0,
      draft_instructions TEXT
    );
    INSERT OR IGNORE INTO behavior_state (singleton, revision, active_id) VALUES (1, 0, 0);
  `);

  return {
    transaction: <T>(operation: () => T): T => database.transaction(operation).immediate(),
    readState() {
      const row = database.prepare("SELECT revision, active_id, draft_instructions FROM behavior_state WHERE singleton = 1")
        .get() as { revision: number; active_id: number; draft_instructions: string | null };
      return { revision: row.revision, activeId: row.active_id, draftInstructions: row.draft_instructions };
    },
    writeState(state) {
      database.prepare("UPDATE behavior_state SET revision = ?, active_id = ?, draft_instructions = ? WHERE singleton = 1")
        .run(state.revision, state.activeId, state.draftInstructions);
    },
    readVersion(id) {
      const row = database.prepare("SELECT * FROM behavior_versions WHERE id = ?").get(id) as VersionRow | undefined;
      return row ? fromRow(row) : undefined;
    },
    listVersions(limit) {
      return (database.prepare("SELECT * FROM behavior_versions ORDER BY id DESC LIMIT ?").all(limit) as VersionRow[]).map(fromRow);
    },
    insertVersion(version) {
      const result = database.prepare("INSERT INTO behavior_versions (instructions, created_at, restored_from) VALUES (?, ?, ?)")
        .run(version.instructions, version.createdAt, version.restoredFrom ?? null);
      return { ...version, id: Number(result.lastInsertRowid) };
    },
  };
}

let cached: { filename: string; store: ReturnType<typeof createBehaviorStore> } | undefined;

function withStore<T>(operation: (store: ReturnType<typeof createBehaviorStore>) => T): T {
  try {
    const filename = path.resolve(process.env.TERRA_BEHAVIOR_DB_PATH || path.join(process.cwd(), "data", "agent-behavior.db"));
    if (!cached || cached.filename !== filename) {
      cached = { filename, store: createBehaviorStore(sqliteStorage(filename)) };
    }
    return operation(cached.store);
  } catch (error) {
    if (error instanceof BehaviorServiceError) throw error;
    // Do not expose paths, SQL, instructions or driver errors through the panel.
    throw new BehaviorServiceError("La configuración del agente no está disponible. Intenta de nuevo.", 503);
  }
}

export function getBehaviorSnapshot(): BehaviorSnapshot {
  return withStore((store) => store.getBehaviorSnapshot());
}

export function getActiveBehavior(): BehaviorVersion {
  return withStore((store) => store.getActiveBehavior());
}

export function saveBehaviorDraft(instructions: string, expectedRevision: number): BehaviorSnapshot {
  return withStore((store) => store.saveBehaviorDraft(instructions, expectedRevision));
}

export function publishBehaviorDraft(expectedRevision: number): BehaviorSnapshot {
  return withStore((store) => store.publishBehaviorDraft(expectedRevision));
}

export function restoreBehaviorVersion(versionId: number, expectedRevision: number): BehaviorSnapshot {
  return withStore((store) => store.restoreBehaviorVersion(versionId, expectedRevision));
}
