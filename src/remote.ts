#!/usr/bin/env node

// Coinversa Pulse MCP Server (remote HTTP)
// Intended for remote MCP clients such as Perplexity custom connectors.
// Existing stdio/npx users should continue to use src/index.ts.

import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createCoinversaServer, COINVERSA_TOTAL_TOOL_COUNT, DEFAULT_COINVERSA_API_URL } from "./coinversaServer.js";

type RemoteSession = {
  transport: StreamableHTTPServerTransport | SSEServerTransport;
  close?: () => Promise<void>;
};

const PORT = Number(process.env.PORT || "3000");
const HOST = process.env.HOST || "0.0.0.0";
const API_URL = process.env.COINVERSAA_API_URL || DEFAULT_COINVERSA_API_URL;
const sessions: Record<string, RemoteSession> = {};

function splitCsv(value?: string): string[] | undefined {
  if (!value) return undefined;
  const values = value.split(",").map((part) => part.trim()).filter(Boolean);
  return values.length ? values : undefined;
}

function firstHeader(req: any, names: string[]): string | undefined {
  for (const name of names) {
    const value = req.headers?.[name.toLowerCase()];
    if (Array.isArray(value)) return value[0];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function extractApiKey(req: any): string | undefined {
  const explicit = firstHeader(req, [
    "x-api-key",
    "api-key",
    "coinversaa-api-key",
    "coinversa-api-key",
  ]);
  if (explicit) return explicit.trim();

  const authorization = firstHeader(req, ["authorization"]);
  if (authorization) {
    const bearer = authorization.match(/^Bearer\s+(.+)$/i);
    return (bearer?.[1] || authorization).trim();
  }

  const queryKey = req.query?.apiKey || req.query?.api_key;
  if (typeof queryKey === "string") return queryKey.trim();

  if (process.env.COINVERSAA_REMOTE_ALLOW_ENV_API_KEY === "true") {
    return process.env.COINVERSAA_API_KEY;
  }

  return undefined;
}

function requireApiKey(req: any, res: any): string | undefined {
  const apiKey = extractApiKey(req);
  if (apiKey) return apiKey;

  jsonRpcError(
    res,
    401,
    -32001,
    "Coinversa API key required. Send Authorization: Bearer <key> or X-API-Key."
  );
  return undefined;
}

function createServerForRequest(req: any) {
  return createCoinversaServer({
    apiKey: extractApiKey(req),
    apiUrl: API_URL,
  });
}

function jsonRpcError(res: any, status: number, code: number, message: string) {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

const app = createMcpExpressApp({
  host: HOST,
  allowedHosts: splitCsv(process.env.COINVERSAA_REMOTE_ALLOWED_HOSTS),
});

app.get("/", (_req: any, res: any) => {
  res.json({
    name: "coinversaa-pulse",
    transport: ["streamable-http", "sse"],
    endpoints: {
      streamableHttp: "/mcp",
      sse: "/sse",
      health: "/health",
    },
    apiUrl: API_URL,
    tools: COINVERSA_TOTAL_TOOL_COUNT,
    auth: "Required API key via Authorization: Bearer <key> or X-API-Key",
  });
});

app.get("/health", (_req: any, res: any) => {
  res.json({ ok: true, name: "coinversaa-pulse", apiUrl: API_URL });
});

app.options(["/mcp", "/sse", "/messages"], (_req: any, res: any) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, Mcp-Session-Id, Last-Event-ID");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.status(204).end();
});

app.all("/mcp", async (req: any, res: any) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    let transport: StreamableHTTPServerTransport;

    if (typeof sessionId === "string" && sessions[sessionId]?.transport instanceof StreamableHTTPServerTransport) {
      transport = sessions[sessionId].transport as StreamableHTTPServerTransport;
    } else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
      const apiKey = requireApiKey(req, res);
      if (!apiKey) return;

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          sessions[newSessionId] = { transport };
        },
      });

      const server = createServerForRequest(req);
      let closed = false;
      transport.onclose = async () => {
        if (closed) return;
        closed = true;
        const sid = transport.sessionId;
        if (sid) delete sessions[sid];
        await server.close().catch(() => undefined);
      };
      await server.connect(transport);
    } else if (!sessionId) {
      const apiKey = requireApiKey(req, res);
      if (!apiKey) return;

      // Stateless fallback for clients that do not use Mcp-Session-Id.
      const server = createServerForRequest(req);
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      res.on("close", async () => {
        await transport.close();
        await server.close();
      });
    } else {
      jsonRpcError(res, 400, -32000, "Bad Request: invalid or expired MCP session.");
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling /mcp request:", error);
    if (!res.headersSent) {
      jsonRpcError(res, 500, -32603, "Internal server error");
    }
  }
});

app.get("/sse", async (req: any, res: any) => {
  try {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      res.status(401).send("Coinversa API key required. Send Authorization: Bearer <key> or X-API-Key.");
      return;
    }

    const transport = new SSEServerTransport("/messages", res);
    const server = createServerForRequest(req);
    sessions[transport.sessionId] = {
      transport,
      close: async () => server.close(),
    };

    res.on("close", async () => {
      const session = sessions[transport.sessionId];
      delete sessions[transport.sessionId];
      await session?.close?.();
    });

    await server.connect(transport);
  } catch (error) {
    console.error("Error handling /sse request:", error);
    if (!res.headersSent) res.status(500).send("Internal server error");
  }
});

app.post("/messages", async (req: any, res: any) => {
  const sessionId = req.query?.sessionId;
  if (typeof sessionId !== "string") {
    res.status(400).send("Missing sessionId");
    return;
  }

  const session = sessions[sessionId];
  if (!(session?.transport instanceof SSEServerTransport)) {
    res.status(400).send("No SSE transport found for sessionId");
    return;
  }

  await session.transport.handlePostMessage(req, res, req.body);
});

app.listen(PORT, HOST, (error?: Error) => {
  if (error) {
    console.error("Failed to start Coinversa remote MCP server:", error);
    process.exit(1);
  }

  console.log(`Coinversa remote MCP server listening on http://${HOST}:${PORT}`);
  console.log(`Streamable HTTP endpoint: /mcp`);
  console.log(`SSE endpoint: /sse`);
});

async function shutdown() {
  for (const [sessionId, session] of Object.entries(sessions)) {
    delete sessions[sessionId];
    await session.transport.close().catch(() => undefined);
    await session.close?.().catch(() => undefined);
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
