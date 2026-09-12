// Runs the real db.ts SQL against native SQLite in memory. No application
// database path, credentials, provider or private fixture is used.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import NativeSqlite from "better-sqlite3";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const connections = [];

function databaseFixture() {
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const module = { exports: {} };
    cache.set(relative, module.exports);
    const output = ts.transpileModule(readFileSync(path.join(root, relative), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const controlledRequire = (id) => {
      if (id === "better-sqlite3") return class {
        constructor() {
          const connection = new NativeSqlite(":memory:");
          connections.push(connection);
          return connection;
        }
      };
      if (id === "node:fs") return { mkdirSync: () => {} };
      if (["@/lib/order-code", "@/lib/catalog-delivery-reservation-policy"].includes(id)) return load(`src/${id.slice(2)}.ts`);
      if (["node:crypto", "node:path"].includes(id)) return require(id);
      throw new Error("Unexpected dependency in the isolated SQL fixture.");
    };
    vm.runInNewContext(output, {
      module, exports: module.exports, require: controlledRequire,
      process: { cwd: () => "/synthetic-memory-only" }, console, Buffer,
    });
    cache.set(relative, module.exports);
    return module.exports;
  }
  const db = load("src/lib/db.ts");
  const conversation = db.getOrCreateConversation("synthetic-human-customer", null);
  db.setMode(conversation.id, "HUMAN");
  return { db, conversation };
}

function createOrder(db, conversationId, confirm = true) {
  const order = db.createCatalogOrder({ productId: "synthetic-product", productSlug: "synthetic-product", productName: "Synthetic product", variantId: null, variantLabel: null, price: 1 }, conversationId);
  if (confirm) db.claimCatalogOrder(order.public_code, conversationId);
  return db.getCatalogOrderById(order.id);
}

let passed = 0;
function check(operation) {
  try { operation(databaseFixture()); passed++; }
  finally { while (connections.length) connections.pop().close(); }
}

check(({ db, conversation }) => {
  assert.equal(db.getUnambiguousActiveCatalogOrderForConversation(conversation.id), undefined);
  const order = createOrder(db, conversation.id, false);
  assert.equal(db.saveCatalogOrderLocation(order.id, { latitude: 0, longitude: 0 }, { humanConversationId: conversation.id }).saved, false);
  assert.equal(db.markCatalogOrderPaymentProof(order.id, { humanConversationId: conversation.id }), undefined);
});

check(({ db, conversation }) => {
  const order = createOrder(db, conversation.id);
  assert.equal(db.getUnambiguousActiveCatalogOrderForConversation(conversation.id).id, order.id);
  assert.equal(db.saveCatalogOrderLocation(order.id, { latitude: 0, longitude: 0 }, { humanConversationId: conversation.id }).saved, true);
  assert.equal(db.getCatalogOrderById(order.id).location_requested, 0);
  assert.equal(db.reserveCatalogPaymentQrDelivery(order.id).reservation, "reserved");
  assert.equal(db.reserveCatalogPaymentQrDelivery(order.id).reservation, "in_progress");
  db.completeCatalogPaymentQrDelivery(order.id, "synthetic-accepted-qr");
  assert.equal(db.reserveCatalogPaymentQrDelivery(order.id).reservation, "already_sent");
  assert.equal(db.markCatalogOrderPaymentProof(order.id, { humanConversationId: conversation.id }).status, "payment_proof_received");
  assert.equal(db.markCatalogOrderPaymentProof(order.id, { humanConversationId: conversation.id }), undefined);
});

check(({ db, conversation }) => {
  const first = createOrder(db, conversation.id);
  createOrder(db, conversation.id);
  assert.equal(db.getUnambiguousActiveCatalogOrderForConversation(conversation.id), undefined);
  assert.equal(db.saveCatalogOrderLocation(first.id, { latitude: 0, longitude: 0 }, { humanConversationId: conversation.id }).saved, false);
  assert.equal(db.getCatalogOrderById(first.id).latitude, null);
});

check(({ db, conversation }) => {
  const order = createOrder(db, conversation.id);
  const other = db.getOrCreateConversation("synthetic-other-customer", null);
  db.setMode(other.id, "HUMAN");
  assert.equal(db.claimCatalogOrder(order.public_code, other.id).result, "belongs_to_other_chat");
  assert.equal(db.saveCatalogOrderLocation(order.id, { latitude: 0, longitude: 0 }, { humanConversationId: other.id }).saved, false);
  db.saveCatalogOrderLocation(order.id, { latitude: 0, longitude: 0 }, { humanConversationId: conversation.id });
  db.reserveCatalogPaymentQrDelivery(order.id);
  db.completeCatalogPaymentQrDelivery(order.id, "synthetic-accepted-qr");
  assert.equal(db.markCatalogOrderPaymentProof(order.id, { humanConversationId: other.id }), undefined);
  assert.equal(db.getCatalogOrderById(order.id).status, "awaiting_payment");
});

check(({ db, conversation }) => {
  const order = createOrder(db, conversation.id);
  assert.equal(db.getUnambiguousActiveCatalogOrderForConversation(conversation.id).id, order.id);
  db.setMode(conversation.id, "AI");
  assert.equal(db.saveCatalogOrderLocation(order.id, { latitude: 0, longitude: 0 }, { humanConversationId: conversation.id }).saved, false);
});

check(({ db, conversation }) => {
  const order = createOrder(db, conversation.id);
  assert.equal(db.saveCatalogOrderLocation(order.id, { latitude: 0, longitude: 0 }, { humanConversationId: conversation.id }).saved, true);
  assert.equal(db.saveCatalogOrderLocation(order.id, { latitude: 1, longitude: 1 }, { humanConversationId: conversation.id }).saved, false);
  assert.equal(db.getCatalogOrderById(order.id).latitude, 0);
});

check(({ db, conversation }) => {
  const order = createOrder(db, conversation.id);
  db.saveCatalogOrderLocation(order.id, { latitude: 0, longitude: 0 }, { humanConversationId: conversation.id });
  db.reserveCatalogPaymentQrDelivery(order.id);
  db.completeCatalogPaymentQrDelivery(order.id, "synthetic-accepted-qr");
  db.setMode(conversation.id, "AI");
  assert.equal(db.markCatalogOrderPaymentProof(order.id, { humanConversationId: conversation.id }), undefined);
  db.setMode(conversation.id, "HUMAN");
  createOrder(db, conversation.id);
  assert.equal(db.markCatalogOrderPaymentProof(order.id, { humanConversationId: conversation.id }), undefined);
  assert.equal(db.getCatalogOrderById(order.id).status, "awaiting_payment");
});

console.log(`PASS: ${passed} native in-memory SQL scenarios for silent HUMAN facts. No operational files or providers opened.`);
