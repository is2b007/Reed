import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const blocked = (operation) => () => { throw new Error(`OFFLINE_GUARD: blocked ${operation}`); };

for (const moduleName of ["node:http", "node:https"]) {
  const transport = require(moduleName);
  transport.request = blocked(`${moduleName}.request`);
  transport.get = blocked(`${moduleName}.get`);
}

const net = require("node:net");
net.connect = blocked("net.connect");
net.createConnection = blocked("net.createConnection");
const tls = require("node:tls");
tls.connect = blocked("tls.connect");
const dgram = require("node:dgram");
dgram.createSocket = blocked("dgram.createSocket");
const dns = require("node:dns");
for (const name of Object.keys(dns)) {
  if (name === "lookup" || name.startsWith("resolve")) dns[name] = blocked(`dns.${name}`);
}

globalThis.fetch = blocked("fetch");
if ("WebSocket" in globalThis) globalThis.WebSocket = class OfflineWebSocket { constructor() { throw new Error("OFFLINE_GUARD: blocked WebSocket"); } };
