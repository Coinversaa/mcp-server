// Client identification headers and per-invocation context for outbound API
// calls (Coinversa analytics contract v1, §6.2).
//
// Every call this stdio server makes to the public API carries:
//   User-Agent:             coinversa-mcp/<version> (stdio)
//   X-Coinversa-Client:     mcp-stdio/<version>
//   X-Coinversa-Invocation: <uuid v4>, one per tool call, shared by every
//                           inner call and retry of that tool call
//   X-Coinversa-Attempt:    1..9, numbered per HTTP call within the invocation
//
// These are self-reported labels on requests that go to the Coinversa API
// anyway; the stdio build sends no separate telemetry anywhere. They carry no
// credential, argument, or user data. Set COINVERSAA_DISABLE_CLIENT_HEADERS=1
// (or the contract spelling COINVERSA_DISABLE_CLIENT_HEADERS=1) to omit
// X-Coinversa-Client, -Invocation and -Attempt (User-Agent stays; the runtime
// would send its own otherwise).
//
// The invocation lives in AsyncLocalStorage so concurrent tool calls (stdio
// multiplexes requests) never share or swap ids.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface InvocationContext {
  /** uuid v4; matches the API grammar ^[A-Za-z0-9_-]{16,64}$. */
  readonly id: string;
  /** HTTP calls made so far in this invocation (retries included). */
  apiCalls: number;
}

const invocationStore = new AsyncLocalStorage<InvocationContext>();

export function newInvocation(): InvocationContext {
  return { id: randomUUID(), apiCalls: 0 };
}

/** Run fn with ctx as the current invocation (for everything it awaits). */
export function runInInvocation<T>(ctx: InvocationContext, fn: () => T): T {
  return invocationStore.run(ctx, fn);
}

export function currentInvocation(): InvocationContext | undefined {
  return invocationStore.getStore();
}

// The API accepts ^[1-9]$ only; the tenth call onward reports 9 ("9 or later").
const MAX_ATTEMPT_HEADER = 9;

export function userAgent(version: string): string {
  return `coinversa-mcp/${version} (stdio)`;
}

export function clientHeadersDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // Either spelling: COINVERSAA_ (this repo's env prefix) or COINVERSA_ (the
  // spelling in the analytics contract).
  return env.COINVERSAA_DISABLE_CLIENT_HEADERS === "1" || env.COINVERSA_DISABLE_CLIENT_HEADERS === "1";
}

/**
 * Headers for one outbound API HTTP call. Counts the call against the current
 * invocation, so call it exactly once per fetch.
 */
export function apiCallHeaders(version: string, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const ctx = invocationStore.getStore();
  if (ctx) ctx.apiCalls += 1;
  const headers: Record<string, string> = { "User-Agent": userAgent(version) };
  if (clientHeadersDisabled(env)) return headers;
  headers["X-Coinversa-Client"] = `mcp-stdio/${version}`;
  if (ctx) {
    headers["X-Coinversa-Invocation"] = ctx.id;
    headers["X-Coinversa-Attempt"] = String(Math.min(Math.max(ctx.apiCalls, 1), MAX_ATTEMPT_HEADER));
  }
  return headers;
}
