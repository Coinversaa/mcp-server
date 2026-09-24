#!/usr/bin/env node

// Coinversa Pulse MCP Server
// Exposes crypto intelligence tools to AI agents via Model Context Protocol
//
// Usage with Claude Desktop / Cursor / Claude Code:
//   Set COINVERSAA_API_KEY and COINVERSAA_API_URL in your MCP config

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { encode as toonEncode } from '@toon-format/toon'

import { z } from "zod";
import { apiCallHeaders, newInvocation, runInInvocation } from "./clientContext.js";

// ─── Configuration ───────────────────────────────────────
export interface CoinversaServerOptions {
  apiKey?: string;
  apiUrl?: string;
}

// Tools whose upstream endpoint cannot currently answer inside the client
// timeout are withheld from the tool list, matching the hosted connector
// (2026-09: builder_heatmap, pending its rollup). The hosted server gates
// these so a config change on the box, not a release, restores them; here
// the same override is COINVERSAA_HIDDEN_TOOLS in the MCP client's env
// block. Hidden by default when the variable is ABSENT entirely, so losing
// the env does not silently re-advertise a tool that times out. Setting it
// wins in both directions, COINVERSAA_HIDDEN_TOOLS= (explicitly empty)
// included, which advertises everything.
//
// Remove builder_heatmap here when its hourly rollup is backfilled past the
// 84-day window and the API is repointed at it. That deletion is the
// deliberate act of shipping the tool.
const DEFAULT_HIDDEN_TOOLS = "builder_heatmap";

export function hiddenToolsFromEnv(raw: string | undefined = process.env.COINVERSAA_HIDDEN_TOOLS): Set<string> {
  return new Set((raw ?? DEFAULT_HIDDEN_TOOLS).split(",").map((t) => t.trim()).filter(Boolean));
}

// Every tool the package knows how to register. The advertised surface is
// this minus hiddenTools, which is what a client's tools/list returns.
export const COINVERSA_TOTAL_TOOL_COUNT = 107;
const COINVERSA_VERSION = "0.12.0";
export const DEFAULT_COINVERSA_API_URL = "https://api.coinversa.ai";

// ─── Cohort Tier Vocabulary ──────────────────────────────
// New tier slugs are the primary vocabulary; legacy slugs remain accepted.
// The upstream API still speaks legacy slugs, so new slugs are normalized
// to their legacy equivalent before being placed into any API request.
// API responses continue to emit legacy slugs (e.g. pnlTier: "money_printer").
export const NEW_TO_LEGACY_TIER: Record<string, string> = {
  // PnL tiers (new → legacy)
  apex: "money_printer",
  sharps: "smart_money",
  grinders: "grinder",
  scrapers: "humble_earner",
  crowd: "exit_liquidity",
  bleeders: "semi_rekt",
  trapped: "full_rekt",
  blown_out: "giga_rekt",
  // Size tiers (new → legacy)
  heavyweights: "leviathan",
  cruiserweights: "tidal_whale",
  middleweights: "whale",
  welterweights: "small_whale",
  lightweights: "apex_predator",
  featherweights: "dolphin",
  flyweights: "fish",
  strawweights: "shrimp",
};

/**
 * Normalize a tier slug for use in an API request: new-vocabulary slugs map
 * to their legacy equivalent; legacy slugs pass through unchanged. This keeps
 * the MCP working whether or not the upstream API understands new slugs yet.
 */
export function normalizeTier(tier: string): string {
  return NEW_TO_LEGACY_TIER[tier] ?? tier;
}

/** All accepted tier slugs: 16 new (primary) + 16 legacy (still accepted). */
export const TIER_SLUGS = [
  // New PnL tier slugs (primary)
  "apex", "sharps", "grinders", "scrapers",
  "crowd", "bleeders", "trapped", "blown_out",
  // New size tier slugs (primary)
  "heavyweights", "cruiserweights", "middleweights", "welterweights",
  "lightweights", "featherweights", "flyweights", "strawweights",
  // Legacy PnL tier slugs (still accepted)
  "money_printer", "smart_money", "grinder", "humble_earner",
  "exit_liquidity", "semi_rekt", "full_rekt", "giga_rekt",
  // Legacy size tier slugs (still accepted)
  "leviathan", "tidal_whale", "whale", "small_whale",
  "apex_predator", "dolphin", "fish", "shrimp",
] as const;

/** Zod enum accepting both tier vocabularies — exported for tests. */
export const tierEnum = z.enum(TIER_SLUGS);

// ─── Response caps (connector layer) ─────────────────────
// Several upstream routes return unbounded arrays (no limit/offset params) and
// overflow the client's tool-result cap at their own documented defaults. The
// helpers below cap uniformly, always BEFORE toon encoding, and stamp the
// result with truncated/totalCount/note so the model knows how to page or
// narrow instead of silently seeing a partial list.

export type CapNote = string | ((shown: number, total: number) => string);
export type CapOptions = {
  /** Skip this many rows before slicing (0-based). */
  offset?: number;
  /** Keep the LAST `limit` rows instead of the first (time series: newest). */
  keepEnd?: boolean;
  /** One-line hint on how to page or narrow; only emitted when truncated. */
  note?: CapNote;
};

/**
 * Cap `obj[key]` (an array) to `limit` rows. Returns a copy of `obj` with the
 * sliced array plus `totalCount` (original length) and `truncated` (true when
 * any row was dropped), and `note` when truncated. Non-array values pass
 * through untouched.
 */
export function capArray<T extends Record<string, any>>(obj: T, key: string, limit: number, opts: CapOptions = {}): T & { totalCount: number; truncated: boolean; note?: string } {
  const arr = obj?.[key];
  if (!Array.isArray(arr)) return { ...obj, totalCount: 0, truncated: false };
  const total = arr.length;
  const offset = Math.max(0, opts.offset ?? 0);
  const sliced = opts.keepEnd
    ? arr.slice(Math.max(0, total - offset - limit), Math.max(0, total - offset))
    : arr.slice(offset, offset + limit);
  const truncated = sliced.length < total;
  const out: any = { ...obj, [key]: sliced, totalCount: total, truncated };
  if (truncated && opts.note) {
    out.note = typeof opts.note === "function" ? opts.note(sliced.length, total) : opts.note;
  }
  return out;
}

/**
 * Downsample a time series to one row per `bucketMs` bucket, keeping the row
 * with the highest `score` in each bucket (e.g. max |basisPct|). Output is
 * ordered by bucket ascending. `bucketMs <= 0` returns the input unchanged.
 */
