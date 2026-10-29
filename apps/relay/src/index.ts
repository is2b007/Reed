#!/usr/bin/env node
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import process from "node:process";

const MAX_BODY_BYTES = 1_048_576;
const DEFAULT_MCP_TIMEOUT_MS = 45_000;
const DEFAULT_POLL_TIMEOUT_MS = 20_000;
const CHANNEL_PATTERN = /^[A-Za-z0-9_-]{20,96}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,192}$/u;
const DEFAULT_MAX_CHANNELS = 5_000;
const DEFAULT_CONNECTS_PER_MINUTE = 30;
const MAX_PENDING_PER_CHANNEL = 16;

interface BridgeEnvelope {
  requestId: string;
  request: unknown;
}

interface PendingRequest {
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface PollWaiter {
  response: ServerResponse;
  timer: NodeJS.Timeout;
}

interface RateWindow {
  startedAt: number;
  count: number;
}

interface Channel {
  connectorDigest: Buffer;
  deviceDigest: Buffer;
  projectName: string;
  expiresAt: number;
  lastDeviceSeenAt: number;
  queue: BridgeEnvelope[];
  pending: Map<string, PendingRequest>;
  waiter?: PollWaiter;
}

interface ConnectBody {
  channelId: string;
  connectorToken: string;
  projectName: string;
  expiresAt: number;
}

interface ChannelBody {
  channelId: string;
}

interface RespondBody extends ChannelBody {
  requestId: string;
  response: unknown;
}

export interface ReedRelayOptions {
  mcpTimeoutMs?: number;
  pollTimeoutMs?: number;
  now?: () => number;
  /** Upper bound on simultaneously claimed channels, so unauthenticated connects cannot exhaust memory. */
  maxChannels?: number;
  /** Per-client limit on /bridge/v1/connect calls in a rolling minute. */
  connectsPerMinute?: number;
  /** Read the client address from X-Forwarded-For (set only behind a trusted proxy such as Lightsail). */
  trustProxy?: boolean;
}

export function createRelayServer(options: ReedRelayOptions = {}): Server {
  const channels = new Map<string, Channel>();
  const mcpTimeoutMs = options.mcpTimeoutMs ?? DEFAULT_MCP_TIMEOUT_MS;
  const pollTimeoutMs = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const maxChannels = options.maxChannels ?? DEFAULT_MAX_CHANNELS;
  const connectsPerMinute = options.connectsPerMinute ?? DEFAULT_CONNECTS_PER_MINUTE;
  const connectWindows = new Map<string, RateWindow>();

  const cleanup = setInterval(() => {
    const timestamp = now();
    for (const [channelId, channel] of channels) {
      if (channel.expiresAt <= timestamp) removeChannel(channels, channelId, "Agent Access expired");
    }
    for (const [client, window] of connectWindows) {
      if (timestamp - window.startedAt >= 60_000) connectWindows.delete(client);
    }
  }, 30_000);
  cleanup.unref();

  const server = createServer(async (request, response) => {
    secureHeaders(response);
    try {
      const url = new URL(request.url ?? "/", "http://relay.invalid");
      if (request.method === "GET" && url.pathname === "/healthz") {
        return sendJson(response, 200, { ok: true, service: "reed-relay" });
      }
      if (url.pathname === "/bridge/v1/connect" && request.method === "POST") {
        limitConnects(connectWindows, clientAddress(request, options.trustProxy === true), connectsPerMinute, now());
        const deviceToken = bearerToken(request);
        const body = requireConnectBody(await readJson(request));
        requireToken(deviceToken, "device token");
        if (body.expiresAt <= now() || body.expiresAt > now() + 86_400_000) {
          throw new HttpError(400, "expiresAt must be within the next 24 hours");
        }
        const existing = channels.get(body.channelId);
        if (existing && !safeDigestEquals(existing.deviceDigest, digest(deviceToken))) {
          throw new HttpError(409, "Channel is already claimed");
        }
        if (existing) removeChannel(channels, body.channelId, "Tablet reconnected");
        else if (channels.size >= maxChannels) throw new HttpError(503, "The relay is at capacity. Try again shortly.");
        channels.set(body.channelId, {
          connectorDigest: digest(body.connectorToken),
          deviceDigest: digest(deviceToken),
          projectName: body.projectName.slice(0, 200),
          expiresAt: body.expiresAt,
          lastDeviceSeenAt: now(),
          queue: [],
          pending: new Map(),
        });
        return sendJson(response, 200, { ok: true, expiresAt: body.expiresAt });
      }
      if (url.pathname === "/bridge/v1/poll" && request.method === "POST") {
        const body = requireChannelBody(await readJson(request));
        const channel = requireDeviceChannel(channels, body.channelId, bearerToken(request), now());
        channel.lastDeviceSeenAt = now();
        const queued = channel.queue.shift();
        if (queued) return sendEnvelope(channel, response, queued);
        channel.waiter?.response.destroy();
        if (channel.waiter) clearTimeout(channel.waiter.timer);
        const timer = setTimeout(() => {
          if (channel.waiter?.response === response) channel.waiter = undefined;
          if (!response.writableEnded) response.writeHead(204).end();
        }, pollTimeoutMs);
        channel.waiter = { response, timer };
        // The poll body is already consumed, so "aborted" never fires; "close" is the only reliable signal
        // that the tablet dropped this long-poll.
        response.once("close", () => {
          if (channel.waiter?.response === response) {
            clearTimeout(timer);
            channel.waiter = undefined;
          }
        });
        return;
      }
      if (url.pathname === "/bridge/v1/respond" && request.method === "POST") {
        const body = requireRespondBody(await readJson(request));
        const channel = requireDeviceChannel(channels, body.channelId, bearerToken(request), now());
        channel.lastDeviceSeenAt = now();
        const pending = channel.pending.get(body.requestId);
        if (!pending) throw new HttpError(404, "Request is no longer pending");
        channel.pending.delete(body.requestId);
        clearTimeout(pending.timer);
        pending.resolve(body.response);
        return sendJson(response, 200, { ok: true });
      }
      if (url.pathname === "/bridge/v1/disconnect" && request.method === "POST") {
        const body = requireChannelBody(await readJson(request));
        requireDeviceChannel(channels, body.channelId, bearerToken(request), now());
        removeChannel(channels, body.channelId, "Tablet disconnected");
        return sendJson(response, 200, { ok: true });
      }

      const mcpMatch = /^\/mcp\/([A-Za-z0-9_-]{20,96})$/u.exec(url.pathname);
      if (mcpMatch) {
        if (request.method === "GET") {
          response.setHeader("Allow", "POST, DELETE");
          return sendJson(response, 405, { error: "This relay uses stateless Streamable HTTP POST requests" });
        }
        if (request.method === "DELETE") return response.writeHead(204).end();
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        const channelId = mcpMatch[1] ?? "";
        const channel = requireConnectorChannel(channels, channelId, connectorToken(request, url), now());
        if (now() - channel.lastDeviceSeenAt > pollTimeoutMs * 2 + 5_000) {
          throw new HttpError(503, "Reed is offline. Open Reed and enable Agent Access.");
        }
        if (channel.pending.size >= MAX_PENDING_PER_CHANNEL) throw new HttpError(429, "Too many pending Reed requests");
        const message = await readJson(request);
        const requestId = randomUUID();
        const result = new Promise<unknown>((resolve, reject) => {
          const timer = setTimeout(() => {
            channel.pending.delete(requestId);
            dropQueued(channel, requestId);
            reject(new HttpError(504, "Reed did not answer before the request expired"));
          }, mcpTimeoutMs);
          channel.pending.set(requestId, { resolve, reject, timer });
        });
        response.once("close", () => {
          if (response.writableFinished) return;
          const pending = channel.pending.get(requestId);
          if (!pending) return;
          clearTimeout(pending.timer);
          channel.pending.delete(requestId);
          dropQueued(channel, requestId);
          pending.reject(new HttpError(499, "Client closed the request"));
        });
        deliver(channel, { requestId, request: message });
        const deviceResponse = await result;
        if (deviceResponse === null || deviceResponse === undefined) return response.writeHead(202).end();
        response.setHeader("MCP-Protocol-Version", request.headers["mcp-protocol-version"] ?? "2025-06-18");
        return sendJson(response, 200, deviceResponse);
      }
      throw new HttpError(404, "Not found");
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Unexpected relay error";
      if (!response.headersSent) sendJson(response, status, { error: message });
      else response.destroy();
    }
  });
  server.once("close", () => {
    clearInterval(cleanup);
    for (const channelId of channels.keys()) removeChannel(channels, channelId, "Relay stopped");
  });
  return server;
}

function deliver(channel: Channel, envelope: BridgeEnvelope): void {
  const waiter = channel.waiter;
  if (!waiter || !responseUsable(waiter.response)) {
    if (waiter) {
      clearTimeout(waiter.timer);
      channel.waiter = undefined;
    }
    channel.queue.push(envelope);
    return;
  }
  clearTimeout(waiter.timer);
  channel.waiter = undefined;
  sendEnvelope(channel, waiter.response, envelope);
}

function responseUsable(response: ServerResponse): boolean {
  return !response.writableEnded && !response.destroyed && response.socket?.writable !== false;
}

/** Sends an envelope to a poll and puts it back at the front of the queue if the poll dies before it is flushed. */
function sendEnvelope(channel: Channel, response: ServerResponse, envelope: BridgeEnvelope): void {
  response.once("close", () => {
    if (!response.writableFinished && channel.pending.has(envelope.requestId) && !channel.queue.includes(envelope)) channel.queue.unshift(envelope);
  });
  sendJson(response, 200, envelope);
}

function dropQueued(channel: Channel, requestId: string): void {
  const index = channel.queue.findIndex((envelope) => envelope.requestId === requestId);
  if (index >= 0) channel.queue.splice(index, 1);
}

function clientAddress(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress ?? "unknown";
}

function limitConnects(windows: Map<string, RateWindow>, client: string, limit: number, now: number): void {
  const window = windows.get(client);
  if (!window || now - window.startedAt >= 60_000) {
    windows.set(client, { startedAt: now, count: 1 });
    return;
  }
  window.count += 1;
  if (window.count > limit) throw new HttpError(429, "Too many Agent Access connections from this address. Try again in a minute.");
}

function removeChannel(channels: Map<string, Channel>, channelId: string, reason: string): void {
  const channel = channels.get(channelId);
  if (!channel) return;
  channels.delete(channelId);
  if (channel.waiter) {
    clearTimeout(channel.waiter.timer);
    if (!channel.waiter.response.writableEnded) channel.waiter.response.writeHead(204).end();
  }
  for (const pending of channel.pending.values()) {
    clearTimeout(pending.timer);
    pending.reject(new HttpError(503, reason));
  }
}

function requireDeviceChannel(channels: Map<string, Channel>, channelId: string, token: string, now: number): Channel {
  requireChannelId(channelId);
  requireToken(token, "device token");
  const channel = channels.get(channelId);
  if (!channel || channel.expiresAt <= now) throw new HttpError(404, "Agent Access channel is not active");
  if (!safeDigestEquals(channel.deviceDigest, digest(token))) throw new HttpError(401, "Invalid device token");
  return channel;
}

function requireConnectorChannel(channels: Map<string, Channel>, channelId: string, token: string, now: number): Channel {
  requireChannelId(channelId);
  requireToken(token, "connector token");
  const channel = channels.get(channelId);
  if (!channel || channel.expiresAt <= now) throw new HttpError(503, "Reed Agent Access is not active");
  if (!safeDigestEquals(channel.connectorDigest, digest(token))) throw new HttpError(401, "Invalid connector token");
  return channel;
}

function connectorToken(request: IncomingMessage, url: URL): string {
  return bearerToken(request) || url.searchParams.get("access_token") || "";
}

function bearerToken(request: IncomingMessage): string {
  const value = request.headers.authorization ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function safeDigestEquals(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function requireConnectBody(value: unknown): ConnectBody {
  const body = requireObject(value);
  const channelId = requireString(body.channelId, "channelId");
  const connectorToken = requireString(body.connectorToken, "connectorToken");
  const projectName = requireString(body.projectName, "projectName");
  const expiresAt = body.expiresAt;
  requireChannelId(channelId);
  requireToken(connectorToken, "connector token");
  if (typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt)) throw new HttpError(400, "Invalid expiresAt");
  return { channelId, connectorToken, projectName, expiresAt };
}

function requireChannelBody(value: unknown): ChannelBody {
  const body = requireObject(value);
  const channelId = requireString(body.channelId, "channelId");
  requireChannelId(channelId);
  return { channelId };
}

function requireRespondBody(value: unknown): RespondBody {
  const body = requireObject(value);
  const channelId = requireString(body.channelId, "channelId");
  const requestId = requireString(body.requestId, "requestId");
  requireChannelId(channelId);
  if (requestId.length > 100) throw new HttpError(400, "Invalid requestId");
  return { channelId, requestId, response: body.response };
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Expected a JSON object");
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new HttpError(400, `Invalid ${name}`);
  return value;
}

function requireChannelId(value: string): void {
  if (!CHANNEL_PATTERN.test(value)) throw new HttpError(400, "Invalid channelId");
}

function requireToken(value: string, name: string): void {
  if (!TOKEN_PATTERN.test(value)) throw new HttpError(400, `Invalid ${name}`);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_BODY_BYTES) throw new HttpError(413, "Request body is too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

function secureHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const serialized = JSON.stringify(body);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(serialized) });
  response.end(serialized);
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? "8787");
  const relay = createRelayServer({
    trustProxy: process.env.RELAY_TRUST_PROXY === "1",
    maxChannels: process.env.RELAY_MAX_CHANNELS ? Number(process.env.RELAY_MAX_CHANNELS) : undefined,
  });
  relay.listen(port, host, () => process.stdout.write(`Reed relay listening on ${host}:${port}\n`));
}
