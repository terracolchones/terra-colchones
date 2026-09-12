import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";

// Defense against accidental provider calls, NOT an operating-system sandbox.
// Loaded before Vitest and inherited by its workers. No destination is printed.
const blocked = () => { throw new Error("TERRA_OFFLINE: real network access is disabled"); };
globalThis.fetch = async () => blocked();
http.request = blocked;
http.get = blocked;
https.request = blocked;
https.get = blocked;
net.Socket.prototype.connect = blocked;
tls.connect = blocked;
dgram.Socket.prototype.send = blocked;
syncBuiltinESMExports();