export function bucketSeries<T>(rows: T[], bucketMs: number, ts: (row: T) => number, score: (row: T) => number): T[] {
  if (!Array.isArray(rows) || bucketMs <= 0) return rows;
  const best = new Map<number, T>();
  for (const row of rows) {
    const t = Number(ts(row));
    if (!Number.isFinite(t)) continue;
    const b = Math.floor(t / bucketMs);
    const cur = best.get(b);
    if (cur === undefined || score(row) > score(cur)) best.set(b, row);
  }
  return [...best.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}

/** Bucket width in ms for the mark-dislocation resolutions (1m = raw rows). */
export const DISLOCATION_RESOLUTION_MS: Record<"1m" | "5m" | "1h", number> = { "1m": 0, "5m": 300_000, "1h": 3_600_000 };

/**
 * Client-side tier filters for the cohort history routes (the API has none).
 * `tier` matches either vocabulary: the API emits legacy slugs, so a new slug
 * is compared through normalizeTier as well as verbatim.
 */
export function filterCohortRows<T extends { tierType?: string; tier?: string }>(rows: T[], tierType?: string, tier?: string): T[] {
  if (!Array.isArray(rows)) return rows;
  const tiers = tier ? new Set([tier, normalizeTier(tier)]) : null;
  return rows.filter((r) => (!tierType || r.tierType === tierType) && (!tiers || tiers.has(String(r.tier))));
}

/** Newest first, then tierType, then tier — so a head cap keeps the latest rows. */
export function sortCohortRows<T extends Record<string, any>>(rows: T[], timeKey: "timestamp" | "date"): T[] {
  if (!Array.isArray(rows)) return rows;
  const cmp = (a: T, b: T) => {
    const ta = a[timeKey], tb = b[timeKey];
    if (ta !== tb) return ta > tb ? -1 : 1;
    const tt = String(a.tierType ?? "").localeCompare(String(b.tierType ?? ""));
    if (tt !== 0) return tt;
    return String(a.tier ?? "").localeCompare(String(b.tier ?? ""));
  };
  return [...rows].sort(cmp);
}

/** Sections of /live/risk/coins/{coin}/history a caller can select. */
export const RISK_HISTORY_SECTIONS = ["oiHistory", "longShortHistory", "cohortBiasHistory", "candleHistory", "markDislocations", "liquidations"] as const;
export const RISK_HISTORY_DEFAULT_SECTIONS = RISK_HISTORY_SECTIONS.filter((s) => s !== "markDislocations");

export function createCoinversaServer(options: CoinversaServerOptions = {}) {
const apiKey = options.apiKey;
// Defaults to production. Override apiUrl / COINVERSAA_API_URL only if you
// operate your own Coinversa backend and want the MCP to call it.
const API_URL = options.apiUrl || process.env.COINVERSAA_API_URL || DEFAULT_COINVERSA_API_URL;
const BASE = `${API_URL}/api/public/v1`;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;
// builder_journey / builder_heatmap: the API computes these per builder on
// first request (65-90s measured on production) and caches the result, so
// those calls get a longer budget and no retry (a retry would just queue
// behind the computation already in flight).
const SLOW_BUILDER_CALL = { timeoutMs: 100_000, retries: 0 } as const;

const hiddenTools = hiddenToolsFromEnv();

function shouldRegister(toolName: string): boolean {
  return !hiddenTools.has(toolName);
}

// ─── Shared Validation Schemas ───────────────────────────
const useToonFormatSchema = z
  .boolean()
  .default(true)
  .describe("Return data in compact toon format (default: true). Set to false for standard JSON.");

const ethAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address (0x followed by 40 hex characters)")
  .describe("Ethereum wallet address (0x...)");

const tierSchema = tierEnum
  .describe(
    "Tier slug. PnL tiers (by profitability): apex (Apex), sharps (Sharps), grinders (Grinders), scrapers (Scrapers), crowd (The Crowd), bleeders (Bleeders), trapped (Trapped), blown_out (Blown Out). Size tiers (by volume): heavyweights (Heavyweights), cruiserweights (Cruiserweights), middleweights (Middleweights), welterweights (Welterweights), lightweights (Lightweights), featherweights (Featherweights), flyweights (Flyweights), strawweights (Strawweights). Legacy slugs (money_printer, smart_money, grinder, humble_earner, exit_liquidity, semi_rekt, full_rekt, giga_rekt, leviathan, tidal_whale, whale, small_whale, apex_predator, dolphin, fish, shrimp) remain accepted; API responses still emit legacy slugs."
  );

const sinceSchema = z
  .string()
  .regex(/^\d+[mhd]$/, "Must be a number followed by m (minutes), h (hours), or d (days). e.g. '10m', '1h', '7d'")
  .describe("Time window: e.g. '10m' (minutes), '1h' (hours), '1d' (days)");

const builderPeriodSchema = z.enum(["day", "week", "month"]);

const builderAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address (0x followed by 40 hex characters)")
  .describe("Builder address (0x...)");

/**
 * Normalize a coin/symbol string: uppercase the coin name while preserving
 * lowercase builder dex prefix (e.g. "xyz:silver" → "xyz:SILVER", "btc" → "BTC").
 */
function normalizeCoin(raw: string): string {
  const idx = raw.indexOf(':');
  if (idx !== -1) {
    // Builder dex format — keep prefix lowercase, uppercase the coin
    return raw.slice(0, idx).toLowerCase() + ':' + raw.slice(idx + 1).toUpperCase();
  }
  return raw.toUpperCase();
}

// ─── API Helper (with timeout + retries + friendly errors) ─
type CallOptions = { timeoutMs?: number; retries?: number };

async function callAPI(useToon: boolean, path: string, params?: Record<string, string>, callOpts: CallOptions = {}): Promise<any> {
  const timeoutMs = callOpts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxRetries = callOpts.retries ?? MAX_RETRIES;
  if (!apiKey) {
    throw new Error("Coinversa API key required. Set COINVERSAA_API_KEY (get a key at https://developers.coinversa.ai/keys), or use the hosted connector at https://mcp.coinversa.ai/mcp.");
  }

  const url = new URL(`${BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    });
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      // User-Agent + X-Coinversa-Client/-Invocation/-Attempt (see
      // clientContext.ts; COINVERSAA_DISABLE_CLIENT_HEADERS=1 opts out).
      const headers: Record<string, string> = apiCallHeaders(COINVERSA_VERSION);
      if (apiKey) headers["X-API-Key"] = apiKey;

      const response = await fetch(url.toString(), {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        // Rate limited — retry after delay
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        // The backend's 429 payload carries the exact cap hit, retry timing,
        // and an on-demand upgrade link — relay it so the agent can explain
        // the situation (and the fix) instead of a bare "rate limited".
        const body429 = await response.json().catch(() => null);
        const parts = [body429?.error || "Rate limit exceeded. Please wait a moment and try again."];
        if (body429?.retryAfterSeconds) parts.push(`Retry in ~${body429.retryAfterSeconds}s.`);
        if (body429?.upgrade_url) parts.push(`Higher limits are available on a paid plan — upgrade at ${body429.upgrade_url} (or call pulse_my_plan to see your current tier and every plan's limits).`);
        throw new Error(parts.join(" "));
      }

      if (response.status === 404) {
        throw new Error("Not found. The requested resource does not exist — check the address or symbol.");
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const msg = body?.detail || body?.error || body?.title || response.statusText;
        // Tier gate ≠ invalid key: a valid free-tier key hitting a Pro
        // endpoint gets current_tier/required_tier and a pre-built
        // upgrade_url from the backend — surface all of it so the agent can
        // tell the user what their plan is and where to upgrade.
        if (response.status === 403 && body?.required_tier) {
          const cur = body.current_tier ?? "free";
          const tool = body.tool && body.tool !== "unknown" ? ` (${body.tool})` : "";
          const upgrade = body.upgrade_url ? ` Upgrade here: ${body.upgrade_url}` : "";
          throw new Error(
            `This feature${tool} requires the ${body.required_tier} tier — the API key in use is on the ${cur} tier.${upgrade} ` +
            `Call pulse_my_plan for the full comparison of what each tier unlocks.`
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Coinversa API key rejected (${response.status}): ${msg}`);
        }
        if (response.status === 503 && body?.error) {
          throw new Error(`Temporarily unavailable: ${body.error}`);
        }
        throw new Error(`Request failed (${response.status}): ${msg}`);
      }

      const data = await response.json();
      return useToon ? toonEncode(data) : data;
    } catch (err: any) {
      if (err.name === "AbortError") {
        lastError = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds. The server may still be computing this answer — try again in a minute; results are cached once ready.`);
      } else if (err.cause?.code === "ECONNREFUSED" || err.cause?.code === "ENOTFOUND") {
        lastError = new Error("Cannot connect to the Coinversa API. Check your COINVERSAA_API_URL setting and network connection.");
      } else {
        lastError = err;
      }

      // Retry on transient network errors
      if (attempt < maxRetries && (err.name === "AbortError" || err.cause?.code === "ECONNRESET")) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("Request failed after retries");
}

function formatJSON(data: any): string {
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}

function toolResult(data: any) {
  return { content: [{ type: "text" as const, text: formatJSON(data) }] };
}

// Shared annotations for every tool: all 103 are read-only, non-destructive,
// safely repeatable GETs against the public Coinversa API (open world).
const annotations = {
  readOnlyHint: true, destructiveHint: false, openWorldHint: true, idempotentHint: true,
} as const;

// ─── Data coverage machinery (ported from the hosted connector) ───
/** Datasets data_coverage knows how to report. */
const COVERAGE_DATASETS = ["trades", "builder_ledger", "census", "hip4", "liquidations", "lifecycles", "cohort_history", "book"] as const;
type CoverageDataset = (typeof COVERAGE_DATASETS)[number];

/** Extract the first YYYY-MM-DD date following "history begins" in a builder dataNotes string. */
function ledgerStartFromDataNotes(notes: unknown): string | null {
if (typeof notes !== "string") return null;
const m = notes.match(/history begins (\d{4}-\d{2}-\d{2})/);
return m ? m[1] : null;
}

// ══════════════════════════════════════════════════════════
// TOOL 2: Data Coverage
// ══════════════════════════════════════════════════════════
// Composed only from routes that already exist. One failing source must
// not fail the tool: sources run one after another (see the burst note at
// the call site) and a rejection becomes a per-dataset note. Where no route exposes a window
// start the dataset is still listed, with windowStart null and a note —
// never a guessed date.
// retries: 2 keeps callAPI's 429 backoff (1 s, 2 s) — with retries: 0 a
// burst-limited source failed outright. COVERAGE_PACE_MS spaces the calls
// so a fresh key (burst 5 Pro / 2 Free, refill 600/min) does not trip the
// bucket in the first place; 8 sources ≈ 2 s total.
const COVERAGE_CALL = { timeoutMs: 15_000, retries: 2 } as const;
const COVERAGE_PACE_MS = 250;

type CoverageRow = {
  dataset: CoverageDataset;
  description: string;
  windowStart: string | null;
  windowEnd: string | null;
  latest: string | null;
  freshness: Record<string, unknown> | null;
  source: string;
  notes: string[];
  [extra: string]: unknown;
};
const NO_WINDOW_NOTE = "window not exposed by the API yet";
const coverageSources: Record<CoverageDataset, () => Promise<CoverageRow>> = {
  trades: async () => {
    const stats = await callAPI(false, "/pulse/stats", undefined, COVERAGE_CALL);
    return {
      dataset: "trades",
      description: "Indexed Hyperliquid trades with PnL attribution (pulse_* trade, leaderboard, cohort and trader tools).",
      windowStart: stats?.dataStartDate ?? null,
      windowEnd: stats?.dataEndDate ?? null,
      latest: stats?.dataEndDate ?? null,
      freshness: null,
      source: "/pulse/stats",
      totals: { totalTraders: stats?.totalTraders ?? null, totalTrades: stats?.totalTrades ?? null, totalVolume: stats?.totalVolume ?? null },
      notes: ["windowStart/windowEnd are the first and last UTC day present in the daily trader stats; the route is cached for ~2 minutes."],
    };
  },
  builder_ledger: async () => {
    const lb = await callAPI(false, "/builders/leaderboard", { period: "month", limit: "1" }, COVERAGE_CALL);
    const verified = lb?.verified ?? null;
    const coverage = verified?.coverage ?? null;
    const notedStart = ledgerStartFromDataNotes(lb?.dataNotes);
    const notes: string[] = [];
    let windowStart: string | null = null;
    if (notedStart) {
      windowStart = notedStart;
      notes.push("windowStart is the fee ledger's first on-chain entry, as disclosed in the route's dataNotes.");
    } else if (coverage?.window_start) {
      windowStart = coverage.window_start;
      notes.push("windowStart is the attribution-coverage rollup's window start; the ledger itself may begin earlier.");
    } else {
      notes.push(`${NO_WINDOW_NOTE}: the ledger start is only disclosed in dataNotes when a requested window predates it.`);
    }
    if (!verified) notes.push("No 'verified' ledger stamp in the response (ledger table absent or empty).");
    if (!coverage) notes.push("Attribution coverage rollup not provisioned yet (verified.coverage is null).");
    return {
      dataset: "builder_ledger",
      description: "Builder-fee ledger (exact revenue) and order-fill attribution behind the builder_* tools.",
      windowStart,
      windowEnd: coverage?.window_end ?? null,
      latest: verified?.ledger_chain_time ?? null,
      freshness: verified ? { ledgerBlock: verified.ledger_block ?? null, ledgerChainTime: verified.ledger_chain_time ?? null, coverageComputedAt: coverage?.computed_at ?? null, ecosystemComputedAt: lb?.ecosystem?.computedAt ?? null } : null,
      source: "/builders/leaderboard?period=month&limit=1 (verified stamp + dataNotes)",
      notes,
    };
  },
  census: async () => {
    const res = await callAPI(false, "/census/stamp", undefined, COVERAGE_CALL);
    const v = res?.verified ?? null;
    return {
      dataset: "census",
      description: "Chain-state census of the open book behind entity and live-position tools (the 'verified' badge).",
      windowStart: null,
      windowEnd: null,
      latest: v?.chain_time ?? null,
      freshness: v ? { verifiedAtBlock: v.verified_at_block ?? null, chainTime: v.chain_time ?? null, openPositions: v.positions ?? null } : null,
      source: "/census/stamp",
      notes: v ? ["Point-in-time snapshot; no history window."] : ["No census stamp yet (pipeline has not run on this database)."],
    };
  },
  hip4: async () => {
    const res = await callAPI(false, "/hip4/outcomes", { hours: "24" }, COVERAGE_CALL);
    const outcomes: any[] = Array.isArray(res?.outcomes) ? res.outcomes : [];
    const latest = outcomes.map((o) => o?.lastTraded).filter((t): t is string => typeof t === "string").sort().pop() ?? null;
    return {
      dataset: "hip4",
      description: "HIP-4 outcome-contract fills, settlements and trader analytics (hip4_* tools).",
      windowStart: null,
      windowEnd: null,
      latest,
      freshness: latest ? { lastTradedFill: latest } : null,
      source: "/hip4/outcomes?hours=24 (max lastTraded)",
      notes: [
        `${NO_WINDOW_NOTE}: no route reports the first indexed HIP-4 fill.`,
        "The API clamps every HIP-4 look-back to mainnet launch, 2026-05-02 (hip4MainnetLaunch in the API source).",
        ...(latest ? [] : ["No outcome traded in the last 24h, so no latest fill timestamp is available."]),
      ],
    };
  },
  liquidations: async () => {
    const res = await callAPI(false, "/live/risk/liquidations/summary", { since: "24h" }, COVERAGE_CALL);
    return {
      dataset: "liquidations",
      description: "Syncer-backed liquidation events and risk history (live_recent_liquidations, live_liquidation_summary, live_coin_risk_*).",
      windowStart: null,
      windowEnd: null,
      latest: res?.freshness?.liquidations ?? null,
      freshness: { availability: res?.availability ?? null, freshness: res?.freshness ?? null, generatedAt: res?.generatedAt ?? null },
      source: "/live/risk/liquidations/summary?since=24h (availability/freshness stamp)",
      notes: [`${NO_WINDOW_NOTE}: the risk routes accept a since/hours look-back but do not report their earliest row.`],
    };
  },
  lifecycles: async () => {
    const rows = await callAPI(false, "/pulse/lifecycles/recent", { since: "24h", limit: "1" }, COVERAGE_CALL);
    const latest = Array.isArray(rows) && rows[0]?.closedAt ? String(rows[0].closedAt) : null;
    return {
      dataset: "lifecycles",
      description: "Reconstructed position lifecycles with MAE/MFE (pulse_lifecycle*, archetype, execution-quality and market-structure tools).",
      windowStart: null,
      windowEnd: null,
      latest,
      freshness: latest ? { lastClosedAt: latest } : null,
      source: "/pulse/lifecycles/recent?since=24h&limit=1 (latest close)",
      notes: [
        "Rolling window: lifecycle routes return positions closed within the last 90 days plus still-open ones.",
        `${NO_WINDOW_NOTE}: the table's first day is not reported by any route.`,
      ],
    };
  },
  book: async () => {
    const res = await callAPI(false, "/market/book/coverage", undefined, COVERAGE_CALL);
    const coins = Number(res?.coins ?? 0);
    const notes: string[] = Array.isArray(res?.notes) ? res.notes.map(String) : [];
    return {
      dataset: "book",
      description: "L4 order-book rollups behind book_summary, book_stop_map, book_whales and book_levels (snapshot-derived, refreshed every 60 s, no history).",
      // Latest-only by design: there is no window to report, and guessing one
      // would invite an agent to ask for a range that cannot exist.
      windowStart: null,
      windowEnd: null,
      latest: res?.latest_block_time ?? null,
      freshness: {
        coinsCovered: coins,
        latestHeight: res?.latest_height ?? null,
        latestBlockTime: res?.latest_block_time ?? null,
        // The spread between oldest and latest is how far behind the
        // slowest coin is — a lagging sweep shows up here before it shows
        // up as staleness on any single coin.
        oldestBlockTime: res?.oldest_block_time ?? null,
        ageS: res?.age_s ?? null,
        stale: res?.stale ?? null,
      },
      source: "/market/book/coverage",
      notes: [
        `${NO_WINDOW_NOTE}: the book rollups are latest-only — one row per coin, replaced on each re-export.`,
        ...notes,
        ...(coins ? [] : ["No coin is covered yet; the four book_* tools will answer 404 for every coin."]),
        ...(res?.stale ? ["The source is stale: the book_* tools answer 503 until it refreshes."] : []),
      ],
    };
  },
  cohort_history: async () => ({
    dataset: "cohort_history",
    description: "Hourly cohort bias snapshots and daily cohort performance (pulse_cohort_bias_history, pulse_cohort_performance_daily, live_cohort_bias_history).",
    windowStart: null,
    windowEnd: null,
    latest: null,
    freshness: null,
    source: "/pulse/cohort-bias/history, /pulse/cohorts/daily-stats (not queried; both accept since up to 30d)",
    notes: [`${NO_WINDOW_NOTE}: the routes accept since <= 30d but do not report the earliest snapshot.`],
  }),
};

// ─── Create Server ───────────────────────────────────────
const SERVER_INSTRUCTIONS = `Coinversa Pulse — Crypto intelligence for AI agents.

DATA COVERAGE:
- Every tracked Hyperliquid wallet classified into behavioral cohorts (size + PnL tiers)
- All indexed trades with full PnL attribution (for current totals call pulse_global_stats)
- data_coverage reports, per dataset, the window start/end (or latest row), the
  freshness stamp, and the API route it was read from. Call it before relying
  on a historical range. Windows as the API reports them today: trades/pulse
  from 2025-03-22 (pulse_global_stats.dataStartDate); position lifecycles are
  a rolling 90-day window; builder ledger from the fee ledger's first on-chain
  entry; HIP-4 from mainnet launch (2026-05-02). Several tools cap large
  arrays and return truncated:true + totalCount + a note on how to page or narrow.
- Real-time positions, liquidation heatmaps, and market data
- Syncer-backed risk routes for crowding, real liquidation events, and weekly market stress
- Cross-market asset taxonomy resolving venue symbols (xyz:GOLD, hyna:PAXG) to canonical assets
- HIP-4 outcome contract discovery, settlements, volume, recent trades, trader analytics, and perp-position context
- L4 order book (book_summary, book_stop_map, book_whales, book_levels): snapshot-derived,
  refreshed every 60 s, latest-only — there is NO book history, so "how did the book change"
  cannot be answered from these tools. Every response carries as_of_height (the L1 block) and
  age_s. market_orderbook remains the free aggregated L2 view. Coin is case-sensitive in the
  node's own spelling (BTC, xyz:GOLD, #28200) and is NOT normalized for these four tools.

MARKETS:
Hyperliquid has native perpetuals (BTC, ETH, SOL, etc.) plus 7 builder dexes — independent perp exchanges built on top of Hyperliquid, each with their own collateral token and market listings.

| Dex    | What it trades             | Collateral | Example symbols                    |
|--------|----------------------------|------------|------------------------------------|
| (none) | Native HL perps            | USDC       | BTC, ETH, SOL, HYPE               |
| xyz    | Commodities, stocks, indices | USDC     | xyz:GOLD, xyz:SILVER, xyz:TSLA    |
| flx    | Perps                      | USDH       | flx:BTC, flx:ETH                  |
| vntl   | Perps                      | USDH       | vntl:ANTHROPIC, vntl:BTC          |
| hyna   | Perps                      | USDE       | hyna:SOL, hyna:BTC                |
| km     | Energy & commodities       | USDH       | km:OIL, km:NATGAS, km:WHEAT       |
| abcd   | Misc                       | USDC       | abcd:BITCOIN                      |
| cash   | Stocks & equities          | USDT0      | cash:TSLA, cash:AAPL, cash:GOOGL  |

SYMBOL FORMAT:
- Native symbols: just the ticker (BTC, ETH, SOL)
- Builder dex symbols: prefix:TICKER (xyz:SILVER, cash:TSLA, km:OIL)
- Use the list_markets tool to discover all available symbols and which dex they belong to

FUNDING RATES:
- fundingRate fields are raw hourly decimal rates from Hyperliquid, not already annualized percentages
- Hourly funding percent = fundingRate * 100
- Annualized APR percent = fundingRate * 24 * 365 * 100
- Example: fundingRate 0.00000625 = 0.000625% hourly = 5.475% APR

CROSS-MARKET ASSETS (canonical vs. venue symbol):
The same underlying exposure can appear under different tickers on different
venues. For cross-market questions ("what venues trade gold?", "total OI on
BTC across all dexes?"), use the canonical asset — not the venue symbol:
- Canonical GOLD = { GOLD (native), xyz:GOLD, hyna:PAXG, ... } — PAXG is a synonym for GOLD
- Canonical BTC  = { BTC (native), flx:BTC, hyna:BTC, ... }

Tools:
- list_assets               → directory of canonical assets and their venues
- list_asset                → one asset's venue breakdown (accepts synonyms)
- pulse_cross_market_asset  → aggregated OI / positions / bias across venues
Known synonyms: PAXG → GOLD, XAUT → GOLD, XAGT → SILVER.

HIP-4 OUTCOME CONTRACTS:
Outcome contracts are prediction-market style side tokens indexed from Hyperliquid.
Use HIP-4 tools when users ask about outcomes, questions, settlements,
prediction markets, side-token fills, or overlap between outcome traders and
perp traders.
- Outcome side coin format: #<encoding>, where encoding = 10 * outcomeId + side
- Side token format: +<encoding>
- Public discovery tools require an API key; deeper analytics require the key's backend tier
- Use hip4_perp_position_context when the user asks whether outcome holders
  already have open positions in the same underlying asset/perp, or whether
  a side looks directional, hedged, or prediction-native

POSITION LIFECYCLES (open->close cycles with MAE/MFE):
A "lifecycle" is one full position reconstructed from on-chain fills: open -> scale
-> close, with entry/exit VWAP, hold duration, realized PnL, fees, liquidation
status, and (for perps) MAE/MFE — the worst adverse and best favorable price the
position ever saw while open. 90-day rolling window; spot (@-prefixed) excluded.
- pulse_trader_lifecycles        → one wallet's lifecycle history
- pulse_trader_lifecycle_summary → one wallet's aggregate lifecycle stats
- pulse_lifecycle                → one lifecycle by ID + every composing fill
- pulse_trader_demo              → quick wallet brief: summary + recent wins/losses

EXECUTION QUALITY (MAE/MFE-derived, perp-only):
Use these to judge HOW a position was traded, not just its PnL:
- pulse_wallet_drawdown_curve → per-position drawdown (MAE) and run-up (MFE) curve
- pulse_max_pain_events       → winners that survived deep drawdowns before recovering
- pulse_perfect_exits         → exits that captured most of the max favorable move
- pulse_backstop_events       → the most catastrophic individual liquidations

TRADER ARCHETYPES (90-day lifecycle discovery):
- pulse_survivors / pulse_anti_survivors → blew to a deep trough then recovered / never did
- pulse_persistent_winners   → profitable across multiple distinct months
- pulse_capital_titans       → best PnL per dollar of fees paid
- pulse_one_month_wonders    → huge in one month, gave it back
- pulse_newcomer_whales      → recent first lifecycle, already moving big notional
- pulse_coin_kings           → top earner(s) per coin
- pulse_top_liquidators      → wallets that profit by liquidating others
- pulse_lethal_coins         → coins with the highest per-lifecycle liquidation rate

MARKET STRUCTURE (aggregate lifecycle analytics, no address needed):
- pulse_coin_alpha_map       → per-coin winner/loser/net profit pools
- pulse_hour_profitability   → global PnL by UTC hour of close
- pulse_market_concentration → power-law: which percentile bands hold the profits
- pulse_style_distribution   → HFT vs swing vs holder PnL split
- pulse_compare              → side-by-side lifecycle summary of 2-5 wallets

REFRESHED COHORTS (30-day rolling tier label, not all-time):
The pulse_cohort_recent_* tools label wallets by their LAST-30-DAY tier
(pnl_tier_recent / size_tier_recent) instead of lifetime tier — catching regime
changes the all-time cohort tools miss (e.g. who is printing RIGHT NOW).

COHORT TIERS:
Wallets are classified into two tier systems:
- PnL tiers (by profitability): Apex (apex), Sharps (sharps), Grinders (grinders), Scrapers (scrapers), The Crowd (crowd), Bleeders (bleeders), Trapped (trapped), Blown Out (blown_out)
- Size tiers (by volume): Heavyweights (heavyweights), Cruiserweights (cruiserweights), Middleweights (middleweights), Welterweights (welterweights), Lightweights (lightweights), Featherweights (featherweights), Flyweights (flyweights), Strawweights (strawweights)
- Legacy slugs (money_printer, smart_money, ..., leviathan, tidal_whale, ...) still work as inputs, and API responses still emit them

ENTITY RESOLUTION (v0.9):
- pulse_entity_profile resolves ANY wallet to its owner entity (master + named
  sub-accounts + combined open book). pulse_entity_leaderboard ranks OWNERS,
  not wallets. Use these whenever the user asks who is behind a wallet or
  wants leaderboards that don't double-count multi-account traders. [Pro tier]
- Responses may include a 'verified' stamp — the chain-state block this data
  was last reconciled against; cite it when the user asks how fresh/accurate
  the data is.

EXCHANGE AGGREGATES (v0.9):
- pulse_exchange_volume / pulse_exchange_oi / pulse_active_traders give 24h
  volume, open interest (long/short split), and active traders — PER DEX.
  Builder dexes (HIP-3) are ~43% of Hyperliquid volume; most trackers'
  headline numbers count native only, so cite the by-dex split when comparing.

BUILDER ANALYTICS (v0.11.1 — revenue + audience intelligence for builder-fee apps):
Builders (frontends, bots, HIP-3 dexes) charge per-order builder fees on
Hyperliquid. Revenue figures are EXACT, from Hyperliquid's on-chain cumulative
builder-fee ledger; detail metrics (volume/users/fills) come from order-fill
attribution and slightly undercount because trigger-order (stop/TP) fills are
not yet attributed — each response's dataNotes explains, and the 'verified'
stamp names the ledger block the data was reconciled against. builderName comes
from a curated registry and is omitted when unknown.
- builder_leaderboard → builders ranked by exact ledger revenue [Starter]
- builder_profile     → one builder: revenue, daily series, top coins [Starter]
- builder_traders     → wallets trading via a builder, with cohort tiers [Pro]
- builder_fills       → individual attributed fills through a builder [Pro]
- builder_cohorts     → a builder's user base split by behavioral tier [Pro]
- builder_retention   → monthly new-user retention triangle [Pro]
- builder_overlap     → which other builders share this one's users [Pro]
- builder_journey     → how fast a builder monetizes new-user cohorts [Pro]
- builder_lifecycle   → active/cooling/switched/dormant/movedOn user split [Pro]
- builder_heatmap     → 7x24 UTC weekday-by-hour activity grid, 12 weeks [Pro]
- builder_orders      → order intent: action/TIF mix, stops, fill rate [Pro]
- trader_builders     → the builders one wallet trades through [Starter]
Tiers on builder_traders/builder_cohorts are ALL-TIME exchange-wide labels
(legacy slugs), not the 30d-rolling tiers the pulse_cohort_recent_* tools use.

AUTHENTICATION:
Every tool requires a Coinversa API key (the API rejects keyless requests).
Remote connector: authorize by connecting the Coinversa connector. Local/stdio:
set COINVERSAA_API_KEY. Get a key at https://developers.coinversa.ai/keys.

PLANS & LIMITS:
- pulse_my_plan shows the caller's tier, limits, and every tier's limits.
  If a request is rejected for tier or rate-limit reasons, call it and
  report the caller's tier and the tier the feature requires.

TIPS:
- When a user mentions a commodity (gold, silver, oil) or stock (TSLA, AAPL), check builder dex markets with list_markets
- Always use the prefix:TICKER format for builder dex symbols (xyz:SILVER not just SILVER)
- The list_markets tool accepts an optional dex filter to narrow results`;

const server = new McpServer({
  name: "coinversaa-pulse",
  version: COINVERSA_VERSION,
}, {
  instructions: SERVER_INSTRUCTIONS,
});

// One invocation per tool call: every callAPI the handler makes (inner calls
// and retries) shares its X-Coinversa-Invocation id. Nothing is recorded or
// sent beyond those request headers.
{
  const registerTool = server.registerTool.bind(server) as (...args: any[]) => any;
  (server as any).registerTool = (name: string, config: any, handler: (...args: any[]) => any) =>
    registerTool(name, config, (...args: any[]) => runInInvocation(newInvocation(), () => handler(...args)));
}

// ══════════════════════════════════════════════════════════
// TOOL 1: Global Stats                              [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_global_stats")) server.registerTool(
  "pulse_global_stats",
  {
    title: "Global Stats",
    description: "Get global Hyperliquid trading statistics: total traders, trades, volume, PnL, and data coverage period. Use this to understand the overall scale of the market. dataStartDate/dataEndDate are the indexed trade window (2025-03-22 onward as of 0.11.4); data_coverage reports the window and freshness of every dataset.",
    inputSchema: { useToonFormat: useToonFormatSchema },
    annotations,
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/pulse/stats"))
);

// ══════════════════════════════════════════════════════════
// TOOL 2: Market Overview                           [FREE]
// ══════════════════════════════════════════════════════════
// TOOL 3: List Markets (Discovery)                  [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("list_markets")) server.registerTool(
  "list_markets",
  {
    title: "List Markets",
    description: "CANONICAL market discovery tool. Returns every trading symbol on Hyperliquid and its builder dexes with dex, mark price, 24h volume, funding rate, open interest, and 24h change. Use this whenever the user asks 'what markets are available?', mentions a commodity (gold, silver, oil), stock (TSLA, AAPL, NVDA), or builder-dex market. For asset-level grouping across venues, use list_assets instead.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      dex: z.enum(["hl", "xyz", "flx", "vntl", "hyna", "km", "abcd", "cash"]).optional().describe("Filter by dex. 'hl' for native Hyperliquid, 'xyz' for commodities/stocks, 'cash' for equities, 'km' for energy, etc. Omit for all markets."),
    },
    annotations,
  },
  async ({ useToonFormat, dex }) => {
    const params: Record<string, string> = {};
    if (dex) params.dex = dex;
    return toolResult(await callAPI(useToonFormat, "/pulse/market-overview", params));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL: List Assets (Canonical / Cross-Market Directory)  [FREE]
// ══════════════════════════════════════════════════════════
// Use this when the user asks "what venues trade GOLD?" or "which assets are
// cross-market?" — it returns the canonical asset directory with venue breakdown
// and synonym resolution (e.g. PAXG is shown as a synonym of GOLD).
if (shouldRegister("list_assets")) server.registerTool(
  "list_assets",
  {
    title: "List Assets",
    description: "Directory of every canonical asset that trades on Hyperliquid or any builder dex, grouped by economic exposure (not by venue ticker). Each asset entry lists its synonyms (e.g. PAXG is a synonym of GOLD), which venues it trades on, aggregated open interest, and a cross-market flag (listed on 2+ venues). Prefer this over list_markets when the user asks 'what assets are available?', 'which venues is GOLD on?', or 'show me cross-market assets'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      crossMarketOnly: z.boolean().optional().describe("If true, return only assets listed on 2+ venues. Default: false (return all)."),
    },
    annotations,
  },
  async ({ useToonFormat, crossMarketOnly }) => {
    const params: Record<string, string> = {};
    if (crossMarketOnly) params.crossMarketOnly = 'true';
    return toolResult(await callAPI(useToonFormat, "/assets", params));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL: List Asset (single canonical lookup)              [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("list_asset")) server.registerTool(
  "list_asset",
  {
    title: "Asset Lookup",
    description: "Lookup one asset by canonical name or synonym. Returns every venue it trades on, collateral tokens, open interest per venue, and synonyms list. Accepts both canonical names (GOLD, BTC) and synonyms (PAXG, XAUT) — the server resolves them. Use when the user mentions a specific asset and you need its venue availability.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      canonical: z.string().min(1).max(40).describe("Canonical asset name or synonym. Examples: 'GOLD', 'PAXG', 'BTC', 'SILVER', 'HYPE'. The server resolves synonyms to canonical."),
    },
    annotations,
  },
  async ({ useToonFormat, canonical }) => {
    return toolResult(await callAPI(useToonFormat, `/assets/${encodeURIComponent(canonical)}`));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL: Cross-Market Asset Aggregate                       [FREE]
// ══════════════════════════════════════════════════════════
// Server-side aggregation that replaces the old client-side groupby. Use this
// when the user wants to compare venues ("where is gold most crowded?", "is
// BTC bias different on hyna vs native?", "how much OI is on gold across all
// venues?"). Returns per-venue long/short/bias plus the cross-venue total.
if (shouldRegister("pulse_cross_market_asset")) server.registerTool(
  "pulse_cross_market_asset",
  {
    title: "Cross-Market Asset",
    description: "Cross-market aggregation for one asset: per-venue long/short positions, notional, net bias, unique wallets, leverage, plus a cross-venue total. Also returns biasRange (max-min netBias across venues) to detect disagreement. Accepts canonical names or synonyms (e.g. PAXG resolves to GOLD). Use when the user asks 'is gold crowded?', 'do different dexes disagree on BTC direction?', 'total OI on ETH across all venues?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      canonical: z.string().min(1).max(40).describe("Canonical asset name or synonym (e.g. 'GOLD', 'PAXG', 'BTC', 'HYPE'). The server resolves synonyms."),
    },
    annotations,
  },
  async ({ useToonFormat, canonical }) => {
    return toolResult(await callAPI(useToonFormat, `/assets/${encodeURIComponent(canonical)}/cross-market`));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 3: Leaderboard
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_leaderboard")) server.registerTool(
  "pulse_leaderboard",
  {
    title: "Trader Leaderboard",
    description: "Get ranked trader leaderboard. Sort by PnL, win rate, volume, score, or risk-adjusted returns. Filter by time period (day/week/month/allTime) and minimum trade count. Use this to find the best traders on Hyperliquid. Trade history is indexed from 2025-03-22 (pulse_global_stats.dataStartDate; see data_coverage for the current window).",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      sort: z.enum(["pnl", "winrate", "volume", "score", "risk-adjusted", "losers"]).default("pnl").describe("Sort criteria"),
      period: z.enum(["day", "week", "month", "allTime"]).default("allTime").describe("Time period"),
      limit: z.number().min(1).max(100).default(20).describe("Number of traders to return"),
      minTrades: z.number().default(100).describe("Minimum trade count filter"),
    },
    annotations,
  },
  async ({ useToonFormat, sort, period, limit, minTrades }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/leaderboard", { sort, period, limit: String(limit), minTrades: String(minTrades) }))
);

// ══════════════════════════════════════════════════════════
// TOOL 4: Hidden Gems
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_hidden_gems")) server.registerTool(
  "pulse_hidden_gems",
  {
    title: "Hidden Gems",
    description: "Discover underrated high-performing traders who fly under the radar. Filters by minimum win rate, PnL, and trade count. These are skilled traders that most platforms don't surface.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minWinRate: z.number().default(60).describe("Minimum win rate percentage"),
      minPnl: z.number().default(10000).describe("Minimum total PnL in USD"),
      minTrades: z.number().default(50).describe("Minimum number of trades"),
      maxTrades: z.number().default(500).describe("Maximum number of trades (filters out well-known whales)"),
      limit: z.number().min(1).max(100).default(20).describe("Number of traders to return"),
    },
    annotations,
  },
  async ({ useToonFormat, minWinRate, minPnl, minTrades, maxTrades, limit }) =>
    toolResult(
      await callAPI(useToonFormat, "/pulse/hidden-gems", {
        minWinRate: String(minWinRate),
        minPnl: String(minPnl),
        minTrades: String(minTrades),
        maxTrades: String(maxTrades),
        limit: String(limit),
      })
    )
);

// ══════════════════════════════════════════════════════════
// TOOL 5: Cohort Summary
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_summary")) server.registerTool(
  "pulse_cohort_summary",
  {
    title: "Cohort Summary",
    description: "Get behavioral cohort analysis across every tracked wallet on Hyperliquid. Returns PnL tiers (Apex/apex, Sharps/sharps, Grinders/grinders, Scrapers/scrapers, The Crowd/crowd, Bleeders/bleeders, Trapped/trapped, Blown Out/blown_out) and size tiers (Heavyweights/heavyweights, Cruiserweights/cruiserweights, Middleweights/middleweights, etc). Response payloads still use legacy slugs (money_printer, leviathan, ...). Each tier shows wallet count, avg PnL, avg win rate, and total volume. For the current tracked-wallet total, call pulse_global_stats first.",
    inputSchema: { useToonFormat: useToonFormatSchema },
    annotations,
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/pulse/cohorts/summary"))
);

// ══════════════════════════════════════════════════════════
// TOOL 6: Cohort Positions (What whales are doing NOW)
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_positions")) server.registerTool(
  "pulse_cohort_positions",
  {
    title: "Cohort Positions",
    description: "See what a specific trader cohort is holding RIGHT NOW. For example, get all live positions held by 'apex' (Apex) tier traders or 'heavyweights' (Heavyweights) size wallets. This is real-time whale intelligence.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
      tier: tierSchema,
      limit: z.number().min(1).max(200).default(50).describe("Number of positions to return"),
    },
    annotations,
  },
  async ({ useToonFormat, tierType, tier, limit }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/cohorts/${tierType}/${normalizeTier(tier)}/positions`, { limit: String(limit) }))
);

// ══════════════════════════════════════════════════════════
// TOOL 7: Trader Profile
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_profile")) server.registerTool(
  "pulse_trader_profile",
  {
    title: "Trader Profile",
    description: "Get full profile for any Hyperliquid trader by wallet address. Returns total PnL, trade count, win rate, volume, largest win/loss, first/last trade dates, PnL tier, size tier, and profit factor. Use this for due diligence on any wallet.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
    annotations,
  },
  async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}`))
);

// ══════════════════════════════════════════════════════════
// TOOL 8: Trader Performance
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_performance")) server.registerTool(
  "pulse_trader_performance",
  {
    title: "Trader Performance",
    description: "Get performance comparison for a trader: 30-day vs all-time PnL, trade count, win rate, and trend direction (improving/declining/stable). Use this to evaluate if a trader is currently hot or cooling off.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
    annotations,
  },
  async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/performance`))
);

// ══════════════════════════════════════════════════════════
// TOOL 9: Price Lookup                              [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("market_price")) server.registerTool(
  "market_price",
  {
    title: "Market Price",
    description: "Get current mark price for any trading pair on Hyperliquid. Use standard symbols (BTC, ETH, SOL) or builder dex format (xyz:SILVER, km:OIL, cash:TSLA).",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      symbol: z.string().min(1).max(20).describe("Trading pair symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN format (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
    },
    annotations,
  },
  async ({ useToonFormat, symbol }) => toolResult(await callAPI(useToonFormat, `/market/price/${normalizeCoin(symbol)}`))
);

// ══════════════════════════════════════════════════════════
// TOOL 10: Wallet Positions
// ══════════════════════════════════════════════════════════
if (shouldRegister("market_positions")) server.registerTool(
  "market_positions",
  {
    title: "Wallet Open Positions",
    description: "Get all open positions for any wallet address on Hyperliquid. Shows current entries, sizes, unrealized PnL, and leverage for each position.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
    annotations,
  },
  async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/market/positions/${address}`))
);

