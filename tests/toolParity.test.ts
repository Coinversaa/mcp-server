// Parity test: the stdio package must expose exactly the same tool surface as
// the hosted connector (https://mcp.coinversa.ai/mcp) — same 103 tool names,
// same titles, same descriptions, same input schemas, and read-only
// annotations on every tool.
//
// Run with: bun test
//
// The canonical reference lives in tests/fixtures/hosted-tools.json — a
// snapshot of the hosted server's registerTools() as seen through an MCP
// client's tools/list (name → { title, description, inputSchema }).
//
// To compare titles and descriptions against a live checkout of the hosted
// server's tools.ts instead of the snapshot, point COINVERSA_HOSTED_TOOLS_TS
// at that file (input schemas are only checked against the snapshot):
//   COINVERSA_HOSTED_TOOLS_TS=/path/to/mcp-server-remote/src/tools.ts bun test

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCoinversaServer, COINVERSA_TOTAL_TOOL_COUNT } from "../src/coinversaServer.js";
import hostedSnapshot from "./fixtures/hosted-tools.json";

const EXPECTED_TOOL_COUNT = 103;

interface HostedTool {
  title: string;
  description: string;
  /** JSON Schema as emitted by tools/list; absent when read from a live tools.ts. */
  inputSchema?: unknown;
}

/** Extract name → { title, description } from a hosted-server tools.ts source file. */
function toolsFromSource(source: string): Record<string, HostedTool> {
  const out: Record<string, HostedTool> = {};
  const re = /server\.registerTool\(\s*"([a-z0-9_]+)",\s*\{\s*title:\s*"((?:[^"\\]|\\.)*)",\s*description:\s*"((?:[^"\\]|\\.)*)"/g;
  for (const m of source.matchAll(re)) {
    out[m[1]] = { title: JSON.parse(`"${m[2]}"`), description: JSON.parse(`"${m[3]}"`) };
  }
  return out;
}

function hostedTools(): Record<string, HostedTool> {
  const live = process.env.COINVERSA_HOSTED_TOOLS_TS;
  if (live) return toolsFromSource(readFileSync(live, "utf8"));
  return hostedSnapshot as Record<string, HostedTool>;
}

async function listStdioTools() {
  const server = createCoinversaServer({ apiKey: "test" });
  const client = new Client({ name: "parity-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    return tools;
  } finally {
    await client.close();
    await server.close();
  }
}

describe("tool parity with the hosted connector", () => {
  const hosted = hostedTools();
  const hostedNames = Object.keys(hosted).sort();

  test(`hosted reference lists exactly ${EXPECTED_TOOL_COUNT} tools`, () => {
    expect(hostedNames.length).toBe(EXPECTED_TOOL_COUNT);
    expect(COINVERSA_TOTAL_TOOL_COUNT).toBe(EXPECTED_TOOL_COUNT);
  });

  test(`stdio server registers exactly ${EXPECTED_TOOL_COUNT} tools with identical names`, async () => {
    const tools = await listStdioTools();
    expect(tools.length).toBe(EXPECTED_TOOL_COUNT);
    expect(tools.map((t) => t.name).sort()).toEqual(hostedNames);
  });

  test("every tool carries the hosted title and read-only annotations", async () => {
    const tools = await listStdioTools();
    for (const tool of tools) {
      expect(typeof tool.title).toBe("string");
      expect((tool.title ?? "").length).toBeGreaterThan(0);
      expect(tool.title).toBe(hosted[tool.name].title);
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.annotations?.openWorldHint).toBe(true);
      expect(tool.annotations?.idempotentHint).toBe(true);
    }
  });

  test("every tool carries the hosted description verbatim", async () => {
    const tools = await listStdioTools();
    const mismatches: string[] = [];
    for (const tool of tools) {
      if (tool.description !== hosted[tool.name].description) mismatches.push(tool.name);
    }
    expect(mismatches).toEqual([]);
  });

  test("every tool's input schema matches the hosted snapshot", async () => {
    if (process.env.COINVERSA_HOSTED_TOOLS_TS) return; // live tools.ts has no JSON Schema to compare against
    const tools = await listStdioTools();
    const mismatches: string[] = [];
    for (const tool of tools) {
      if (JSON.stringify(tool.inputSchema) !== JSON.stringify(hosted[tool.name].inputSchema)) mismatches.push(tool.name);
    }
    expect(mismatches).toEqual([]);
  });

  test("the four 0.11.1 builder tools are present", async () => {
    const names = new Set((await listStdioTools()).map((t) => t.name));
    for (const name of ["builder_journey", "builder_lifecycle", "builder_heatmap", "builder_orders"]) {
      expect(names.has(name)).toBe(true);
    }
  });
});
