// Client identification headers on the stdio build (Coinversa analytics
// contract v1, §6.2): User-Agent and X-Coinversa-Client carry the package
// version, one invocation id is shared across retries and inner calls of a
// tool call, COINVERSAA_DISABLE_CLIENT_HEADERS=1 removes the client and
// invocation headers, and the server sends nothing anywhere except the API
// requests the tools themselves make (no telemetry).
//
// Run with: bun test

import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCoinversaServer } from "../src/coinversaServer.js";

const realFetch = globalThis.fetch;
const realDisable = process.env.COINVERSAA_DISABLE_CLIENT_HEADERS;
const realDisableContract = process.env.COINVERSA_DISABLE_CLIENT_HEADERS;
const API = "https://api.test";

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realDisable === undefined) delete process.env.COINVERSAA_DISABLE_CLIENT_HEADERS;
  else process.env.COINVERSAA_DISABLE_CLIENT_HEADERS = realDisable;
  if (realDisableContract === undefined) delete process.env.COINVERSA_DISABLE_CLIENT_HEADERS;
  else process.env.COINVERSA_DISABLE_CLIENT_HEADERS = realDisableContract;
});

type Seen = { url: string; headers: Record<string, string> };

function stubFetch(respond: (url: string, i: number) => [number, unknown]): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    seen.push({ url, headers: Object.fromEntries(Object.entries(init?.headers ?? {}).map(([k, v]) => [k, String(v)])) });
    const [status, body] = respond(url, seen.length - 1);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return seen;
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<{ result: T; version: string }> {
  const server = createCoinversaServer({ apiKey: "cvsa_test", apiUrl: API });
  const client = new Client({ name: "headers-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const version = client.getServerVersion()?.version ?? "";
    return { result: await fn(client), version };
  } finally {
    await client.close();
    await server.close();
  }
}

describe("stdio client headers", () => {
  test("User-Agent and X-Coinversa-Client carry the package version", async () => {
    const seen = stubFetch(() => [200, { totalTraders: 1 }]);
    const { version } = await withClient((c) => c.callTool({ name: "pulse_global_stats", arguments: { useToonFormat: false } }));
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(seen).toHaveLength(1);
    const h = seen[0]!.headers;
    expect(h["User-Agent"]).toBe(`coinversa-mcp/${version} (stdio)`);
    expect(h["X-Coinversa-Client"]).toBe(`mcp-stdio/${version}`);
    expect(h["X-Coinversa-Client"]).toMatch(/^(mcp-hosted|mcp-stdio|portal-playground)(\/[0-9A-Za-z.+-]{1,32})?$/);
    expect(h["X-Coinversa-Invocation"]).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(h["X-Coinversa-Attempt"]).toBe("1");
    expect(h["X-API-Key"]).toBe("cvsa_test");
  });

  test("retries of one tool call share the invocation id with increasing attempts; the next call gets a new id", async () => {
    const seen = stubFetch((_u, i) => (i === 0 ? [429, { error: "slow down" }] : [200, {}]));
    await withClient(async (c) => {
      await c.callTool({ name: "pulse_global_stats", arguments: {} });
      await c.callTool({ name: "pulse_global_stats", arguments: {} });
    });
    expect(seen).toHaveLength(3);
    expect(seen[0]!.headers["X-Coinversa-Invocation"]).toBe(seen[1]!.headers["X-Coinversa-Invocation"]!);
    expect([seen[0]!.headers["X-Coinversa-Attempt"], seen[1]!.headers["X-Coinversa-Attempt"]]).toEqual(["1", "2"]);
    expect(seen[2]!.headers["X-Coinversa-Invocation"]).not.toBe(seen[0]!.headers["X-Coinversa-Invocation"]!);
    expect(seen[2]!.headers["X-Coinversa-Attempt"]).toBe("1");
  }, 10_000);

  test("concurrent tool calls keep distinct invocation ids", async () => {
    const seen = stubFetch(() => [200, {}]);
    await withClient((c) =>
      Promise.all([
        c.callTool({ name: "pulse_global_stats", arguments: {} }),
        c.callTool({ name: "pulse_cohort_summary", arguments: {} }),
      ]),
    );
    expect(seen).toHaveLength(2);
    expect(seen[0]!.headers["X-Coinversa-Invocation"]).not.toBe(seen[1]!.headers["X-Coinversa-Invocation"]!);
  });

  test("COINVERSAA_DISABLE_CLIENT_HEADERS=1 removes the client and invocation headers", async () => {
    process.env.COINVERSAA_DISABLE_CLIENT_HEADERS = "1";
    const seen = stubFetch(() => [200, {}]);
    const { version } = await withClient((c) => c.callTool({ name: "pulse_global_stats", arguments: {} }));
    const h = seen[0]!.headers;
    expect(h["X-Coinversa-Client"]).toBeUndefined();
    expect(h["X-Coinversa-Invocation"]).toBeUndefined();
    expect(h["X-Coinversa-Attempt"]).toBeUndefined();
    expect(h["User-Agent"]).toBe(`coinversa-mcp/${version} (stdio)`);
    expect(h["X-API-Key"]).toBe("cvsa_test");
  });

  test("the contract spelling COINVERSA_DISABLE_CLIENT_HEADERS=1 also opts out", async () => {
    delete process.env.COINVERSAA_DISABLE_CLIENT_HEADERS;
    process.env.COINVERSA_DISABLE_CLIENT_HEADERS = "1";
    const seen = stubFetch(() => [200, {}]);
    const { version } = await withClient((c) => c.callTool({ name: "pulse_global_stats", arguments: {} }));
    const h = seen[0]!.headers;
    expect(h["X-Coinversa-Client"]).toBeUndefined();
    expect(h["X-Coinversa-Invocation"]).toBeUndefined();
    expect(h["X-Coinversa-Attempt"]).toBeUndefined();
    expect(h["User-Agent"]).toBe(`coinversa-mcp/${version} (stdio)`);
  });

  test("no telemetry: every outbound request is a tool's own GET to the configured API", async () => {
    const seen = stubFetch(() => [500, { detail: "boom" }]);
    await withClient(async (c) => {
      await c.callTool({ name: "pulse_global_stats", arguments: {} });
      await c.callTool({ name: "pulse_cohort_summary", arguments: {} });
    });
    await new Promise((r) => setTimeout(r, 20)); // let any stray fire-and-forget land
    expect(seen.length).toBe(2);
    for (const s of seen) expect(s.url.startsWith(`${API}/api/public/v1/`)).toBe(true);
  });
});