// ══════════════════════════════════════════════════════════
// TOOL 11: Recent Trades (Global)
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_recent_trades")) server.registerTool(
  "pulse_recent_trades",
  {
    title: "Recent Trades",
    description: "Get the biggest trades on Hyperliquid in the last N minutes/hours. Returns trades sorted by absolute PnL — the largest movers. Use this to see what's happening right now on the exchange.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      since: sinceSchema.default("10m"),
      limit: z.number().min(1).max(100).default(20).describe("Number of trades to return"),
      coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER)"),
    },
    annotations,
  },
  async ({ useToonFormat, since, limit, coin }) => {
    const params: Record<string, string> = { since, limit: String(limit) };
    if (coin) params.coin = normalizeCoin(coin);
    return toolResult(await callAPI(useToonFormat, "/pulse/trades/recent", params));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 12: Trader Recent Trades
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_trades")) server.registerTool(
  "pulse_trader_trades",
  {
    title: "Trader Trades",
    description: "Get recent trades for a specific wallet address. See exactly what a trader has been doing in the last minutes/hours — every buy, sell, size, price, and PnL. Essential for copy-trading and due diligence. Trade history is indexed from 2025-03-22 (pulse_global_stats.dataStartDate; see data_coverage for the current window).",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
      since: sinceSchema.default("1h"),
      limit: z.number().min(1).max(100).default(50).describe("Number of trades to return"),
      coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER)"),
    },
    annotations,
  },
  async ({ useToonFormat, address, since, limit, coin }) => {
    const params: Record<string, string> = { since, limit: String(limit) };
    if (coin) params.coin = normalizeCoin(coin);
    return toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/trades`, params));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 13: Cohort Recent Trades
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_trades")) server.registerTool(
  "pulse_cohort_trades",
  {
    title: "Cohort Trades",
    description: "See every trade a specific cohort has made recently. For example: 'show me all trades the apex (Apex) tier made in the last hour.'",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
      tier: tierSchema,
      since: sinceSchema.default("1h"),
      limit: z.number().min(1).max(100).default(50).describe("Number of trades to return"),
    },
    annotations,
  },
  async ({ useToonFormat, tierType, tier, since, limit }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/cohorts/${tierType}/${normalizeTier(tier)}/trades`, { since, limit: String(limit) }))
);

// ══════════════════════════════════════════════════════════
// TOOL 14: Liquidation Heatmap
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_liquidation_heatmap")) server.registerTool(
  "live_liquidation_heatmap",
  {
    title: "Live Liquidation Heatmap",
    description: "Get a liquidation heatmap for any coin. Shows where liquidation clusters are across price levels — essential for identifying support/resistance and potential squeeze zones.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
      buckets: z.number().min(10).max(100).default(50).describe("Number of price buckets in the heatmap"),
      range: z.number().min(1).max(50).default(30).describe("Price range percentage around current price"),
    },
    annotations,
  },
  async ({ useToonFormat, coin, buckets, range }) =>
    toolResult(
      await callAPI(useToonFormat, `/live/liquidation-heatmap/${normalizeCoin(coin)}`, {
        buckets: String(buckets),
        range: String(range),
      })
    )
);

// ══════════════════════════════════════════════════════════
// TOOL 15: Market Risk Overview
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_risk_overview")) server.registerTool(
  "live_risk_overview",
  {
    title: "Live Risk Overview",
    description: "Get the exchange-wide market risk snapshot. Best for questions like 'what looks fragile right now?' or 'which coins are most crowded?'. Returns total open interest, leverage, crowding concentration, near-liquidation exposure, 7-day liquidation totals, and the top coins where positioning looks most fragile.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
    },
    annotations,
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/live/risk/overview"))
);

// ══════════════════════════════════════════════════════════
// TOOL 16: Coin Risk Snapshot
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_coin_risk_snapshot")) server.registerTool(
  "live_coin_risk_snapshot",
  {
    title: "Live Coin Risk Snapshot",
    description: "Get the current risk snapshot for a single coin. Use this when a user asks 'is BTC crowded?', 'who is holding the risk?', or 'how liquidation-prone is this market right now?'. Returns OI, wallet count, long/short posture, position-size concentration, top positions, liquidation heatmap, and 7-day liquidation totals.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN (e.g. xyz:GOLD, km:OIL, cash:TSLA)"),
    },
    annotations,
  },
  async ({ useToonFormat, coin }) => toolResult(await callAPI(useToonFormat, `/live/risk/coins/${normalizeCoin(coin)}`))
);

// ══════════════════════════════════════════════════════════
// TOOL 17: Coin Risk History
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_coin_risk_history")) server.registerTool(
    "live_coin_risk_history",
    {
      title: "Live Coin Risk History",
      description: "Get the historical risk lane for a coin. Best for questions like 'how did this setup become fragile?' or 'did smart money rotate before the move?'. Returns hourly OI, long/short history, cohort rotation, candle data, and liquidation counts over time; by default the minute-level markDislocations section is omitted (it alone is ~700 rows per 12h). Pass include=[..., 'markDislocations'] to add it bucketed to 1 hour (the max-|basisPct| minute per hour), or use live_mark_dislocations for finer resolution. The response lists sections and omittedSections. Freshness and availability are in the response's freshness/availability stamps; see data_coverage for the risk-data window.",
      inputSchema: {
        useToonFormat: useToonFormatSchema,
        coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN"),
        hours: z.number().min(1).max(720).default(168).describe("Number of hours of history to return (default 168 = 7 days, max 720 = 30 days)"),
        include: z.array(z.enum(RISK_HISTORY_SECTIONS)).min(1).optional().describe("Sections to return. Default: every section except markDislocations. markDislocations, when included, is bucketed to 1h."),
      },
      annotations: { ...annotations, title: "Live Coin Risk History" },
    },
    async ({ useToonFormat, coin, hours, include }) => {
      const history = await callAPI(false, `/live/risk/coins/${normalizeCoin(coin)}/history`, { hours: String(hours) });
      const wanted = new Set<string>(include ?? RISK_HISTORY_DEFAULT_SECTIONS);
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(history ?? {})) {
        if ((RISK_HISTORY_SECTIONS as readonly string[]).includes(k)) continue;
        result[k] = v;
      }
      for (const section of RISK_HISTORY_SECTIONS) {
        if (!wanted.has(section)) continue;
        if (section === "markDislocations") {
          const raw: any[] = Array.isArray(history?.markDislocations) ? history.markDislocations : [];
          result.markDislocations = bucketSeries(raw, DISLOCATION_RESOLUTION_MS["1h"], (r) => r.timestamp, (r) => Math.abs(Number(r.basisPct) || 0));
          result.markDislocationsResolution = "1h";
          result.markDislocationsRawCount = raw.length;
        } else {
          result[section] = history?.[section] ?? null;
        }
      }
      const omitted = RISK_HISTORY_SECTIONS.filter((sec) => !wanted.has(sec));
      result.sections = RISK_HISTORY_SECTIONS.filter((sec) => wanted.has(sec));
      result.omittedSections = omitted;
      if (omitted.length > 0) {
        result.note = `Sections omitted: ${omitted.join(", ")}. Pass include=[...] naming them to add them; markDislocations comes back bucketed to 1h (use live_mark_dislocations for 1m/5m).`;
      }
      return toolResult(useToonFormat ? toonEncode(result) : result);
    }
  );

