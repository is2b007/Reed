import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRelayServer } from "./index.js";

const servers: ReturnType<typeof createRelayServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    server.close();
    await once(server, "close");
  }));
});

async function testRelay(): Promise<string> {
  const server = createRelayServer({ mcpTimeoutMs: 2_000, pollTimeoutMs: 500 });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("Reed remote MCP relay", () => {
  it("is compatible with the official stateless Streamable HTTP MCP client", async () => {
    const base = await testRelay();
    const channelId = "channel_mcpclient0123456789abcd";
    const deviceToken = "device_mcpclient0123456789abcdefghijkl";
    const connectorToken = "connector_mcpclient0123456789abcdefgh";
    await fetch(`${base}/bridge/v1/connect`, {
      method: "POST",
      headers: { authorization: `Bearer ${deviceToken}`, "content-type": "application/json" },
      body: JSON.stringify({ channelId, connectorToken, projectName: "Reed MCP", expiresAt: Date.now() + 60_000 }),
    });

    const device = (async () => {
      let toolsListed = false;
      while (!toolsListed) {
        const poll = await fetch(`${base}/bridge/v1/poll`, {
          method: "POST",
          headers: { authorization: `Bearer ${deviceToken}`, "content-type": "application/json" },
          body: JSON.stringify({ channelId }),
        });
        if (poll.status === 204) continue;
        const envelope = await poll.json() as {
          requestId: string;
          request: { id?: string | number; method: string };
        };
        const request = envelope.request;
        let response: unknown = null;
        if (request.method === "initialize") {
          response = {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              protocolVersion: "2025-06-18",
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: "reed-android-test", version: "0.1.0" },
            },
          };
        } else if (request.method === "tools/list") {
          toolsListed = true;
          response = {
            jsonrpc: "2.0",
            id: request.id,
            result: { tools: [{ name: "list_projects", description: "List projects", inputSchema: { type: "object" } }] },
          };
        }
        await fetch(`${base}/bridge/v1/respond`, {
          method: "POST",
          headers: { authorization: `Bearer ${deviceToken}`, "content-type": "application/json" },
          body: JSON.stringify({ channelId, requestId: envelope.requestId, response }),
        });
      }
    })();

    const client = new Client({ name: "reed-relay-test", version: "0.1.0" }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(
      new URL(`${base}/mcp/${channelId}?access_token=${connectorToken}`),
    );
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("list_projects");
    await client.close();
    await device;
  });

  it("moves one MCP request through an authenticated in-memory tablet channel", async () => {
    const base = await testRelay();
    const channelId = "channel_0123456789abcdefghijk";
    const deviceToken = "device_0123456789abcdefghijklmnopqrstuvwxyz";
    const connectorToken = "connector_0123456789abcdefghijklmnopqrstuv";
    const connect = await fetch(`${base}/bridge/v1/connect`, {
      method: "POST",
      headers: { authorization: `Bearer ${deviceToken}`, "content-type": "application/json" },
      body: JSON.stringify({ channelId, connectorToken, projectName: "Καλάμι / Reed", expiresAt: Date.now() + 60_000 }),
    });
    expect(connect.status).toBe(200);

    const mcpPromise = fetch(`${base}/mcp/${channelId}?access_token=${connectorToken}`, {
      method: "POST",
      headers: { "content-type": "application/json", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} }),
    });
    const poll = await fetch(`${base}/bridge/v1/poll`, {
      method: "POST",
      headers: { authorization: `Bearer ${deviceToken}`, "content-type": "application/json" },
      body: JSON.stringify({ channelId }),
    });
    const envelope = await poll.json() as { requestId: string; request: { method: string } };
    expect(envelope.request.method).toBe("tools/list");

    const response = { jsonrpc: "2.0", id: 7, result: { tools: [{ name: "list_projects" }] } };
    const acknowledged = await fetch(`${base}/bridge/v1/respond`, {
      method: "POST",
      headers: { authorization: `Bearer ${deviceToken}`, "content-type": "application/json" },
      body: JSON.stringify({ channelId, requestId: envelope.requestId, response }),
    });
    expect(acknowledged.status).toBe(200);
    const mcp = await mcpPromise;
    expect(mcp.status).toBe(200);
    expect(await mcp.json()).toEqual(response);
  });

  it("rejects invalid connector capabilities and fails closed after disconnect", async () => {
    const base = await testRelay();
    const channelId = "channel_abcdefghijklmnopqrstuvwxyz";
    const deviceToken = "device_abcdefghijklmnopqrstuvwxyz012345";
    const connectorToken = "connector_abcdefghijklmnopqrstuvwxyz0123";
    await fetch(`${base}/bridge/v1/connect`, {
      method: "POST",
      headers: { authorization: `Bearer ${deviceToken}`, "content-type": "application/json" },
      body: JSON.stringify({ channelId, connectorToken, projectName: "Reed", expiresAt: Date.now() + 60_000 }),
    });
    const invalid = await fetch(`${base}/mcp/${channelId}?access_token=wrong_abcdefghijklmnopqrstuvwxyz012345`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(invalid.status).toBe(401);
    await fetch(`${base}/bridge/v1/disconnect`, {
      method: "POST",
      headers: { authorization: `Bearer ${deviceToken}`, "content-type": "application/json" },
      body: JSON.stringify({ channelId }),
    });
    const offline = await fetch(`${base}/mcp/${channelId}?access_token=${connectorToken}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
    });
    expect(offline.status).toBe(503);
  });
});
