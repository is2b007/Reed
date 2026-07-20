#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const relayArgument = process.argv.slice(2).find((argument) => argument !== "--");
if (!relayArgument) {
  process.stderr.write("Usage: node scripts/verify-relay.mjs https://relay.example.com\n");
  process.exit(2);
}

const relayUrl = new URL(relayArgument);
if (relayUrl.protocol !== "https:" || relayUrl.username || relayUrl.password || relayUrl.search || relayUrl.hash) {
  throw new Error("Relay URL must be a credential-free HTTPS origin");
}
const baseUrl = relayUrl.toString().replace(/\/$/u, "");
const capability = (prefix) => `${prefix}_${randomBytes(32).toString("base64url")}`;
const channelId = capability("verify");
const deviceToken = capability("device");
const connectorToken = capability("connector");
const headers = {
  authorization: `Bearer ${deviceToken}`,
  "content-type": "application/json",
};

let stopDevice = false;
let client;
let deviceLoop;

async function post(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

try {
  const connected = await post("/bridge/v1/connect", {
    channelId,
    connectorToken,
    projectName: "Reed relay verification",
    expiresAt: Date.now() + 120_000,
  });
  if (!connected.ok) throw new Error(`Tablet connect failed with HTTP ${connected.status}`);

  deviceLoop = (async () => {
    while (!stopDevice) {
      const poll = await post("/bridge/v1/poll", { channelId });
      if (poll.status === 204) continue;
      if (!poll.ok) throw new Error(`Tablet poll failed with HTTP ${poll.status}`);
      const envelope = await poll.json();
      const request = envelope.request;
      let response = null;
      if (request.method === "initialize") {
        response = {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "reed-relay-verifier", version: "0.1.0" },
          },
        };
      } else if (request.method === "tools/list") {
        response = {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            tools: [{ name: "list_projects", description: "Verification tool", inputSchema: { type: "object" } }],
          },
        };
      }
      const responded = await post("/bridge/v1/respond", {
        channelId,
        requestId: envelope.requestId,
        response,
      });
      if (!responded.ok) throw new Error(`Tablet response failed with HTTP ${responded.status}`);
    }
  })();

  client = new Client({ name: "reed-relay-verifier", version: "0.1.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(
    new URL(`${baseUrl}/mcp/${channelId}?access_token=${connectorToken}`),
  );
  await client.connect(transport);
  const tools = await client.listTools();
  if (!tools.tools.some((tool) => tool.name === "list_projects")) {
    throw new Error("Relay did not return the expected MCP tool list");
  }
  await client.close();
  client = undefined;
  process.stdout.write("Remote Reed relay MCP verification passed.\n");
} finally {
  if (client) await client.close().catch(() => undefined);
  stopDevice = true;
  await post("/bridge/v1/disconnect", { channelId }).catch(() => undefined);
  if (deviceLoop) await deviceLoop.catch(() => undefined);
}