// ══════════════════════════════════════════════════════════
// TOOL 18: Mark Dislocations
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_mark_dislocations")) server.registerTool(
    "live_mark_dislocations",
    {
      title: "Live Mark Dislocations",
      description: "Get historical mark/oracle dislocation data for a coin. Use this to answer questions like 'did basis stress or oracle drift show up before liquidations?'. Returns timestamped mark price, oracle price, and basis percentage over the requested window — default 168 hours (7 days), max 720 hours (30 days). The source series is one row per minute; the connector buckets it by `resolution` (default 5m: the max-|basisPct| minute in each 5-minute bucket; 1h likewise; 1m = raw) and returns at most `limit` rows (default 500, newest kept), with totalCount, truncated and a note when rows were dropped. For 7 days at full detail use resolution=1h, or page by shortening hours. See data_coverage for the risk-data freshness stamp.",
      inputSchema: {
        useToonFormat: useToonFormatSchema,
        coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN"),
        hours: z.number().min(1).max(720).default(168).describe("Number of hours of history to return (default 168 = 7 days, max 720 = 30 days)"),
        resolution: z.enum(["1m", "5m", "1h"]).default("5m").describe("Bucket width. Each bucket keeps the minute with the largest |basisPct|. Default 5m; 1m returns the raw minute rows."),
        limit: z.number().int().min(1).max(5000).default(500).describe("Max rows to return after bucketing (default 500). The newest rows are kept when the cap applies."),
      },
      annotations: { ...annotations, title: "Live Mark Dislocations" },
    },
    async ({ useToonFormat, coin, hours, resolution, limit }) => {
      const history = await callAPI(false, `/live/risk/coins/${normalizeCoin(coin)}/history`, { hours: String(hours) });
      const raw: any[] = Array.isArray(history?.markDislocations) ? history.markDislocations : [];
      const bucketed = bucketSeries(raw, DISLOCATION_RESOLUTION_MS[resolution], (r) => r.timestamp, (r) => Math.abs(Number(r.basisPct) || 0));
      const base = {
        success: history?.success,
        coin: history?.coin,
        hours: history?.hours,
        resolution,
        rawCount: raw.length,
        count: 0,
        markDislocations: bucketed,
        availability: history?.availability,
        freshness: history?.freshness,
        generatedAt: history?.generatedAt,
      };
      const capped = capArray(base, "markDislocations", limit, {
        keepEnd: true,
        note: (shown, total) => `Showing the newest ${shown} of ${total} ${resolution} rows; raise limit (max 5000), coarsen resolution (5m/1h), or shorten hours to see the rest.`,
      });
      capped.count = capped.markDislocations.length;
      return toolResult(useToonFormat ? toonEncode(capped) : capped);
    }
  );

// ══════════════════════════════════════════════════════════
// TOOL 19: Recent Liquidations
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_recent_liquidations")) server.registerTool(
  "live_recent_liquidations",
  {
    title: "Live Recent Liquidations",
    description: "Get real liquidation events from the syncer. Best for questions like 'where did forced unwind activity actually hit?' or 'show me BTC liquidations over the last 30 days'. Returns wallet, coin, penalty fee, and closed PnL.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      since: sinceSchema.default("7d"),
      coin: z.string().optional().describe("Optional coin filter (e.g. BTC, ETH, SOL or builder dex prefix:COIN)"),
      limit: z.number().min(1).max(200).default(50).describe("Number of liquidation events to return"),
    },
    annotations,
  },
  async ({ useToonFormat, since, coin, limit }) => {
    const params: Record<string, string> = { since, limit: String(limit) };
    if (coin) params.coin = normalizeCoin(coin);
    return toolResult(await callAPI(useToonFormat, "/live/risk/liquidations/recent", params));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 20: Liquidation Summary
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_liquidation_summary")) server.registerTool(
  "live_liquidation_summary",
  {
    title: "Live Liquidation Summary",
    description: "Get an aggregated liquidation summary over a time window. This is the best liquidation tool for summaries, rankings, and trend analysis. Returns event count, penalty fees, closed PnL, per-coin rollups, and a liquidation timeline.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      since: sinceSchema.default("7d"),
      coin: z.string().optional().describe("Optional coin filter (e.g. BTC, ETH, SOL or builder dex prefix:COIN)"),
    },
    annotations,
  },
  async ({ useToonFormat, since, coin }) => {
    const params: Record<string, string> = { since };
    if (coin) params.coin = normalizeCoin(coin);
    return toolResult(await callAPI(useToonFormat, "/live/risk/liquidations/summary", params));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 20: Long/Short Ratio                         [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_long_short_ratio")) server.registerTool(
  "live_long_short_ratio",
  {
    title: "Live Long/Short Ratio",
    description: "Get long/short ratio data. Without a coin, returns the global ratio across all Hyperliquid. With a coin, returns that specific pair's ratio. Optionally include historical data over the last N hours.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().optional().describe("Coin symbol (e.g. BTC, ETH). For builder dex: prefix:COIN (e.g. xyz:SILVER). Omit for global ratio."),
      hours: z.number().min(1).max(168).optional().describe("Include historical data for the last N hours (max 168 = 7 days)"),
    },
    annotations,
  },
  async ({ useToonFormat, coin, hours }) => {
    if (hours) {
      // Historical mode
      const params: Record<string, string> = { hours: String(hours) };
      if (coin) params.coin = normalizeCoin(coin);
      return toolResult(await callAPI(useToonFormat, "/live/long-short/history", params));
    }
    if (coin) {
      return toolResult(await callAPI(useToonFormat, `/live/coins/${normalizeCoin(coin)}/long-short`));
    }
    return toolResult(await callAPI(useToonFormat, "/live/long-short"));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 16: Cohort Bias
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_cohort_bias")) server.registerTool(
  "live_cohort_bias",
  {
    title: "Live Cohort Bias",
    description: "See what each trader cohort is doing on a specific coin RIGHT NOW. Returns the net long/short bias for every tier (Apex, Sharps, Middleweights, etc.) on the given coin. Answers questions like 'are the Sharps traders long or short ETH?'",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
    },
    annotations,
  },
  async ({ useToonFormat, coin }) => toolResult(await callAPI(useToonFormat, `/live/cohort-bias/${normalizeCoin(coin)}`))
);

// ══════════════════════════════════════════════════════════
// TOOL 17: Trader Daily Stats
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_daily_stats")) server.registerTool(
  "pulse_trader_daily_stats",
  {
    title: "Trader Daily Stats",
    description: "Get day-by-day performance breakdown for any trader. Returns daily PnL, trade count, win rate, and volume for each day the trader was active. Use for deep due diligence and identifying consistency patterns.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
    annotations,
  },
  async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/daily`))
);

// ══════════════════════════════════════════════════════════
// TOOL 18: Biggest Wins & Losses (Global)
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_biggest_trades")) server.registerTool(
  "pulse_biggest_trades",
  {
    title: "Biggest Trades",
    description: "Get the biggest winning or losing trades across all of Hyperliquid. Use type='wins' for the largest profitable trades, or type='losses' for the largest losses. Useful for market sentiment and narrative analysis.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      type: z.enum(["wins", "losses"]).describe("'wins' for biggest profitable trades, 'losses' for biggest losing trades"),
      limit: z.number().min(1).max(50).default(20).describe("Number of trades to return"),
      threshold: z.number().optional().describe("Minimum PnL for wins (e.g. 50000) or maximum PnL for losses (e.g. -50000)"),
    },
    annotations,
  },
  async ({ useToonFormat, type, limit, threshold }) => {
    if (type === "wins") {
      const params: Record<string, string> = { limit: String(limit) };
      if (threshold !== undefined) params.minPnl = String(threshold);
      return toolResult(await callAPI(useToonFormat, "/pulse/biggest-wins", params));
    } else {
      const params: Record<string, string> = { limit: String(limit) };
      if (threshold !== undefined) params.maxPnl = String(threshold);
      return toolResult(await callAPI(useToonFormat, "/pulse/biggest-losses", params));
    }
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 19: Order Book                               [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("market_orderbook")) server.registerTool(
  "market_orderbook",
  {
    title: "Market Order Book",
    description: "Get the order book (bid/ask depth) for any trading pair on Hyperliquid. Shows price levels and sizes on both sides. Essential for understanding liquidity, spread, and potential support/resistance.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      symbol: z.string().min(1).max(20).describe("Trading pair symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN format (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
      depth: z.number().min(1).max(50).default(10).describe("Number of price levels on each side"),
    },
    annotations,
  },
  async ({ useToonFormat, symbol, depth }) =>
    toolResult(await callAPI(useToonFormat, `/market/orderbook/${normalizeCoin(symbol)}`, { depth: String(depth) }))
);

// ══════════════════════════════════════════════════════════
// TOOL 20: Token Leaderboard
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_token_leaderboard")) server.registerTool(
  "pulse_token_leaderboard",
  {
    title: "Token Leaderboard",
    description: "Get the top traders for a specific coin. Answers questions like 'who are the best BTC traders?' or 'who profits most from SOL?'. Returns ranked traders with PnL, trade count, win rate, and volume for that specific coin.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
      limit: z.number().min(1).max(100).default(50).describe("Number of traders to return"),
    },
    annotations,
  },
  async ({ useToonFormat, coin, limit }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/token-leaderboard/${normalizeCoin(coin)}`, { limit: String(limit) }))
);

// ══════════════════════════════════════════════════════════
// TOOL 21: Trader Token Stats
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_token_stats")) server.registerTool(
  "pulse_trader_token_stats",
  {
    title: "Trader Token Stats",
    description: "Get token-by-token P&L breakdown for any trader. Shows which coins they trade, their PnL per coin, win rate per coin, and volume per coin. Use to understand a trader's edge — e.g. 'this trader only makes money on ETH and loses on everything else.'",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
    annotations,
  },
  async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/tokens`))
);

// ══════════════════════════════════════════════════════════
// TOOL 22: Most Traded Coins                        [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_most_traded_coins")) server.registerTool(
  "pulse_most_traded_coins",
  {
    title: "Most Traded Coins",
    description: "Get the most actively traded coins on Hyperliquid, ranked by trade count and volume. Use to understand what the market is focused on right now.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      limit: z.number().min(1).max(100).default(20).describe("Number of coins to return"),
    },
    annotations,
  },
  async ({ useToonFormat, limit }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/most-traded", { limit: String(limit) }))
);

// ══════════════════════════════════════════════════════════
// TOOL 23: Cohort History
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_history")) server.registerTool(
  "pulse_cohort_history",
  {
    title: "Cohort History",
    description: "Get historical performance data for a specific trader cohort over time. Shows how a tier's aggregate PnL, trade count, and activity have changed day-by-day. Use to spot trends like 'the sharps (Sharps) tier has been increasingly bearish over the last month.'",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
      tier: tierSchema,
      days: z.number().min(1).max(365).default(30).describe("Number of days of history to return"),
    },
    annotations,
  },
  async ({ useToonFormat, tierType, tier, days }) =>
    toolResult(
      await callAPI(useToonFormat, `/pulse/cohorts/${tierType}/${normalizeTier(tier)}/history`, { days: String(days) })
    )
);

// ══════════════════════════════════════════════════════════
// TOOL 24: Trader Closed Positions
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_closed_positions")) server.registerTool(
  "pulse_trader_closed_positions",
  {
    title: "Trader Closed Positions",
    description: "Get closed position history for any wallet. Shows every position that was opened and closed — with entry/exit prices, hold duration, PnL, and leverage. Use this to analyze a trader's position lifecycle and timing patterns. Answers: 'Show me all historical positions for this trader', 'What was the PnL and duration of each position?', 'When did this whale close their massive ETH long?'",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
      limit: z.number().min(1).max(200).default(50).describe("Number of positions to return"),
      offset: z.number().min(0).default(0).describe("Pagination offset"),
      coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER)"),
    },
    annotations,
  },
  async ({ useToonFormat, address, limit, offset, coin }) => {
    const params: Record<string, string> = { limit: String(limit), offset: String(offset) };
    if (coin) params.coin = normalizeCoin(coin);
    return toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/closed-positions`, params));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 25: Trader Closed Position Stats
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_closed_position_stats")) server.registerTool(
  "pulse_trader_closed_position_stats",
  {
    title: "Trader Closed Position Stats",
    description: "Get aggregate statistics about a trader's closed positions: average hold duration, win rate by position (not by fill), total positions closed, and PnL summary. Use this to understand how long a trader typically holds and their position-level performance. Answers: 'What is this trader's average hold time?', 'Win rate by position (not by fill)?', 'Is this trader a scalper or swing trader?', 'Average PnL per position?'",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
    annotations,
  },
  async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/closed-positions/stats`))
);

// ══════════════════════════════════════════════════════════
// TOOL 26: Recent Closed Positions (Global)
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_recent_closed_positions")) server.registerTool(
  "pulse_recent_closed_positions",
  {
    title: "Recent Closed Positions",
    description: "Get recently closed positions across all traders. See what positions were just closed in the last N minutes/hours — with entry/exit prices and hold duration. Filterable by coin, minimum notional size, and hold duration range. Use to find: sub-second HFT trades (maxDuration=1000), positions that just got stopped out, large positions that just closed (minNotional=100000), quick scalps vs long holds.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      since: sinceSchema.default("1h"),
      limit: z.number().min(1).max(200).default(50).describe("Number of positions to return"),
      coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER)"),
      minNotional: z.number().optional().describe("Minimum notional value in USD (e.g. 100000 for $100K+ positions)"),
      minDuration: z.number().optional().describe("Minimum hold duration in milliseconds (e.g. 60000 for positions held at least 1 minute)"),
      maxDuration: z.number().optional().describe("Maximum hold duration in milliseconds (e.g. 1000 for sub-second HFT trades, 60000 for under 1 minute)"),
    },
    annotations,
  },
  async ({ useToonFormat, since, limit, coin, minNotional, minDuration, maxDuration }) => {
    const params: Record<string, string> = { since, limit: String(limit) };
    if (coin) params.coin = normalizeCoin(coin);
    if (minNotional != null) params.minNotional = String(minNotional);
    if (minDuration != null) params.minDuration = String(minDuration);
    if (maxDuration != null) params.maxDuration = String(maxDuration);
    return toolResult(await callAPI(useToonFormat, "/pulse/closed-positions/recent", params));
  }
);

// ══════════════════════════════════════════════════════════
// v0.8.0 — Global Recent Lifecycles (successor to pulse_recent_closed_positions)
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_lifecycles_recent")) server.registerTool(
  "pulse_lifecycles_recent",
  {
    title: "Recent Closed Lifecycles",
    description: "Global feed of the most recently CLOSED position lifecycles across ALL wallets — 'what just closed exchange-wide right now'. Reads the corrected position_lifecycles_full table: includes MAE/MFE (when backfilled), a liquidation flag, and optional spot. Cross-wallet successor to pulse_recent_closed_positions. Filter by coin, minNotional, hold-duration range, and time window. Note: the very freshest closes may not have MAE/MFE yet — the risk backfill lags real-time, so recent rows can show null MAE/MFE. Lifecycles are a rolling 90-day window; the table's first day is not exposed by the API — see data_coverage.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      since: sinceSchema.default("1h"),
      limit: z.number().min(1).max(200).default(50).describe("Number of lifecycles to return."),
      coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER)."),
      includeSpot: z.boolean().default(false).describe("Include spot (@-prefixed) pairs. Default false (perps only)."),
      minNotional: z.number().optional().describe("Minimum notional in USD (peak_size * entry_vwap), e.g. 100000 for $100K+ positions."),
      minDuration: z.number().optional().describe("Minimum hold duration in milliseconds (e.g. 60000 for >= 1 minute)."),
      maxDuration: z.number().optional().describe("Maximum hold duration in milliseconds (e.g. 1000 for sub-second HFT)."),
    },
    annotations,
  },
  async ({ useToonFormat, since, limit, coin, includeSpot, minNotional, minDuration, maxDuration }) => {
    const params: Record<string, string> = { since, limit: String(limit), includeSpot: String(includeSpot) };
    if (coin) params.coin = normalizeCoin(coin);
    if (minNotional != null) params.minNotional = String(minNotional);
    if (minDuration != null) params.minDuration = String(minDuration);
    if (maxDuration != null) params.maxDuration = String(maxDuration);
    return toolResult(await callAPI(useToonFormat, "/pulse/lifecycles/recent", params));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 27: Historical Open Interest
// ══════════════════════════════════════════════════════════
if (shouldRegister("market_historical_oi")) server.registerTool(
  "market_historical_oi",
  {
    title: "Historical Open Interest",
    description: "Get historical hourly open interest snapshots (notional USD). Supports per-coin filtering or global exchange aggregation. Max range is 30 days.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER). Omit for global exchange aggregate."),
      since: sinceSchema.optional().describe("Time window for history (max 30d). e.g. '24h', '7d', '30d'"),
      startTime: z.string().optional().describe("Explicit start time (ISO string or timestamp). Overrides 'since'."),
      endTime: z.string().optional().describe("Explicit end time (ISO string or timestamp). Defaults to now."),
    },
    annotations,
  },
  async ({ useToonFormat, coin, since, startTime, endTime }) => {
    const params: Record<string, string> = {};
    if (since) params.since = since;
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;
    if (coin) params.coin = normalizeCoin(coin);
    return toolResult(await callAPI(useToonFormat, "/market/historical-oi", params));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 28: Recent 1m Candles
// ══════════════════════════════════════════════════════════
if (shouldRegister("market_recent_candles")) server.registerTool(
  "market_recent_candles",
  {
    title: "Recent Candles",
    description: "Get recent 1-minute candle history for a market. Best for short intraday structure checks, recent momentum, and micro-pullback analysis. This MCP tool is intentionally capped to the most recent 12 hours so agents do not fetch huge minute-bar dumps in one call.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      symbol: z.string().min(1).max(20).describe("Market symbol (e.g. BTC, ETH, SOL, xyz:GOLD, cash:TSLA)"),
      limit: z.number().min(1).max(720).default(240).describe("Number of 1-minute candles to return. Capped at 720 candles (12h) to keep MCP responses practical."),
    },
    annotations,
  },
  async ({ useToonFormat, symbol, limit }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/market/candles/recent/${normalizeCoin(symbol)}`, { interval: "1m", limit: String(limit) }))
);

// ══════════════════════════════════════════════════════════
// TOOL 29: Cohort Bias History
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_bias_history")) server.registerTool(
    "pulse_cohort_bias_history",
    {
      title: "Cohort Bias History",
      description: "Get historical hourly bias snapshots for trader cohorts. Returns net long/short notional and account counts per tier — 32 tier rows per hour (16 PnL + 16 size tiers), so filter with tierType and/or tier for a readable series. Use this to see how different groups (whales, smart money) have shifted their positioning over time. Supports per-coin or global aggregate; the API default window is 7d, max 30d. Returns { rows, totalCount, truncated, note? } with rows newest first, capped at `limit` (default 100); when truncated, narrow with tierType/tier or a shorter since, or raise limit (max 2000). Cohort history is served for up to the last 30 days; see data_coverage.",
      inputSchema: {
        useToonFormat: useToonFormatSchema,
        coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER). Omit for global exchange aggregate."),
        since: sinceSchema.optional().describe("Time window for history (max 30d). e.g. '24h', '7d', '30d'"),
        startTime: z.string().optional().describe("Explicit start time (ISO string or timestamp). Overrides 'since'."),
        endTime: z.string().optional().describe("Explicit end time (ISO string or timestamp). Defaults to now."),
        tierType: z.enum(["pnl", "size"]).optional().describe("Keep only PnL-tier or size-tier rows (applied by the connector; halves the row count)."),
        tier: tierSchema.optional().describe("Keep only one tier's rows (either vocabulary). Combine with tierType for a single series."),
        limit: z.number().int().min(1).max(2000).default(100).describe("Max rows to return, newest first (default 100, max 2000)."),
      },
      annotations: { ...annotations, title: "Cohort Bias History" },
    },
    async ({ useToonFormat, coin, since, startTime, endTime, tierType, tier, limit }) => {
      const params: Record<string, string> = {};
      if (since) params.since = since;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      if (coin) params.coin = normalizeCoin(coin);
      const data = await callAPI(false, "/pulse/cohort-bias/history", params);
      const all: any[] = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
      const rows = sortCohortRows(filterCohortRows(all, tierType, tier), "timestamp");
      const base = {
        coin: params.coin ?? "aggregate",
        since: since ?? (startTime ? undefined : "7d"),
        startTime,
        endTime,
        tierType: tierType ?? null,
        tier: tier ? normalizeTier(tier) : null,
        rowsBeforeFilter: all.length,
        rows,
      };
      const result = capArray(base, "rows", limit, {
        note: (shown, total) => `Showing the newest ${shown} of ${total} rows; narrow with tierType/tier or a shorter since, or raise limit (max 2000).`,
      });
      return toolResult(useToonFormat ? toonEncode(result) : result);
    }
  );

// ══════════════════════════════════════════════════════════
// TOOL 30: Cohort Daily Performance Stats
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_performance_daily")) server.registerTool(
    "pulse_cohort_performance_daily",
    {
      title: "Cohort Daily Performance",
      description: "Get historical daily performance statistics for trader cohorts. Returns PnL, volume, trade counts, and active trader counts per tier — 32 tier rows per day, so filter with tierType and/or tier for a readable series. Use this to track the consistency and profitability of different groups over time. API default window 30d, max 30d. Returns { rows, totalCount, truncated, note? } sorted by date (newest first) then tierType and tier, capped at `limit` (default 100); when truncated, narrow with tierType/tier or a shorter since, or raise limit (max 2000). Cohort history is served for up to the last 30 days; see data_coverage.",
      inputSchema: {
        useToonFormat: useToonFormatSchema,
        since: sinceSchema.optional().describe("Time window for history (max 30d). e.g. '7d', '14d', '30d'"),
        startTime: z.string().optional().describe("Explicit start time (ISO string or timestamp). Overrides 'since'."),
        endTime: z.string().optional().describe("Explicit end time (ISO string or timestamp). Defaults to now."),
        tierType: z.enum(["pnl", "size"]).optional().describe("Keep only PnL-tier or size-tier rows (applied by the connector; halves the row count)."),
        tier: tierSchema.optional().describe("Keep only one tier's rows (either vocabulary). Combine with tierType for a single series."),
        limit: z.number().int().min(1).max(2000).default(100).describe("Max rows to return, newest date first (default 100, max 2000)."),
      },
      annotations: { ...annotations, title: "Cohort Daily Performance" },
    },
    async ({ useToonFormat, since, startTime, endTime, tierType, tier, limit }) => {
      const params: Record<string, string> = {};
      if (since) params.since = since;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      const data = await callAPI(false, "/pulse/cohorts/daily-stats", params);
      const all: any[] = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
      const rows = sortCohortRows(filterCohortRows(all, tierType, tier), "date");
      const base = {
        since: since ?? (startTime ? undefined : "30d"),
        startTime,
        endTime,
        tierType: tierType ?? null,
        tier: tier ? normalizeTier(tier) : null,
        rowsBeforeFilter: all.length,
        rows,
      };
      const result = capArray(base, "rows", limit, {
        note: (shown, total) => `Showing the newest ${shown} of ${total} rows; narrow with tierType/tier or a shorter since, or raise limit (max 2000).`,
      });
      return toolResult(useToonFormat ? toonEncode(result) : result);
    }
  );

// ══════════════════════════════════════════════════════════
// TOOL 37: Open Interest History
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_oi_history")) server.registerTool(
  "live_oi_history",
  {
    title: "Live Open Interest History",
    description: "Get historical open interest data for any coin on Hyperliquid, or global OI across all coins. Best for identifying accumulation/distribution phases, market conviction shifts, and whether a move was backed by positioning. Default 7 days, max 30 days.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().optional().describe("Coin symbol (e.g. BTC, ETH, SOL). Omit for global OI across all coins."),
      hours: z.number().min(1).max(720).default(168).describe("Number of hours of history (default 168 = 7 days, max 720 = 30 days)"),
    },
    annotations,
  },
  async ({ useToonFormat, coin, hours }) => {
    if (coin) {
      return toolResult(await callAPI(useToonFormat, `/live/oi-history/${coin.toUpperCase()}`, { hours: String(hours) }));
    }
    return toolResult(await callAPI(useToonFormat, "/live/oi-history", { hours: String(hours) }));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL: Official OI (per-dex exchange ground truth)
// ══════════════════════════════════════════════════════════
// Returns the venue's self-reported open interest (pulled from Hyperliquid's
// Info API) rather than our derived OI from live_positions. Use this when the
// user wants audit-grade verification ("does our OI match what Hyperliquid
// publishes?"), per-dex breakdowns, or when cross-checking our computed
// numbers against venue ground truth.
if (shouldRegister("live_official_oi")) server.registerTool(
  "live_official_oi",
  {
    title: "Live Official Open Interest",
    description: "Official per-dex open interest for a coin, sourced from Hyperliquid's Info API (not derived from live_positions). Returns hourly snapshots with open interest, mark price, and 24h notional volume. Use when an agent needs venue-reported ground truth, per-dex breakdown, or wants to cross-check computed OI against official numbers. Default 7 days, max 30 days.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(40).describe("Coin symbol (e.g. BTC, ETH, SOL). Use the bare ticker — dex is supplied via the 'dex' parameter, not prefix."),
      hours: z.number().min(1).max(720).default(168).describe("Number of hours of history (default 168 = 7 days, max 720 = 30 days)"),
      dex: z.enum(["hl", "xyz", "flx", "vntl", "hyna", "km", "abcd", "cash"]).optional().default("hl").describe("Which dex's official OI to return. Defaults to 'hl' (native Hyperliquid)."),
    },
    annotations,
  },
  async ({ useToonFormat, coin, hours, dex }) => {
    const params: Record<string, string> = { hours: String(hours) };
    if (dex) params.dex = dex;
    return toolResult(await callAPI(useToonFormat, `/live/official-oi/${coin.toUpperCase()}`, params));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 38: Cohort Bias History
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_cohort_bias_history")) server.registerTool(
  "live_cohort_bias_history",
  {
    title: "Live Cohort Bias History",
    description: "Get historical cohort bias data for a specific coin. Use this when a user asks 'were smart-money cohorts accumulating or exiting?' or 'which tier flipped first?'. Returns hourly net-bias snapshots for each tier or for a specific tier over time.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL)"),
      tierType: z.enum(["pnl", "size"]).default("pnl").describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
      tier: tierSchema.optional().describe("Specific tier to track. Omit for all tiers in the category."),
      hours: z.number().min(1).max(720).default(168).describe("Number of hours of history (default 168 = 7 days, max 720 = 30 days)"),
    },
    annotations,
  },
  async ({ useToonFormat, coin, tierType, tier, hours }) => {
    const params: Record<string, string> = { hours: String(hours), tierType };
    if (tier) params.tier = normalizeTier(tier);
    return toolResult(await callAPI(useToonFormat, `/live/cohort-bias-history/${coin.toUpperCase()}`, params));
  }
);

// ══════════════════════════════════════════════════════════
// HIP-4 Outcome Contract Tools
// ══════════════════════════════════════════════════════════
const outcomeIdSchema = z
  .number()
  .int()
  .min(0)
  .describe("HIP-4 outcome ID. Side-token coins are encoded as #<10*outcomeId+side>.");

if (shouldRegister("hip4_outcomes")) server.registerTool("hip4_outcomes",
    {
      title: "HIP-4 Outcomes",
      description: "List active HIP-4 outcome contracts that traded recently. Returns outcome IDs, question metadata when available, side tokens, fills, unique wallets, notional USDH, and first/last traded timestamps. Use when users ask what prediction/outcome markets are active. Outcomes are sorted by notionalUsdh descending and capped at `limit` (default 25, max 200; the API route has no paging, so the cap is applied by the connector) — the response carries count (returned), totalCount, truncated and a note; raise limit or shorten hours to see more. HIP-4 fills are indexed from mainnet launch (2026-05-02; the API clamps every look-back to it) — see data_coverage for freshness.",
      inputSchema: {
        useToonFormat: useToonFormatSchema,
        hours: z.number().int().min(1).max(168).default(24).describe("Look-back window in hours. Default 24, max 168."),
        limit: z.number().int().min(1).max(200).default(25).describe("Max outcomes to return, largest notionalUsdh first (default 25, max 200)."),
      },
      annotations: { ...annotations, title: "HIP-4 Outcomes" },
    },
    async ({ useToonFormat, hours, limit }) => {
      const data = await callAPI(false, "/hip4/outcomes", { hours: String(hours) });
      const outcomes: any[] = Array.isArray(data?.outcomes) ? [...data.outcomes] : [];
      outcomes.sort((a, b) => (Number(b?.notionalUsdh) || 0) - (Number(a?.notionalUsdh) || 0));
      const result = capArray({ ...(data ?? {}), hours, outcomes }, "outcomes", limit, {
        note: (shown, total) => `Showing the top ${shown} of ${total} outcomes by notionalUsdh; raise limit (max 200) or shorten hours to see more.`,
      });
      result.count = result.outcomes.length;
      return toolResult(useToonFormat ? toonEncode(result) : result);
    }
  );

if (shouldRegister("hip4_outcome")) server.registerTool(
  "hip4_outcome",
  {
    title: "HIP-4 Outcome Details",
    description: "Get details for one HIP-4 outcome contract by outcome ID. Returns metadata when available plus side tokens, fills, unique wallets, notional USDH, and trading timestamps.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      outcomeId: outcomeIdSchema,
    },
    annotations,
  },
  async ({ useToonFormat, outcomeId }) =>
    toolResult(await callAPI(useToonFormat, `/hip4/outcomes/${outcomeId}`))
);

if (shouldRegister("hip4_outcome_summary")) server.registerTool(
  "hip4_outcome_summary",
  {
    title: "HIP-4 Outcome Summary",
    description: "Get the full HIP-4 summary for one outcome across both sides: fills, unique wallets, contracts, side notional, total notional, realized PnL, and trading window. Requires a Starter-or-higher key.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      outcomeId: outcomeIdSchema,
    },
    annotations,
  },
  async ({ useToonFormat, outcomeId }) =>
    toolResult(await callAPI(useToonFormat, `/hip4/outcomes/${outcomeId}/summary`))
);

if (shouldRegister("hip4_outcome_recent_trades")) server.registerTool(
  "hip4_outcome_recent_trades",
  {
    title: "HIP-4 Outcome Recent Trades",
    description: "Get recent real fills for one HIP-4 outcome. Excludes settlement, pair-redeem, and auction-phase fills. Returns trade time, wallet, side, price, size, PnL, and fee.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      outcomeId: outcomeIdSchema,
      hours: z.number().int().min(1).max(168).default(24).describe("Look-back window in hours. Default 24, max 168."),
      limit: z.number().int().min(1).max(500).default(100).describe("Maximum trades to return. Default 100, max 500."),
    },
    annotations,
  },
  async ({ useToonFormat, outcomeId, hours, limit }) =>
    toolResult(await callAPI(useToonFormat, `/hip4/outcomes/${outcomeId}/recent-trades`, {
      hours: String(hours),
      limit: String(limit),
    }))
);

if (shouldRegister("hip4_questions")) server.registerTool(
  "hip4_questions",
  {
    title: "HIP-4 Questions",
    description: "List HIP-4 question metadata from Hyperliquid outcomeMeta, including question IDs, descriptions, fallback outcomes, named outcomes, settlement metadata, and parsed expiry/threshold fields when present.",
    inputSchema: { useToonFormat: useToonFormatSchema },
    annotations,
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/hip4/questions"))
);

if (shouldRegister("hip4_recent_settlements")) server.registerTool(
  "hip4_recent_settlements",
  {
    title: "HIP-4 Recent Settlements",
    description: "List recent HIP-4 settlements. Returns outcome ID, settlement time, winning side when determinable, winner/loser fill counts, winner payouts, and loser losses.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      hours: z.number().int().min(1).max(720).default(168).describe("Look-back window in hours. Default 168, max 720."),
      limit: z.number().int().min(1).max(200).default(50).describe("Maximum settlements to return. Default 50, max 200."),
    },
    annotations,
  },
  async ({ useToonFormat, hours, limit }) =>
    toolResult(await callAPI(useToonFormat, "/hip4/settlements/recent", {
      hours: String(hours),
      limit: String(limit),
    }))
);

if (shouldRegister("hip4_daily_volume")) server.registerTool(
  "hip4_daily_volume",
  {
    title: "HIP-4 Daily Volume",
    description: "Get daily HIP-4 volume trajectory: fills, unique trades, unique wallets, contracts, and notional USDH by day. Use for outcome-market activity trends. HIP-4 fills are indexed from mainnet launch (2026-05-02; the API clamps every look-back to it) — see data_coverage for freshness.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      days: z.number().int().min(1).max(60).default(14).describe("Number of days back from today. Default 14, max 60."),
    },
    annotations,
  },
  async ({ useToonFormat, days }) =>
    toolResult(await callAPI(useToonFormat, "/hip4/daily-volume", { days: String(days) }))
);

if (shouldRegister("hip4_most_active")) server.registerTool(
  "hip4_most_active",
  {
    title: "HIP-4 Most Active Outcomes",
    description: "Return the most active HIP-4 outcomes over a recent window, ranked by fill count. Includes outcome/question metadata when available.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      hours: z.number().int().min(1).max(168).default(24).describe("Look-back window in hours. Default 24, max 168."),
      limit: z.number().int().min(1).max(50).default(10).describe("Maximum outcomes to return. Default 10, max 50."),
    },
    annotations,
  },
  async ({ useToonFormat, hours, limit }) =>
    toolResult(await callAPI(useToonFormat, "/hip4/most-active", {
      hours: String(hours),
      limit: String(limit),
    }))
);

if (shouldRegister("hip4_top_traders")) server.registerTool(
  "hip4_top_traders",
  {
    title: "HIP-4 Top Traders",
    description: "Rank top HIP-4 outcome traders by recent outcome activity. Returns address, fills, distinct outcomes, contracts, notional USDH, and realized PnL. Requires a Starter-or-higher key.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      days: z.number().int().min(1).max(30).default(7).describe("Look-back window in days. Default 7, max 30."),
      limit: z.number().int().min(1).max(100).default(25).describe("Maximum traders to return. Default 25, max 100."),
    },
    annotations,
  },
  async ({ useToonFormat, days, limit }) =>
    toolResult(await callAPI(useToonFormat, "/hip4/top-traders", {
      days: String(days),
      limit: String(limit),
    }))
);

if (shouldRegister("hip4_trader_outcomes")) server.registerTool(
    "hip4_trader_outcomes",
    {
      title: "HIP-4 Trader Outcomes",
      description: "Get one wallet's HIP-4 outcome history: outcome ID, side index, side token, fills, net shares, gross bought/sold USDH, realized PnL, and first/last traded. Requires a Starter-or-higher key. Rows are sorted by gross notional (grossBoughtUsdh + grossSoldUsdh) descending and capped at `limit` (default 50, max 200; the API route has no paging, so the cap is applied by the connector) — the response carries count (returned), totalCount, truncated and a note; raise limit or shorten days to see more. The API clamps days to 90 and to HIP-4 mainnet launch (2026-05-02) — see data_coverage.",
      inputSchema: {
        useToonFormat: useToonFormatSchema,
        address: ethAddressSchema,
        days: z.number().int().min(1).max(365).default(30).describe("Look-back window in days. Default 30; the API clamps values above 90."),
        limit: z.number().int().min(1).max(200).default(50).describe("Max outcome rows to return, largest gross notional first (default 50, max 200)."),
      },
      annotations: { ...annotations, title: "HIP-4 Trader Outcomes" },
    },
    async ({ useToonFormat, address, days, limit }) => {
      const data = await callAPI(false, `/hip4/trader/${address}/outcomes`, { days: String(days) });
      const notional = (o: any) => (Number(o?.grossBoughtUsdh) || 0) + (Number(o?.grossSoldUsdh) || 0);
      const outcomes: any[] = Array.isArray(data?.outcomes) ? [...data.outcomes] : [];
      outcomes.sort((a, b) => notional(b) - notional(a));
      const result = capArray({ ...(data ?? {}), days, outcomes }, "outcomes", limit, {
        note: (shown, total) => `Showing the top ${shown} of ${total} outcome rows by gross notional; raise limit (max 200) or shorten days to see more.`,
      });
      result.count = result.outcomes.length;
      return toolResult(useToonFormat ? toonEncode(result) : result);
    }
  );

if (shouldRegister("hip4_cross_product_overlap")) server.registerTool(
  "hip4_cross_product_overlap",
  {
    title: "HIP-4 Cross-Product Overlap",
    description: "Measure overlap between HIP-4 outcome traders and perp traders over a recent window. Returns outcome trader count, perp trader count, overlap count, and overlap percentage. Requires a Pro-or-higher key.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      days: z.number().int().min(1).max(30).default(7).describe("Look-back window in days. Default 7, max 30."),
    },
    annotations,
  },
  async ({ useToonFormat, days }) =>
    toolResult(await callAPI(useToonFormat, "/hip4/cross-product/overlap", { days: String(days) }))
);

if (shouldRegister("hip4_perp_position_context")) server.registerTool(
  "hip4_perp_position_context",
  {
    title: "HIP-4 Perp Position Context",
    description: "Join one HIP-4 outcome's current net-positive holders to currently open perp positions on the same underlying asset. Returns per-side wallet counts, open-position overlap, long/short wallet counts, net underlying position, underlying notional, aligned vs hedge counts, prediction-native counts, and top wallets with signal labels. Use when users ask whether outcome traders are already exposed to the same asset, whether a side is directional or hedged, or which large outcome holders have no underlying perp exposure. Requires a Pro-or-higher key.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      outcomeId: outcomeIdSchema,
      days: z.number().int().min(1).max(60).default(14).describe("Look-back window in days for reconstructing current outcome holders from outcome trades. Default 14, max 60."),
      limit: z.number().int().min(1).max(100).default(25).describe("Maximum top outcome wallets to return. Default 25, max 100."),
    },
    annotations,
  },
  async ({ useToonFormat, outcomeId, days, limit }) =>
    toolResult(await callAPI(useToonFormat, `/hip4/outcomes/${outcomeId}/perp-position-context`, {
      days: String(days),
      limit: String(limit),
    }))
);

// ══════════════════════════════════════════════════════════
// v0.8.0 — POSITION LIFECYCLE SUITE
// ══════════════════════════════════════════════════════════

// ─── Position Lifecycles (per wallet) ─────────────────────
if (shouldRegister("pulse_trader_lifecycles")) server.registerTool(
  "pulse_trader_lifecycles",
  {
    title: "Trader Position Lifecycles",
    description: "Get a wallet's position lifecycle history — every open->close cycle reconstructed from on-chain fills, with entry/exit VWAP, peak size, hold duration, realized PnL, fees, fill count, and liquidation status. Richer than closed-positions: each row is a full position lifecycle. 90-day rolling window (closed within the last 90 days, plus open ones; the table's first day is not exposed by the API — see data_coverage); spot (@-prefixed) excluded by default. Use for deep position-level due diligence and timing analysis.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
      coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH). For builder dex: prefix:COIN (e.g. xyz:SILVER)."),
      status: z.enum(["open", "closed", "all"]).default("closed").describe("Lifecycle status filter. Default 'closed'."),
      includeSpot: z.boolean().default(false).describe("Include spot (@-prefixed) pairs. Default false (perps only)."),
      includeCensored: z.boolean().default(false).describe("Include censored/low-quality lifecycles. Default false."),
      limit: z.number().min(1).max(200).default(50).describe("Number of lifecycles to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, address, coin, status, includeSpot, includeCensored, limit, offset }) => {
    const params: Record<string, string> = {
      status, includeSpot: String(includeSpot), includeCensored: String(includeCensored),
      limit: String(limit), offset: String(offset),
    };
    if (coin) params.coin = normalizeCoin(coin);
    return toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/lifecycles`, params));
  }
);

// ─── Lifecycle Summary (per wallet) ───────────────────────
if (shouldRegister("pulse_trader_lifecycle_summary")) server.registerTool(
  "pulse_trader_lifecycle_summary",
  {
    title: "Trader Lifecycle Summary",
    description: "Get a wallet's aggregate position-lifecycle stats: total/closed/open count, wins, losses, liquidations, win rate, total & avg PnL, biggest win/loss, avg/min/max hold duration, total fees, and unique coins traded. Same 90-day rolling window as pulse_trader_lifecycles. Use to size up a trader's position-level performance in one call.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
      coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH). For builder dex: prefix:COIN."),
      includeSpot: z.boolean().default(false).describe("Include spot (@-prefixed) pairs. Default false."),
      includeCensored: z.boolean().default(false).describe("Include censored lifecycles. Default false."),
    },
    annotations,
  },
  async ({ useToonFormat, address, coin, includeSpot, includeCensored }) => {
    const params: Record<string, string> = { includeSpot: String(includeSpot), includeCensored: String(includeCensored) };
    if (coin) params.coin = normalizeCoin(coin);
    return toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/lifecycle-summary`, params));
  }
);

// ─── Single Lifecycle by ID (+ composing fills) ───────────
if (shouldRegister("pulse_lifecycle")) server.registerTool(
    "pulse_lifecycle",
    {
      title: "Position Lifecycle Details",
      description: "Look up one position lifecycle by its numeric ID, including the trade fills that composed it (timestamp, side, size, price, PnL, fee, tx hash) joined from the trades table within the open->close window. Use after pulse_trader_lifecycles to drill into exactly how a single position was built and unwound. Fills are paged by the connector: fillsLimit (default 100, max 1000) and fillsOffset; the response carries fillCount (total fills in the lifecycle), fillsOffset, truncated and a note with the next offset. Lifecycles are a rolling 90-day window (closed within the last 90 days, plus open ones); see data_coverage.",
      inputSchema: {
        useToonFormat: useToonFormatSchema,
        id: z.number().int().min(1).describe("Lifecycle ID (from pulse_trader_lifecycles)."),
        fillsLimit: z.number().int().min(1).max(1000).default(100).describe("Max fills to return in this page (default 100, max 1000)."),
        fillsOffset: z.number().int().min(0).default(0).describe("Fills to skip, for paging (default 0)."),
      },
      annotations: { ...annotations, title: "Position Lifecycle Details" },
    },
    async ({ useToonFormat, id, fillsLimit, fillsOffset }) => {
      const data = await callAPI(false, `/pulse/lifecycle/${id}`);
      const result = capArray(data ?? {}, "fills", fillsLimit, {
        offset: fillsOffset,
        note: (shown, total) => `Showing fills ${fillsOffset + 1}-${fillsOffset + shown} of ${total}; page with fillsOffset=${fillsOffset + shown} or raise fillsLimit (max 1000).`,
      });
      const paged = { ...result, fillCount: result.totalCount, fillsOffset };
      return toolResult(useToonFormat ? toonEncode(paged) : paged);
    }
  );

// ─── Trader Demo / Quick Brief ───────────────────────────
if (shouldRegister("pulse_trader_demo")) server.registerTool(
  "pulse_trader_demo",
  {
    title: "Trader Briefing",
    description: "Get a fast wallet briefing for demos and agent triage: lifecycle summary plus recent top wins and losses. Use when the user wants a quick read on a trader before deciding whether to run deeper lifecycle, drawdown, or token-level analysis.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
    annotations,
  },
  async ({ useToonFormat, address }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/demo`))
);

// ══════════════════════════════════════════════════════════
// v0.8.0 — EXECUTION QUALITY (MAE/MFE, perp-only)
// ══════════════════════════════════════════════════════════

// ─── Wallet Drawdown Curve ────────────────────────────────
if (shouldRegister("pulse_wallet_drawdown_curve")) server.registerTool(
  "pulse_wallet_drawdown_curve",
  {
    title: "Wallet Drawdown Curve",
    description: "Get a wallet's per-position drawdown (MAE) and run-up (MFE) curve: for each closed perp lifecycle, the worst adverse price excursion and best favorable excursion vs entry, as percentages. Use to judge a trader's pain tolerance and exit timing — 'how far underwater did they go before it worked?'. Perp-only (spot has no MAE).",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
      limit: z.number().min(1).max(500).default(100).describe("Number of positions to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, address, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/wallet-drawdown-curve/${address}`, { limit: String(limit), offset: String(offset) }))
);

// ─── Max-Pain Events ──────────────────────────────────────
if (shouldRegister("pulse_max_pain_events")) server.registerTool(
  "pulse_max_pain_events",
  {
    title: "Max Pain Events",
    description: "Find the biggest survived drawdowns: closed perp positions that went deeply underwater (high MAE) yet still closed in profit. These are 'diamond hands' winners that nearly blew up first. Returns the position, entry/MAE/exit prices, realized PnL, and max drawdown %. Filtered to material positions (minPnl) with bounded drawdowns.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minDrawdownPct: z.number().min(0).default(10).describe("Minimum drawdown % (MAE vs entry) to qualify. Default 10."),
      minPnl: z.number().min(0).default(1000).describe("Minimum realized PnL in USD to filter noise. Default 1000."),
      limit: z.number().min(1).max(500).default(50).describe("Number of events to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, minDrawdownPct, minPnl, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/max-pain-events", {
      minDrawdownPct: String(minDrawdownPct), minPnl: String(minPnl),
      limit: String(limit), offset: String(offset),
    }))
);

// ─── Perfect Exits ────────────────────────────────────────
if (shouldRegister("pulse_perfect_exits")) server.registerTool(
  "pulse_perfect_exits",
  {
    title: "Perfect Exits",
    description: "Find positions that exited near the top: closed perp positions whose exit captured a high fraction of the maximum favorable excursion (MFE). These are well-timed exits. Returns the position, entry/exit/MFE prices, realized PnL, and MFE capture % (capped at 100). Filtered to material positions (minPnl) with a real favorable move.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minCapturePct: z.number().min(0).max(100).default(90).describe("Minimum MFE capture % to qualify. Default 90."),
      minPnl: z.number().min(0).default(1000).describe("Minimum realized PnL in USD to filter noise. Default 1000."),
      limit: z.number().min(1).max(500).default(50).describe("Number of exits to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, minCapturePct, minPnl, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/perfect-exits", {
      minCapturePct: String(minCapturePct), minPnl: String(minPnl),
      limit: String(limit), offset: String(offset),
    }))
);

// ─── Backstop Events (catastrophic liquidations) ──────────
if (shouldRegister("pulse_backstop_events")) server.registerTool(
  "pulse_backstop_events",
  {
    title: "Backstop Liquidation Events",
    description: "Get the most catastrophic individual liquidations across Hyperliquid — large forced closes ranked by loss. Returns wallet, coin, side, entry VWAP, peak size, realized PnL, penalty fee, liquidation method, and liquidator address. Use for 'who got wrecked hardest?' and post-mortem analysis. Default returns $10k+ losses.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      method: z.string().optional().describe("Optional liquidation method filter (e.g. 'market', 'backstop')."),
      maxRealizedPnl: z.number().max(0).default(-10000).describe("Only return losses at least this large (negative). Default -10000 = $10k+ losses."),
      limit: z.number().min(1).max(500).default(50).describe("Number of events to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, method, maxRealizedPnl, limit, offset }) => {
    const params: Record<string, string> = { maxRealizedPnl: String(maxRealizedPnl), limit: String(limit), offset: String(offset) };
    if (method) params.method = method;
    return toolResult(await callAPI(useToonFormat, "/pulse/backstop-events", params));
  }
);

// ══════════════════════════════════════════════════════════
// v0.8.0 — TRADER ARCHETYPES (90-day lifecycle discovery)
// ══════════════════════════════════════════════════════════

// ─── Survivors ────────────────────────────────────────────
if (shouldRegister("pulse_survivors")) server.registerTool(
  "pulse_survivors",
  {
    title: "Survivors (Comeback Traders)",
    description: "Find comeback traders: wallets whose cumulative realized PnL hit a deep trough and then climbed back to positive. Returns wallet, trough depth, current cumulative PnL, and recovery amount. Use for 'who blew up but recovered?'. Realized-PnL drawdown only.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      maxTrough: z.number().max(0).default(-10000).describe("Trough must be at least this deep (negative). Default -10000."),
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, maxTrough, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/survivors", { maxTrough: String(maxTrough), limit: String(limit), offset: String(offset) }))
);

// ─── Anti-Survivors ───────────────────────────────────────
if (shouldRegister("pulse_anti_survivors")) server.registerTool(
  "pulse_anti_survivors",
  {
    title: "Anti-Survivors (Unrecovered Blow-Ups)",
    description: "Find wallets that blew up and never recovered — cumulative realized PnL hit a deep trough and is still underwater. Returns wallet, trough depth, and current cumulative PnL. Use for 'who got rekt and stayed rekt?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      maxTrough: z.number().max(0).default(-10000).describe("Trough must be at least this deep (negative). Default -10000."),
      stillUnderwater: z.number().max(0).default(0).describe("Current cumulative PnL must be at or below this (negative or 0). Default 0."),
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, maxTrough, stillUnderwater, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/anti-survivors", {
      maxTrough: String(maxTrough), stillUnderwater: String(stillUnderwater),
      limit: String(limit), offset: String(offset),
    }))
);

// ─── Persistent Winners ───────────────────────────────────
if (shouldRegister("pulse_persistent_winners")) server.registerTool(
  "pulse_persistent_winners",
  {
    title: "Persistent Winners",
    description: "Find consistently profitable wallets: traders that were profitable in N+ distinct calendar months of the 90-day window. Returns wallet, profitable-month count, total PnL, and best-month PnL. Use for 'who is consistently good, not just lucky once?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minMonths: z.number().int().min(1).max(3).default(2).describe("Minimum number of profitable months (1-3). Default 2."),
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, minMonths, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/persistent-winners", { minMonths: String(minMonths), limit: String(limit), offset: String(offset) }))
);

// ─── Capital Titans ───────────────────────────────────────
if (shouldRegister("pulse_capital_titans")) server.registerTool(
  "pulse_capital_titans",
  {
    title: "Capital Titans",
    description: "Find the most fee-efficient traders: highest realized PnL per dollar of fees paid. Returns wallet, total PnL, total fees, PnL-per-fee-dollar ratio, and lifecycle count. Use for 'who extracts the most edge per dollar spent on fees?'. minPnl/minFees gates filter out noise.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minPnl: z.number().min(0).default(10000).describe("Minimum total PnL in USD. Default 10000."),
      minFees: z.number().min(0).default(100).describe("Minimum total fees in USD. Default 100."),
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, minPnl, minFees, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/capital-titans", {
      minPnl: String(minPnl), minFees: String(minFees), limit: String(limit), offset: String(offset),
    }))
);

// ─── One-Month Wonders ────────────────────────────────────
if (shouldRegister("pulse_one_month_wonders")) server.registerTool(
  "pulse_one_month_wonders",
  {
    title: "One-Month Wonders",
    description: "Find flash-in-the-pan traders: big winners in a single month who then gave it back. Returns wallet, best-month PnL, total PnL, giveback amount, active months, and profitable months. Use for 'who had one great month then faded?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minBestMonth: z.number().min(0).default(50000).describe("Minimum best-month PnL in USD to qualify. Default 50000."),
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, minBestMonth, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/one-month-wonders", { minBestMonth: String(minBestMonth), limit: String(limit), offset: String(offset) }))
);

// ─── Newcomer Whales ──────────────────────────────────────
if (shouldRegister("pulse_newcomer_whales")) server.registerTool(
  "pulse_newcomer_whales",
  {
    title: "Newcomer Whales",
    description: "Find new big players: wallets whose first-ever lifecycle is recent but who have already moved large notional. Returns wallet, first-seen date, gross notional, total PnL, and lifecycle count. Use for 'who just showed up and is already trading big?'. Lower minNotional if no rows return at default.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      newcomerDays: z.number().int().min(1).max(90).default(30).describe("How recent the first lifecycle must be, in days. Default 30."),
      minNotional: z.number().min(0).default(100000).describe("Minimum gross notional in USD. Default 100000."),
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, newcomerDays, minNotional, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/newcomer-whales", {
      newcomerDays: String(newcomerDays), minNotional: String(minNotional),
      limit: String(limit), offset: String(offset),
    }))
);

// ─── Coin Kings ───────────────────────────────────────────
if (shouldRegister("pulse_coin_kings")) server.registerTool(
  "pulse_coin_kings",
  {
    title: "Coin Kings",
    description: "Find the top earner(s) per coin within the window. perCoinRank=1 returns only the #1 earner ('king') of each coin; higher values return the top-N per coin. Returns coin, wallet, coin PnL, fees, lifecycle count, and rank. Use for 'who owns BTC?' / 'who is the best trader of each market?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      perCoinRank: z.number().int().min(1).max(10).default(1).describe("Top-N earners per coin to return. 1 = the king only. Default 1."),
      limit: z.number().min(1).max(500).default(50).describe("Number of rows to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, perCoinRank, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/coin-kings", { perCoinRank: String(perCoinRank), limit: String(limit), offset: String(offset) }))
);

// ─── Top Liquidators ──────────────────────────────────────
if (shouldRegister("pulse_top_liquidators")) server.registerTool(
  "pulse_top_liquidators",
  {
    title: "Top Liquidators",
    description: "Find wallets that profit by liquidating others' forced closes. Returns liquidator wallet, liquidations executed, distinct victims, distinct coins, total penalty collected, and total liquidation PnL. Use for 'who is the biggest backstop/liquidation player?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/top-liquidators", { limit: String(limit), offset: String(offset) }))
);

// ─── Lethal Coins ─────────────────────────────────────────
if (shouldRegister("pulse_lethal_coins")) server.registerTool(
  "pulse_lethal_coins",
  {
    title: "Lethal Coins",
    description: "Find the most dangerous markets: coins with the highest per-lifecycle liquidation rate. Returns coin, total lifecycles, liquidations, liquidation %, and total penalty. Use for 'which coins blow people up most often?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minLifecycles: z.number().int().min(1).default(100).describe("Minimum lifecycles for a coin to qualify (filters thin markets). Default 100."),
      limit: z.number().min(1).max(500).default(50).describe("Number of coins to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, minLifecycles, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/lethal-coins", { minLifecycles: String(minLifecycles), limit: String(limit), offset: String(offset) }))
);

// ══════════════════════════════════════════════════════════
// v0.8.0 — MARKET STRUCTURE (aggregate lifecycle analytics)
// ══════════════════════════════════════════════════════════

// ─── Coin Alpha Map ───────────────────────────────────────
if (shouldRegister("pulse_coin_alpha_map")) server.registerTool(
  "pulse_coin_alpha_map",
  {
    title: "Coin Alpha Map",
    description: "Per-coin profit pools split into winners vs losers vs net. Returns coin, lifecycles, unique wallets, winners pool, losers pool, net PnL, winning/losing lifecycle counts, and total fees. Use for 'which coins are net wealth creators vs destroyers?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      limit: z.number().min(1).max(500).default(100).describe("Number of coins to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/coin-alpha-map", { limit: String(limit), offset: String(offset) }))
);

// ─── Hour Profitability ───────────────────────────────────
if (shouldRegister("pulse_hour_profitability")) server.registerTool(
  "pulse_hour_profitability",
  {
    title: "Hourly Profitability",
    description: "Global PnL heatmap by UTC hour of position close. Returns, for each of the 24 hours, lifecycle count, total PnL, avg PnL, wins, and losses. Use for 'what time of day is most profitable to close?' / session-bias analysis.",
    inputSchema: { useToonFormat: useToonFormatSchema },
    annotations,
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/pulse/hour-profitability"))
);

// ─── Market Concentration ─────────────────────────────────
if (shouldRegister("pulse_market_concentration")) server.registerTool(
  "pulse_market_concentration",
  {
    title: "Market Concentration",
    description: "Power-law shape of trader profits: percentile bands (top 0.1%, 1%, 10%, ...) and each band's share of total profits. Returns band label, wallet count, band PnL, % of total profits, and rank range. Use for 'how concentrated is alpha — do the top 1% take everything?'.",
    inputSchema: { useToonFormat: useToonFormatSchema },
    annotations,
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/pulse/market-concentration"))
);

// ─── Style Distribution ───────────────────────────────────
if (shouldRegister("pulse_style_distribution")) server.registerTool(
  "pulse_style_distribution",
  {
    title: "Trading Style Distribution",
    description: "HFT vs swing vs holder PnL split, bucketed by lifecycle hold duration. Returns, per style bucket, lifecycle count, unique wallets, total PnL, avg PnL, and total fees. Use for 'do scalpers or swing traders make more money on Hyperliquid?'.",
    inputSchema: { useToonFormat: useToonFormatSchema },
    annotations,
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/pulse/style-distribution"))
);

// ─── Compare Wallets ──────────────────────────────────────
if (shouldRegister("pulse_compare")) server.registerTool(
  "pulse_compare",
  {
    title: "Compare Traders",
    description: "Side-by-side comparison of 2-5 wallets via their lifecycle summaries — win rate, total/avg PnL, hold duration, biggest win/loss, fees, liquidations. Use for head-to-head trader comparison ('who is the better trader, A or B?').",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      wallets: z.array(ethAddressSchema).min(2).max(5).describe("2 to 5 wallet addresses to compare."),
    },
    annotations,
  },
  async ({ useToonFormat, wallets }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/compare", { wallets: wallets.join(",") }))
);

// ══════════════════════════════════════════════════════════
// v0.8.0 — REFRESHED COHORTS (30-day rolling tier label)
// ══════════════════════════════════════════════════════════

// ─── Recent-Cohort Positions ──────────────────────────────
if (shouldRegister("pulse_cohort_recent_positions")) server.registerTool(
  "pulse_cohort_recent_positions",
  {
    title: "Recent-Tier Cohort Positions",
    description: "Live positions held by a cohort defined by its LAST-30-DAY tier (pnl_tier_recent / size_tier_recent), not lifetime tier. Surfaces what currently-printing wallets are positioned for right now — catches regime changes the all-time pulse_cohort_positions misses.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers."),
      tier: tierSchema,
      limit: z.number().min(1).max(500).default(50).describe("Number of positions to return."),
    },
    annotations,
  },
  async ({ useToonFormat, tierType, tier, limit }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/cohorts-recent/${tierType}/${normalizeTier(tier)}/positions`, { limit: String(limit) }))
);

// ─── Recent-Cohort Trades ─────────────────────────────────
if (shouldRegister("pulse_cohort_recent_trades")) server.registerTool(
  "pulse_cohort_recent_trades",
  {
    title: "Recent-Tier Cohort Trades",
    description: "Recent trades by a cohort defined by its LAST-30-DAY tier (pnl_tier_recent / size_tier_recent). Shows what currently-printing wallets have been trading in the window — real-time alpha weighted to who is hot NOW, not all-time.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers."),
      tier: tierSchema,
      since: sinceSchema.default("1h"),
      limit: z.number().min(1).max(500).default(50).describe("Number of trades to return."),
    },
    annotations,
  },
  async ({ useToonFormat, tierType, tier, since, limit }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/cohorts-recent/${tierType}/${normalizeTier(tier)}/trades`, { since, limit: String(limit) }))
);

// ─── Recent-Cohort Lifecycle Stats ────────────────────────
if (shouldRegister("pulse_cohort_recent_lifecycle_stats")) server.registerTool(
  "pulse_cohort_recent_lifecycle_stats",
  {
    title: "Recent-Tier Cohort Lifecycle Stats",
    description: "Per-wallet lifecycle stats for a cohort defined by its LAST-30-DAY tier: lifecycles, wins, losses, liquidations, total PnL, fees, avg hold, biggest win/loss, plus the wallet's recent pnl/size tier labels. Use for position-level analysis of who is currently printing.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers."),
      tier: tierSchema,
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, tierType, tier, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/cohorts-recent/${tierType}/${normalizeTier(tier)}/lifecycle-stats`, { limit: String(limit), offset: String(offset) }))
);

// ─── Recent-Cohort Top Positions ──────────────────────────
if (shouldRegister("pulse_cohort_recent_top_positions")) server.registerTool(
  "pulse_cohort_recent_top_positions",
  {
    title: "Recent-Tier Cohort Top Positions",
    description: "Top closed position lifecycles by a cohort defined by its LAST-30-DAY tier: the biggest/most notable open->close cycles from currently-printing wallets, with entry/exit VWAP, hold duration, realized PnL, fees, and liquidation flag.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers."),
      tier: tierSchema,
      limit: z.number().min(1).max(500).default(50).describe("Number of positions to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, tierType, tier, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/cohorts-recent/${tierType}/${normalizeTier(tier)}/top-positions`, { limit: String(limit), offset: String(offset) }))
);

// ─── Recent-Cohort Alpha Concentration ────────────────────
if (shouldRegister("pulse_cohort_recent_alpha_concentration")) server.registerTool(
  "pulse_cohort_recent_alpha_concentration",
  {
    title: "Recent-Tier Cohort Alpha Concentration",
    description: "How concentrated profit is WITHIN a recent-tier cohort: percentile bands of the cohort's wallets and each band's share of the cohort's total PnL. Returns band, wallet count, band PnL, % of tier PnL, and tier total wallets. Use for 'within the hot apex (Apex) cohort, do a few wallets carry everything?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers."),
      tier: tierSchema,
    },
    annotations,
  },
  async ({ useToonFormat, tierType, tier }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/cohorts-recent/${tierType}/${normalizeTier(tier)}/alpha-concentration`))
);

// ─── My Plan (tier / limits introspection) [FREE] ─────────
if (shouldRegister("pulse_my_plan")) server.registerTool(
  "pulse_my_plan",
  {
    title: "My Plan",
    description: "Show the current API key's plan: tier, rate limits (per-minute/daily/monthly), and every tier's limits. Use when the user asks what plan they are on or after a tier/rate-limit rejection. Live remaining-quota counts also arrive on every API response as X-RateLimit-* headers.",
    inputSchema: { useToonFormat: useToonFormatSchema },
    annotations,
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/plan"))
);

// ─── Entity Profile (owner-level view) [PRO] ──────────────
if (shouldRegister("pulse_entity_profile")) server.registerTool(
  "pulse_entity_profile",
  {
    title: "Entity Profile",
    description: "Resolve ANY wallet to its owner entity: the master account, every named sub-account (and weaker 'linked' wallets), each member's open book, the COMBINED open positions across all of them, and a 'verified vs chain at block N' stamp. Answers 'who owns this wallet?' and 'what is this trader's real total book across all their accounts?' — sub-accounts trade independently on Hyperliquid, so per-wallet views undercount every multi-account trader. Note: vaults appear as named sub-accounts of their creator. Requires Pro tier.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe("Any wallet address — master, sub-account, or unknown; it resolves to the owning entity either way."),
    },
    annotations,
  },
  async ({ useToonFormat, address }) =>
    toolResult(await callAPI(useToonFormat, `/entity/${address}`))
);

// ─── Entity Leaderboard (deduped by owner) [PRO] ──────────
if (shouldRegister("pulse_entity_leaderboard")) server.registerTool(
  "pulse_entity_leaderboard",
  {
    title: "Entity Leaderboard",
    description: "Top entities (owners, NOT wallets) ranked by combined gross open entry notional across all their sub-accounts. This is the deduplicated view a wallet leaderboard cannot give: a fund running 35 sub-accounts appears as ONE entity with its true combined book. System/protocol accounts are excluded. Each row: entity master address, wallet count, open position count, gross entry notional. Requires Pro tier.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      limit: z.number().int().min(1).max(100).default(25).describe("Rows to return (max 100)."),
      offset: z.number().int().min(0).max(199).default(0).describe("Pagination offset (window capped at 200)."),
    },
    annotations,
  },
  async ({ useToonFormat, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/entities/leaderboard", { limit: String(limit), offset: String(offset) }))
);

// ─── Exchange Volume by Dex [FREE] ────────────────────────
if (shouldRegister("pulse_exchange_volume")) server.registerTool(
  "pulse_exchange_volume",
  {
    title: "Exchange Volume",
    description: "24h trading volume for the WHOLE exchange, split by dex: native Hyperliquid ('hl') plus every builder dex (xyz, hyna, ...), with per-dex match counts and distinct traders. Use for 'how much volume does Hyperliquid do?' — and note builder dexes are ~43% of it. Aggregates cached up to 120s.",
    inputSchema: { useToonFormat: useToonFormatSchema },
    annotations,
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/exchange/volume"))
);

// ─── Exchange Open Interest by Dex [FREE] ─────────────────
if (shouldRegister("pulse_exchange_oi")) server.registerTool(
  "pulse_exchange_oi",
  {
    title: "Exchange Open Interest",
    description: "Current open interest for the whole exchange by dex, with long/short notional split. Gross both-sides convention (matches HyperTracker/hl.eco headlines; halve for one-sided OI). Use for 'what's the OI on Hyperliquid / on xyz?', market-size questions, and long-vs-short balance checks. Cached up to 120s.",
    inputSchema: { useToonFormat: useToonFormatSchema },
    annotations,
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/exchange/oi"))
);

// ─── Active Traders 24h [FREE] ────────────────────────────
if (shouldRegister("pulse_active_traders")) server.registerTool(
  "pulse_active_traders",
  {
    title: "Active Traders",
    description: "Distinct wallets that filled at least one perp trade in the last 24h, exchange-wide, plus total match count. The 'daily active traders' headline number. Cached up to 120s.",
    inputSchema: { useToonFormat: useToonFormatSchema },
    annotations,
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/exchange/active-traders"))
);

// ─── Exchange Positions & 24h Flow [FREE] ─────────────────
if (shouldRegister("pulse_exchange_positions")) server.registerTool(
  "pulse_exchange_positions",
  {
    title: "Exchange Positions",
    description: "Exchange-wide position vitals by dex: open positions and wallets holding them, plus the 24h flow — positions closed, liquidations, and TOTAL REALIZED PNL across the whole exchange (gross profits/losses split). Answers 'how many positions are open on Hyperliquid?' and 'did traders collectively make or lose money today?' Cached up to 120s.",
    inputSchema: { useToonFormat: useToonFormatSchema },
    annotations,
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/exchange/positions"))
);

// ─── Daily PnL Leaders [STARTER] ──────────────────────────
if (shouldRegister("pulse_pnl_leaders")) server.registerTool(
  "pulse_pnl_leaders",
  {
    title: "PnL Leaders",
    description: "Today's biggest realized winners AND losers: wallets ranked by summed realized PnL on positions CLOSED in the last 24h, with position counts and liquidation flags. Realized-on-the-day — different from the portfolio leaderboards (which rank account value over longer windows). Use for 'who made/lost the most money today?'. Requires Starter tier or higher.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      limit: z.number().int().min(1).max(100).default(20).describe("Winners and losers each capped at this count."),
    },
    annotations,
  },
  async ({ useToonFormat, limit }) => toolResult(await callAPI(useToonFormat, "/exchange/pnl-leaders", { limit: String(limit) }))
);


// ══════════════════════════════════════════════════════════
// BUILDER ANALYTICS (new in 0.11) — 8 tools
// ══════════════════════════════════════════════════════════

// ─── Builder Revenue Leaderboard [STARTER] ────────────────
if (shouldRegister("builder_leaderboard")) server.registerTool(
  "builder_leaderboard",
  {
    title: "Builder Leaderboard",
    description: "Builders (HIP-3 dexes, frontends, bots) ranked by exact revenue from Hyperliquid's on-chain cumulative builder-fee ledger over the requested period. Each row carries join-attributed fill volume, distinct users, and fill counts — plus the same metrics for the immediately preceding window for deltas — the builder's most common requested fee rate over the last 7d of orders (feeTenthsBp, tenths of a basis point), and builderName from a curated registry (omitted when unknown). Attributed metrics slightly undercount versus ledger revenue because trigger-order fills (stop/TP) are not yet attributed — see the response's dataNotes; the 'verified' stamp gives the ledger block this data was reconciled against. Use for 'which builders earn the most?' or 'is builder X growing?'. Ledger history begins at the fee ledger's first on-chain entry: dataNotes states that date whenever a window predates it, and data_coverage (builder_ledger) reports it. Requires Starter tier or higher.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      period: builderPeriodSchema.default("week").describe("Ranking window: day, week, or month. Prev-window deltas cover the same-length window immediately before."),
      limit: z.number().int().min(1).max(100).default(50).describe("Rows to return (max 100)."),
      offset: z.number().int().min(0).max(1000).default(0).describe("Pagination offset (window capped at 1000)."),
    },
    annotations,
  },
  async ({ useToonFormat, period, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/builders/leaderboard", { period, limit: String(limit), offset: String(offset) }))
);

// ─── Builder Profile [STARTER] ────────────────────────────
if (shouldRegister("builder_profile")) server.registerTool(
  "builder_profile",
  {
    title: "Builder Profile",
    description: "Single-builder overview for a 0x-hex builder address: exact revenue from Hyperliquid's on-chain builder-fee ledger over the period (day/week/month), first/last fee accrual timestamps, distinct fee tokens, most common requested fee rate over the last 7d of orders (feeTenthsBp, tenths of a basis point), a daily attributed series (fees/volume/users/fills) with the biggest day highlighted, top coins by attributed volume, and how many of the period's attributed wallets are all-time profitable. Attributed metrics slightly undercount versus ledger revenue (trigger-order stop/TP fills not yet attributed — see the response's dataNotes); builderName comes from a curated registry, omitted when unknown. Returns 404 for addresses with no revenue in the fee ledger. Use for 'how is builder X doing?' or 'what do people trade on frontend Y?'. Requires Starter tier or higher. Availability: typically 10-25 seconds on large builders; the coin split (topCoins) may come back null with an explanation in dataNotes when the live pass exceeds its budget. Ledger history begins at the fee ledger's first on-chain entry (see data_coverage, builder_ledger).",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      builder: builderAddressSchema,
      period: builderPeriodSchema.default("month").describe("Aggregation window: day, week, or month."),
      topCoins: z.number().int().min(1).max(50).default(10).describe("How many top coins (by attributed volume) to return (max 50)."),
    },
    annotations,
  },
  async ({ useToonFormat, builder, period, topCoins }) =>
    toolResult(await callAPI(useToonFormat, `/builders/${builder}/profile`, { period, topCoins: String(topCoins) }))
);

// ─── Builder's Attributed Traders [PRO] ───────────────────
if (shouldRegister("builder_traders")) server.registerTool(
  "builder_traders",
  {
    title: "Builder Traders",
    description: "Wallets that traded via a builder (0x-hex address) in the window, sortable by builder fees paid, volume, or realized PnL. Each row: wallet, realized PnL on its attributed fills, builderFeesUsd, volumeUsd, fills, latest equity (0 if untracked), and the wallet's ALL-TIME exchange-wide cohort tiers (pnlTier/sizeTier, emitted as legacy slugs like smart_money/whale; null if untracked) — lifetime labels, unlike the 30d-rolling tiers the pulse cohort tools classify by, so memberships can differ. Attributed fills slightly undercount versus ledger revenue (trigger-order stop/TP fills not yet attributed — see the response's dataNotes). Use for 'who are builder X's biggest fee payers?' or 'are smart-money wallets using this frontend?'. Requires Pro tier. Availability: this endpoint computes per builder on request and can exceed its 30-second budget on large builders; if it times out, retry once a minute later.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      builder: builderAddressSchema,
      period: builderPeriodSchema.default("week").describe("Attribution window: day, week, or month."),
      sort: z.enum(["builderFee", "volume", "pnl"]).default("builderFee").describe("Ranking: builderFee (fees paid to the builder), volume, or pnl."),
      limit: z.number().int().min(1).max(500).default(50).describe("Rows to return (max 500)."),
      offset: z.number().int().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, builder, period, sort, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, `/builders/${builder}/traders`, { period, sort, limit: String(limit), offset: String(offset) }))
);

// ─── Builder Attributed Fills [PRO] ───────────────────────
if (shouldRegister("builder_fills")) server.registerTool(
  "builder_fills",
  {
    title: "Builder Fills",
    description: "Individual fills attributed to a builder (0x-hex address) within a lookback window (since, e.g. '6h' or '7d', clamped to 90d), optionally filtered to one exact coin (BTC, xyz:GOLD, @123 spot, #10010 HIP-4 outcome) or one wallet. Each fill: time, wallet, coin, marketType (perp|spot|hip4), side (BUY|SELL), price, size, USD volume, realized PnL, builderFeeUsd, tid, and the order id it attributes to (null if untracked). Trigger-order (stop/TP) fills are not yet attributed, so this feed slightly undercounts versus ledger revenue — see the response's dataNotes. Use for 'show me the flow going through frontend X right now' or auditing one wallet's activity via a builder. Requires Pro tier.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      builder: builderAddressSchema,
      since: sinceSchema.default("24h").describe("Lookback window like '30m', '6h', '7d' (clamped to 90d)."),
      coin: z.string().optional().describe("Optional exact coin filter: BTC, xyz:GOLD, @123 (spot), #10010 (HIP-4)."),
      address: ethAddressSchema.optional().describe("Optional wallet filter (0x-hex address)."),
      limit: z.number().int().min(1).max(500).default(50).describe("Rows to return (max 500)."),
      offset: z.number().int().min(0).default(0).describe("Pagination offset."),
    },
    annotations,
  },
  async ({ useToonFormat, builder, since, coin, address, limit, offset }) => {
    const params: Record<string, string> = { since, limit: String(limit), offset: String(offset) };
    if (coin) params.coin = normalizeCoin(coin);
    if (address) params.address = address;
    return toolResult(await callAPI(useToonFormat, `/builders/${builder}/fills`, params));
  }
);

// ─── Builder User Cohort Composition [PRO] ────────────────
if (shouldRegister("builder_cohorts")) server.registerTool(
  "builder_cohorts",
  {
    title: "Builder Cohorts",
    description: "Cohort composition of a builder's attributed users over the period (day/week/month): split by all-time exchange-wide profitability tier (pnlTiers) and size tier (sizeTiers), largest cohort first, each with users, share of totalUsers, builder fees paid, attributed volume, realized PnL, and fills. Tiers are LIFETIME labels emitted as legacy slugs (money_printer..giga_rekt / leviathan..shrimp) — not the 30d-rolling tiers the pulse cohort tools use — and wallets missing from the rollup appear under 'untracked' so per-tier user counts always sum to totalUsers. Attribution slightly undercounts versus ledger revenue (trigger-order fills — see the response's dataNotes). Use for 'is builder X's user base smart money or exit liquidity?' or 'do whales or shrimp pay most of its fees?'. Requires Pro tier. Availability: computed per builder on request and can exceed its 30-second budget on large builders; if it times out, retry once a minute later.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      builder: builderAddressSchema,
      period: builderPeriodSchema.default("week").describe("Attribution window: day, week, or month."),
    },
    annotations,
  },
  async ({ useToonFormat, builder, period }) =>
    toolResult(await callAPI(useToonFormat, `/builders/${builder}/cohorts`, { period }))
);

// ─── Builder Monthly Retention Cohorts [PRO] ──────────────
if (shouldRegister("builder_retention")) server.registerTool(
  "builder_retention",
  {
    title: "Builder Retention",
    description: "Monthly retention matrix for a builder's users (takes only the 0x-hex builder address — no other parameters): wallets are cohorted by the calendar month (YYYY-MM, UTC) of their first builder-fee order via this builder, and each cohort's activeWallets[k] counts wallets still active k months later, where 'active' = placed at least one builder-fee order that month (index 0 = the cohort month itself = newWallets). Covers the last 12 calendar months, oldest cohort first. Measured on the ORDERS plane — the order need not fill — so counts can exceed the attributed-fill user counts on builder_cohorts/builder_overlap; see the response's dataNotes for the attribution caveat. Use for 'does builder X retain users month over month, or churn them?'. Requires Pro tier.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      builder: builderAddressSchema,
    },
    annotations,
  },
  async ({ useToonFormat, builder }) =>
    toolResult(await callAPI(useToonFormat, `/builders/${builder}/retention`))
);

// ─── Builder Audience Overlap [PRO] ───────────────────────
if (shouldRegister("builder_overlap")) server.registerTool(
  "builder_overlap",
  {
    title: "Builder Overlap",
    description: "The top 10 OTHER builders this builder's active users also traded through in the period (day/week/month), ranked by shared users — i.e. which other frontends/bots/dexes this builder's audience also uses. Returns activeUsers (the share denominator: distinct wallets with attributed fills via this builder) and per row: the other builder's 0x address, curated builderName (omitted when unknown), sharedUsers, share of this builder's active users, and feesUsd those shared users paid to the OTHER builder in the period. Based on attributed fills, which slightly undercount (trigger-order fills — see the response's dataNotes). Use for 'who is builder X's closest competitor?' or 'where else does its audience trade?'. Requires Pro tier.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      builder: builderAddressSchema,
      period: builderPeriodSchema.default("week").describe("Attribution window: day, week, or month."),
    },
    annotations,
  },
  async ({ useToonFormat, builder, period }) =>
    toolResult(await callAPI(useToonFormat, `/builders/${builder}/overlap`, { period }))
);

// ─── Builders a Wallet Trades Through [STARTER] ───────────
if (shouldRegister("trader_builders")) server.registerTool(
  "trader_builders",
  {
    title: "Trader Builders",
    description: "Every builder (frontend, bot, HIP-3 dex) a wallet (0x-hex address) had attributed fills through within a lookback window (since, default '30d', clamped to 90d), ordered by builder fees paid descending. Each row: builder address, curated builderName (omitted when unknown), fills, builderFeesUsd, volumeUsd, and first/last attributed-fill timestamps within the window. Attribution slightly undercounts (trigger-order stop/TP fills not yet attributed — see the response's dataNotes). The inverse of builder_traders: wallet → builders instead of builder → wallets. Use for 'which apps does this trader use?' or 'how much has wallet X paid frontend Y in fees?'. Requires Starter tier or higher.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
      since: sinceSchema.default("30d").describe("Lookback window like '30m', '6h', '30d' (clamped to 90d)."),
    },
    annotations,
  },
  async ({ useToonFormat, address, since }) =>
    toolResult(await callAPI(useToonFormat, `/trader/${address}/builders`, { since }))
);

// ─── Builder User Journey Economics [PRO] ──────────────────
if (shouldRegister("builder_journey")) server.registerTool(
  "builder_journey",
  {
    title: "Builder Journey",
    description: "How fast and how unevenly a builder monetizes the wallets it acquires (takes only the 0x-hex builder address — no other parameters): users and minFills, avgRevenueUsd and medianRevenueUsd of lifetime attributed builder fees per qualifying wallet, concentration (avg/median — 1 = evenly spread, higher = whale-skewed, 0 when the median is 0), daysToPeak, daysToHalfRevenue and daysToThreeQuartersRevenue as {avgDays, medianDays} measured from each wallet's first attributed fill to its single highest-revenue day and to 50% and 75% of its lifetime fees, and peakDayDistribution bucketing those wallets into under7d, from7To30d and over30d. NOT the lifetime user base builder_lifecycle covers: the universe is the TRAILING-YEAR acquisition cohort — wallets whose first builder-fee order via this builder fell within the last 365 days, with at least minFills (fixed at 3) lifetime attributed fills — computed per wallet then aggregated, so young cohorts' truncated series bias the day counts low; see the response's dataNotes. Use for 'how fast and how unevenly does builder X monetize a new user?'. Requires Pro tier.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      builder: builderAddressSchema,
    },
    annotations,
  },
  async ({ useToonFormat, builder }) =>
    toolResult(await callAPI(useToonFormat, `/builders/${builder}/journey`, undefined, SLOW_BUILDER_CALL))
);

// ─── Builder User Lifecycle [PRO] ──────────────────────────
if (shouldRegister("builder_lifecycle")) server.registerTool(
  "builder_lifecycle",
  {
    title: "Builder Lifecycle",
    description: "Where every wallet that ever traded via this builder stands today (takes only the 0x-hex builder address — no other parameters): totalUsers split into five MUTUALLY EXCLUSIVE statuses that sum back to it, each {users, share} — active (attributed fill via THIS builder within 7d), cooling (within 30d but not 7d), switched (no fill here in 30d but at least one via a DIFFERENT builder in that window, detectable only with all-builder attribution), dormant (no fill via any builder in 30d, last fill here within 90d) and movedOn (no fill anywhere in 30d and none here in 90d) — plus trueRetention ((active+cooling)/totalUsers), churn ((dormant+movedOn)/totalUsers) and competitiveLoss (switched/totalUsers), which sum to 1, and competitiveLossFeesUsd, the builder fees those switched wallets paid to OTHER builders in the last 30d. LIFETIME universe on the ORDERS plane — every wallet that ever placed a builder-fee order via this builder, including ones whose orders never filled (they land in movedOn, or in switched if they filled via a DIFFERENT builder in the last 30d) — with only the status test reading recent attributed fills, so this is one snapshot of the whole historical user base rather than builder_retention's per-cohort monthly grid; see the response's dataNotes. Use for 'how many of builder X's users are still active, and how many did a rival take?'. Requires Pro tier. Availability: typically 1-15 seconds; can exceed its 30-second budget on the largest builders, in which case retry once a minute later.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      builder: builderAddressSchema,
    },
    annotations,
  },
  async ({ useToonFormat, builder }) =>
    toolResult(await callAPI(useToonFormat, `/builders/${builder}/lifecycle`))
);

// ─── Builder Activity Heatmap [PRO] ────────────────────────
if (shouldRegister("builder_heatmap")) server.registerTool(
  "builder_heatmap",
  {
    title: "Builder Heatmap",
    description: "When a builder's attributed flow actually trades (takes only the 0x-hex builder address — no other parameters): a 7x24 weekday-by-hour grid as days[], always 7 entries Sunday first with weekday 0 = Sunday through 6 = Saturday, each carrying hours[], always 24 entries with hour 0 first, and every cell reporting hour, volumeUsd, feesUsd and fills totalled over the whole window; zero-activity cells are zero-valued, never omitted. No period parameter and no per-week averaging — windowDays is fixed at 84, the trailing 12 weeks, so every weekday is sampled exactly 12 times — and both weekday and hour are UTC, never local time. Attributed fills slightly undercount versus ledger revenue (trigger-order stop/TP fills not yet attributed — see the response's dataNotes). Use for 'what hours does builder X's volume peak, is it bot-like around the clock or human trading hours, and when is it safe to ship?'. Requires Pro tier. The first call for a builder can take up to ~90 seconds while the API computes it; the result is then cached, so repeat the call if it times out.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      builder: builderAddressSchema,
    },
    annotations,
  },
  async ({ useToonFormat, builder }) =>
    toolResult(await callAPI(useToonFormat, `/builders/${builder}/heatmap`, undefined, SLOW_BUILDER_CALL))
);

// ─── Builder Order Intent [PRO] ────────────────────────────
if (shouldRegister("builder_orders")) server.registerTool(
  "builder_orders",
  {
    title: "Builder Orders",
    description: "What this builder's users INTEND at placement time, before anything fills (0x-hex builder address plus a day/week/month period): totalIntents — non-trigger order intents plus still-PENDING stop/TP placements, the actions denominator — an actions[] mix of {actionType, orders, share}, largest first except the 'trigger' pseudo-type which is appended last, over 'order' (plain placements), 'batchModify' (modify intents on an existing order) and 'trigger' (pending stop/TP placements), a tifs[] time-in-force mix of {tif, orders, share} over non-trigger intents ('unknown' covers market orders and older rows), reduceOnlyShare, a trigger breakdown (total, takeProfit, stopLoss, triggerMarket, triggerLimit, positionTpsl, standaloneTpsl, resolved, pending) and fillConversion {orders, filledOrders, share} — the share of non-trigger intents whose own oid took at least one attributed fill. Measured on the PLACEMENT plane, not the fill plane behind builder_fills and builder_traders, so orders that never filled still count; trigger placement history begins 2026-03-24, and a resolved placement is excluded from totalIntents and the 'trigger' action because it already surfaces as a plain 'order' row, while the trigger breakdown covers both statuses — see the response's dataNotes. Use for 'do builder X's users place stops and take-profits, and how much of their order flow actually fills?'. Requires Pro tier.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      builder: builderAddressSchema,
      period: builderPeriodSchema.default("week").describe("Placement window: day, week, or month."),
    },
    annotations,
  },
  async ({ useToonFormat, builder, period }) =>
    toolResult(await callAPI(useToonFormat, `/builders/${builder}/orders`, { period }))
);

// ─── L4 order book [PRO] ───────────────────────────
const BOOK_SHARED_NOTE =
  "Snapshot-derived: refreshed every 60 s, latest-only (no history), and `as_of_height` is the L1 block the answer is true at — check `age_s` before citing it. `market_orderbook` remains the aggregated L2 view; this is the L4 one. Coin is case-sensitive in the node's own spelling (BTC, xyz:GOLD, #28200) and is passed through unchanged — 'btc' will 404. Pro tier.";

const bookCoinSchema = z
  .string()
  .min(1)
  .max(40)
  .describe("Coin in the node's own spelling, CASE-SENSITIVE: BTC, HYPE, xyz:GOLD, cash:TSLA, #28200. Not normalized — 'btc' returns 404. Use list_markets to discover exact spellings. Spot pairs (names containing '/', e.g. PURR/USDC) are not addressable on this route.");

const bookPath = (kind: string, coin: string) => `/market/book/${kind}/${encodeURIComponent(coin)}`;

if (shouldRegister("book_summary")) server.registerTool(
  "book_summary",
  {
    title: "Order Book Summary (L4)",
    description:
      "Answers: how deep and how lopsided is this book right now? Returns touch prices, spread in bps, and per side the size / order count / distinct wallet count within 0.5, 1, 2, 5 and 10 % of mid (nested bands, not rings), plus near- and far-band imbalance, the number of orders resting at the touch, their median age, and the share of them that are post-only. Example: 'is HYPE's bid side thinner than its ask side inside 1 %?' — book_summary('HYPE') and compare bid.bands vs ask.bands. " +
      BOOK_SHARED_NOTE,
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: bookCoinSchema,
    },
    annotations: { ...annotations, title: "Order Book Summary (L4)" },
  },
  async ({ useToonFormat, coin }) => toolResult(await callAPI(useToonFormat, bookPath("summary", coin)))
);

if (shouldRegister("book_stop_map")) server.registerTool(
  "book_stop_map",
  {
    title: "Order Book Stop Map (L4)",
    description:
      "Answers: where are the stops, and how much size fires if price gets there? Buckets every untriggered stop / take-profit order by distance from mid in 0.25 % steps, out to `within_pct`, reporting per bucket the count, size, reduce-only share, stop vs take-profit split and side split — plus totals below and above mid, the nearest trigger each side, and how many sit beyond the window. Example: 'what is stacked under BTC within 2 %?' — book_stop_map('BTC', within_pct=2) and read totals_below plus the negative buckets. Note totals_below / totals_above / nearest_* always cover EVERY trigger on the coin, while `buckets` is the `within_pct` window. " +
      BOOK_SHARED_NOTE,
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: bookCoinSchema,
      within_pct: z.number().int().min(1).max(10).default(10).describe("Half-width of the bucketed window, in percent of mid. The stored map always covers ±10 %; this slices it."),
    },
    annotations: { ...annotations, title: "Order Book Stop Map (L4)" },
  },
  async ({ useToonFormat, coin, within_pct }) =>
    toolResult(await callAPI(useToonFormat, bookPath("stops", coin), { within_pct: String(within_pct) }))
);

if (shouldRegister("book_whales")) server.registerTool(
  "book_whales",
  {
    title: "Order Book Whales (L4)",
    description:
      "Answers: who is sitting on this book, and where? Returns the largest resting orders (wallet, side, price, size, original size, distance from mid, tif, order type, how long it has rested) and the biggest wallets per side by total resting size. Example: 'is one wallet holding up the ETH bid?' — book_whales('ETH', limit=10) and check whether bid_wallets[0].size dominates. Wallet addresses join to the trader tools (pulse_trader_profile, pulse_trader_performance). " +
      BOOK_SHARED_NOTE,
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: bookCoinSchema,
      limit: z.number().int().min(1).max(50).default(20).describe("How many orders and how many wallets per side to return."),
    },
    annotations: { ...annotations, title: "Order Book Whales (L4)" },
  },
  async ({ useToonFormat, coin, limit }) =>
    toolResult(await callAPI(useToonFormat, bookPath("whales", coin), { limit: String(limit) }))
);

if (shouldRegister("book_levels")) server.registerTool(
  "book_levels",
  {
    title: "Order Book Levels (L4)",
    description:
      "Answers: what does the depth ladder look like, with the detail L2 throws away? The top price levels per side, best-first, each with total size, order count, DISTINCT WALLET count and the age of the oldest order on it — so a level held by one wallet's single order is distinguishable from the same size spread across twenty. Example: 'is SOL's 3rd bid level real depth or one wallet?' — book_levels('SOL', depth=5) and read bids[2].wallets. " +
      BOOK_SHARED_NOTE,
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: bookCoinSchema,
      depth: z.number().int().min(1).max(100).default(50).describe("Price levels returned per side."),
    },
    annotations: { ...annotations, title: "Order Book Levels (L4)" },
  },
  async ({ useToonFormat, coin, depth }) =>
    toolResult(await callAPI(useToonFormat, bookPath("levels", coin), { depth: String(depth) }))
);

// ─── Data coverage ─────────────────────────────────
if (shouldRegister("data_coverage")) server.registerTool(
  "data_coverage",
  {
    title: "Data Coverage",
    description: "Report the data window (start/end or latest row) and freshness stamp of each dataset behind this server, with the API route each figure came from — check window and freshness before relying on a historical range or citing a date. Datasets: trades (indexed trade history, /pulse/stats), builder_ledger (fee ledger + attribution coverage), census (chain-state stamp), hip4 (latest outcome fill), liquidations (risk-route availability/freshness), lifecycles (latest close; rolling 90-day window), cohort_history, book (L4 order-book rollups: coins covered, latest L1 height/time and age; snapshot-derived, refreshed every 60 s, no history). Where the API exposes no window start the dataset is listed with windowStart null and a note; no date is guessed. Sources are queried sequentially (the API's per-key burst allowance is small) and a failing source is reported in that dataset's notes rather than failing the call. Also returns server { version, hiddenTools, toolCount }. Free tier (some sources need a higher tier and then report the tier gate in notes).",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      dataset: z.enum(COVERAGE_DATASETS).optional().describe("Narrow to one dataset. Omit for all."),
    },
    annotations: { ...annotations, title: "Data Coverage" },
  },
  async ({ useToonFormat, dataset }) => {
    const wanted: CoverageDataset[] = dataset ? [dataset] : [...COVERAGE_DATASETS];
    // Sequential on purpose: the API's per-key burst allowance is 5 (Pro)
    // and 2 (Free), so fanning the sources out in parallel gets some of
    // them 429'd on exactly the keys reviewers use. Each source is a
    // cached sub-second route, so the serial cost is ~1-2 s total.
    const settled: PromiseSettledResult<CoverageRow>[] = [];
    for (const [i, d] of wanted.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, COVERAGE_PACE_MS));
      try {
        settled.push({ status: "fulfilled", value: await coverageSources[d]() });
      } catch (reason) {
        settled.push({ status: "rejected", reason });
      }
    }
    const datasets = settled.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
      const row: CoverageRow = {
        dataset: wanted[i],
        description: "",
        windowStart: null,
        windowEnd: null,
        latest: null,
        freshness: null,
        source: "",
        error: message,
        notes: [`source error: ${message}`],
      };
      return row;
    });
    const result = {
      generatedAt: new Date().toISOString(),
      datasets,
      server: {
        version: COINVERSA_VERSION,
        hiddenTools: [...hiddenTools].sort(),
        toolCount: COINVERSA_TOTAL_TOOL_COUNT,
        advertisedToolCount: COINVERSA_TOTAL_TOOL_COUNT - hiddenTools.size,
      },
    };
    return toolResult(useToonFormat ? toonEncode(result) : result);
  },
);

return server;
}
