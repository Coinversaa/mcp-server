#!/usr/bin/env node

// Coinversa Pulse MCP Server
// Exposes crypto intelligence tools to AI agents via Model Context Protocol
//
// Usage with Claude Desktop / Cursor / Claude Code:
//   Set COINVERSAA_API_KEY and COINVERSAA_API_URL in your MCP config

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { encode as toonEncode } from '@toon-format/toon'

import { z } from "zod";

// ─── Configuration ───────────────────────────────────────
export interface CoinversaServerOptions {
  apiKey?: string;
  apiUrl?: string;
}

export const COINVERSA_TOTAL_TOOL_COUNT = 91;
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

export function createCoinversaServer(options: CoinversaServerOptions = {}) {
const apiKey = options.apiKey;
// Defaults to production. Override apiUrl / COINVERSAA_API_URL only if you
// operate your own Coinversa backend and want the MCP to call it.
const API_URL = options.apiUrl || process.env.COINVERSAA_API_URL || DEFAULT_COINVERSA_API_URL;
const BASE = `${API_URL}/api/public/v1`;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

function shouldRegister(_toolName: string): boolean {
  return true;
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
async function callAPI(useToon: boolean, path: string, params?: Record<string, string>): Promise<any> {
  if (!apiKey) {
    throw new Error("Coinversa API key required. Set COINVERSAA_API_KEY for stdio, or send Authorization: Bearer <key> / X-API-Key to the remote MCP server.");
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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const headers: Record<string, string> = {};
      if (apiKey) headers["X-API-Key"] = apiKey;

      const response = await fetch(url.toString(), {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        // Rate limited — retry after delay
        if (attempt < MAX_RETRIES) {
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
        lastError = new Error("Request timed out after 30 seconds. The server may be under heavy load — try again.");
      } else if (err.cause?.code === "ECONNREFUSED" || err.cause?.code === "ENOTFOUND") {
        lastError = new Error("Cannot connect to the Coinversa API. Check your COINVERSAA_API_URL setting and network connection.");
      } else {
        lastError = err;
      }

      // Retry on transient network errors
      if (attempt < MAX_RETRIES && (err.name === "AbortError" || err.cause?.code === "ECONNRESET")) {
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

// ─── Create Server ───────────────────────────────────────
const SERVER_INSTRUCTIONS = `Coinversa Pulse — Crypto intelligence for AI agents.

DATA COVERAGE:
- Every tracked Hyperliquid wallet classified into behavioral cohorts (size + PnL tiers)
- All indexed trades with full PnL attribution (for current totals call pulse_global_stats)
- Real-time positions, liquidation heatmaps, and market data
- Syncer-backed risk routes for crowding, real liquidation events, and weekly market stress
- Cross-market asset taxonomy resolving venue symbols (xyz:GOLD, hyna:PAXG) to canonical assets
- HIP-4 outcome contract discovery, settlements, volume, recent trades, trader analytics, and perp-position context

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

PLANS & LIMITS:
- pulse_my_plan shows the caller's tier, limits, and every tier's limits.
  Call it when a request is rejected for tier or rate-limit reasons, then
  relay the specific upgrade guidance (tier-gate errors include an upgrade
  URL).

TIPS:
- When a user mentions a commodity (gold, silver, oil) or stock (TSLA, AAPL), check builder dex markets with list_markets
- Always use the prefix:TICKER format for builder dex symbols (xyz:SILVER not just SILVER)
- The list_markets tool accepts an optional dex filter to narrow results`;

const server = new McpServer({
  name: "coinversaa-pulse",
  version: "0.9.0",
}, {
  instructions: SERVER_INSTRUCTIONS,
});

// ══════════════════════════════════════════════════════════
// TOOL 1: Global Stats                              [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_global_stats")) server.registerTool(
  "pulse_global_stats",
  {
    description: "Get global Hyperliquid trading statistics: total traders, trades, volume, PnL, and data coverage period. Use this to understand the overall scale of the market.",
    inputSchema: { useToonFormat: useToonFormatSchema },
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/pulse/stats"))
);

// ══════════════════════════════════════════════════════════
// TOOL 2: Market Overview                           [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_market_overview")) server.registerTool(
  "pulse_market_overview",
  {
    description: "DEPRECATED alias for list_markets — returns the same payload (24h volume, open interest, mark price, raw hourly fundingRate decimal, 24h change for every pair). To display funding APR percent, calculate fundingRate * 24 * 365 * 100. Prefer list_markets for new integrations; this tool is kept for backward compatibility only.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      dex: z.enum(["hl", "xyz", "flx", "vntl", "hyna", "km", "abcd", "cash"]).optional().describe("Filter by dex. 'hl' for native Hyperliquid only, or a builder dex name (xyz, cash, km, etc.). Omit for all markets."),
    },
  },
  async ({ useToonFormat, dex }) => {
    const params: Record<string, string> = {};
    if (dex) params.dex = dex;
    return toolResult(await callAPI(useToonFormat, "/pulse/market-overview", params));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 3: List Markets (Discovery)                  [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("list_markets")) server.registerTool(
  "list_markets",
  {
    description: "CANONICAL market discovery tool. Returns every trading symbol on Hyperliquid and its builder dexes with dex, mark price, 24h volume, raw hourly fundingRate decimal, open interest, and 24h change. To display funding APR percent, calculate fundingRate * 24 * 365 * 100 (example: 0.00000625 = 5.475% APR). Use this whenever the user asks 'what markets are available?', mentions a commodity (gold, silver, oil), stock (TSLA, AAPL, NVDA), or builder-dex market. Prefer this over pulse_market_overview (same data, kept only for backward compat). For asset-level grouping across venues, use list_assets instead.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      dex: z.enum(["hl", "xyz", "flx", "vntl", "hyna", "km", "abcd", "cash"]).optional().describe("Filter by dex. 'hl' for native Hyperliquid, 'xyz' for commodities/stocks, 'cash' for equities, 'km' for energy, etc. Omit for all markets."),
    },
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
    description: "Directory of every canonical asset that trades on Hyperliquid or any builder dex, grouped by economic exposure (not by venue ticker). Each asset entry lists its synonyms (e.g. PAXG is a synonym of GOLD), which venues it trades on, aggregated open interest, and a cross-market flag (listed on 2+ venues). Prefer this over list_markets when the user asks 'what assets are available?', 'which venues is GOLD on?', or 'show me cross-market assets'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      crossMarketOnly: z.boolean().optional().describe("If true, return only assets listed on 2+ venues. Default: false (return all)."),
    },
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
    description: "Lookup one asset by canonical name or synonym. Returns every venue it trades on, collateral tokens, open interest per venue, and synonyms list. Accepts both canonical names (GOLD, BTC) and synonyms (PAXG, XAUT) — the server resolves them. Use when the user mentions a specific asset and you need its venue availability.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      canonical: z.string().min(1).max(40).describe("Canonical asset name or synonym. Examples: 'GOLD', 'PAXG', 'BTC', 'SILVER', 'HYPE'. The server resolves synonyms to canonical."),
    },
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
    description: "Cross-market aggregation for one asset: per-venue long/short positions, notional, net bias, unique wallets, leverage, plus a cross-venue total. Also returns biasRange (max-min netBias across venues) to detect disagreement. Accepts canonical names or synonyms (e.g. PAXG resolves to GOLD). Use when the user asks 'is gold crowded?', 'do different dexes disagree on BTC direction?', 'total OI on ETH across all venues?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      canonical: z.string().min(1).max(40).describe("Canonical asset name or synonym (e.g. 'GOLD', 'PAXG', 'BTC', 'HYPE'). The server resolves synonyms."),
    },
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
    description: "Get ranked trader leaderboard. Sort by PnL, win rate, volume, score, or risk-adjusted returns. Filter by time period (day/week/month/allTime) and minimum trade count. Use this to find the best traders on Hyperliquid.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      sort: z.enum(["pnl", "winrate", "volume", "score", "risk-adjusted", "losers"]).default("pnl").describe("Sort criteria"),
      period: z.enum(["day", "week", "month", "allTime"]).default("allTime").describe("Time period"),
      limit: z.number().min(1).max(100).default(20).describe("Number of traders to return"),
      minTrades: z.number().default(100).describe("Minimum trade count filter"),
    },
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
    description: "Discover underrated high-performing traders who fly under the radar. Filters by minimum win rate, PnL, and trade count. These are skilled traders that most platforms don't surface.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minWinRate: z.number().default(60).describe("Minimum win rate percentage"),
      minPnl: z.number().default(10000).describe("Minimum total PnL in USD"),
      minTrades: z.number().default(50).describe("Minimum number of trades"),
      maxTrades: z.number().default(500).describe("Maximum number of trades (filters out well-known whales)"),
      limit: z.number().min(1).max(100).default(20).describe("Number of traders to return"),
    },
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
    description: "Get behavioral cohort analysis across every tracked wallet on Hyperliquid. Returns PnL tiers (Apex/apex, Sharps/sharps, Grinders/grinders, Scrapers/scrapers, The Crowd/crowd, Bleeders/bleeders, Trapped/trapped, Blown Out/blown_out) and size tiers (Heavyweights/heavyweights, Cruiserweights/cruiserweights, Middleweights/middleweights, etc). Response payloads still use legacy slugs (money_printer, leviathan, ...). Each tier shows wallet count, avg PnL, avg win rate, and total volume. This is unique intelligence nobody else has. For the current tracked-wallet total, call pulse_global_stats first.",
    inputSchema: { useToonFormat: useToonFormatSchema },
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/pulse/cohorts/summary"))
);

// ══════════════════════════════════════════════════════════
// TOOL 6: Cohort Positions (What whales are doing NOW)
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_positions")) server.registerTool(
  "pulse_cohort_positions",
  {
    description: "See what a specific trader cohort is holding RIGHT NOW. For example, get all live positions held by 'apex' (Apex) tier traders or 'heavyweights' (Heavyweights) size wallets. This is real-time whale intelligence.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
      tier: tierSchema,
      limit: z.number().min(1).max(200).default(50).describe("Number of positions to return"),
    },
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
    description: "Get full profile for any Hyperliquid trader by wallet address. Returns total PnL, trade count, win rate, volume, largest win/loss, first/last trade dates, PnL tier, size tier, and profit factor. Use this for due diligence on any wallet.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
  },
  async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}`))
);

// ══════════════════════════════════════════════════════════
// TOOL 8: Trader Performance
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_performance")) server.registerTool(
  "pulse_trader_performance",
  {
    description: "Get performance comparison for a trader: 30-day vs all-time PnL, trade count, win rate, and trend direction (improving/declining/stable). Use this to evaluate if a trader is currently hot or cooling off.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
  },
  async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/performance`))
);

// ══════════════════════════════════════════════════════════
// TOOL 9: Price Lookup                              [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("market_price")) server.registerTool(
  "market_price",
  {
    description: "Get current mark price for any trading pair on Hyperliquid. Use standard symbols (BTC, ETH, SOL) or builder dex format (xyz:SILVER, km:OIL, cash:TSLA).",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      symbol: z.string().min(1).max(20).describe("Trading pair symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN format (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
    },
  },
  async ({ useToonFormat, symbol }) => toolResult(await callAPI(useToonFormat, `/market/price/${normalizeCoin(symbol)}`))
);

// ══════════════════════════════════════════════════════════
// TOOL 10: Wallet Positions
// ══════════════════════════════════════════════════════════
if (shouldRegister("market_positions")) server.registerTool(
  "market_positions",
  {
    description: "Get all open positions for any wallet address on Hyperliquid. Shows current entries, sizes, unrealized PnL, and leverage for each position.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
  },
  async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/market/positions/${address}`))
);

// ══════════════════════════════════════════════════════════
// TOOL 11: Recent Trades (Global)
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_recent_trades")) server.registerTool(
  "pulse_recent_trades",
  {
    description: "Get the biggest trades on Hyperliquid in the last N minutes/hours. Returns trades sorted by absolute PnL — the largest movers. Use this to see what's happening right now on the exchange.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      since: sinceSchema.default("10m"),
      limit: z.number().min(1).max(100).default(20).describe("Number of trades to return"),
      coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER)"),
    },
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
    description: "Get recent trades for a specific wallet address. See exactly what a trader has been doing in the last minutes/hours — every buy, sell, size, price, and PnL. Essential for copy-trading and due diligence.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
      since: sinceSchema.default("1h"),
      limit: z.number().min(1).max(100).default(50).describe("Number of trades to return"),
      coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER)"),
    },
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
    description: "See every trade a specific cohort has made recently. For example: 'show me all trades the apex (Apex) tier made in the last hour.' This is real-time alpha — nobody else has this data as an API.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
      tier: tierSchema,
      since: sinceSchema.default("1h"),
      limit: z.number().min(1).max(100).default(50).describe("Number of trades to return"),
    },
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
    description: "Get a liquidation heatmap for any coin. Shows where liquidation clusters are across price levels — essential for identifying support/resistance and potential squeeze zones. Unique data nobody else exposes.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
      buckets: z.number().min(10).max(100).default(50).describe("Number of price buckets in the heatmap"),
      range: z.number().min(1).max(50).default(30).describe("Price range percentage around current price"),
    },
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
    description: "Get the exchange-wide market risk snapshot. Best for questions like 'what looks fragile right now?' or 'which coins are most crowded?'. Returns total open interest, leverage, crowding concentration, near-liquidation exposure, 7-day liquidation totals, and the top coins where positioning looks most fragile.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
    },
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/live/risk/overview"))
);

// ══════════════════════════════════════════════════════════
// TOOL 16: Coin Risk Snapshot
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_coin_risk_snapshot")) server.registerTool(
  "live_coin_risk_snapshot",
  {
    description: "Get the current risk snapshot for a single coin. Use this when a user asks 'is BTC crowded?', 'who is holding the risk?', or 'how liquidation-prone is this market right now?'. Returns OI, wallet count, long/short posture, position-size concentration, top positions, liquidation heatmap, and 7-day liquidation totals.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN (e.g. xyz:GOLD, km:OIL, cash:TSLA)"),
    },
  },
  async ({ useToonFormat, coin }) => toolResult(await callAPI(useToonFormat, `/live/risk/coins/${normalizeCoin(coin)}`))
);

// ══════════════════════════════════════════════════════════
// TOOL 17: Coin Risk History
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_coin_risk_history")) server.registerTool(
  "live_coin_risk_history",
  {
    description: "Get the historical risk lane for a coin. Best for questions like 'how did this setup become fragile?' or 'did the Sharps rotate before the move?'. Returns hourly OI, long/short history, cohort rotation, candle data, mark/oracle dislocation history when available, and liquidation counts over time.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN"),
      hours: z.number().min(1).max(720).default(168).describe("Number of hours of history to return (default 168 = 7 days, max 720 = 30 days)"),
    },
  },
  async ({ useToonFormat, coin, hours }) =>
    toolResult(await callAPI(useToonFormat, `/live/risk/coins/${normalizeCoin(coin)}/history`, { hours: String(hours) }))
);

// ══════════════════════════════════════════════════════════
// TOOL 18: Mark Dislocations
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_mark_dislocations")) server.registerTool(
  "live_mark_dislocations",
  {
    description: "Get historical mark/oracle dislocation data for a coin. Use this to answer questions like 'did basis stress or oracle drift show up before liquidations?'. Returns timestamped mark price, oracle price, and basis percentage over the last 30 days.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN"),
      hours: z.number().min(1).max(720).default(168).describe("Number of hours of history to return (default 168 = 7 days, max 720 = 30 days)"),
    },
  },
  async ({ useToonFormat, coin, hours }) => {
    const history = await callAPI(false, `/live/risk/coins/${normalizeCoin(coin)}/history`, { hours: String(hours) });
    const result = {
      success: history.success,
      coin: history.coin,
      hours: history.hours,
      count: Array.isArray(history.markDislocations) ? history.markDislocations.length : 0,
      markDislocations: history.markDislocations || [],
      availability: history.availability,
      freshness: history.freshness,
      generatedAt: history.generatedAt,
    };
    return toolResult(useToonFormat ? toonEncode(result) : result);
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 19: Recent Liquidations
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_recent_liquidations")) server.registerTool(
  "live_recent_liquidations",
  {
    description: "Get real liquidation events from the syncer. Best for questions like 'where did forced unwind activity actually hit?' or 'show me BTC liquidations over the last 30 days'. Returns wallet, coin, penalty fee, and closed PnL.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      since: sinceSchema.default("7d"),
      coin: z.string().optional().describe("Optional coin filter (e.g. BTC, ETH, SOL or builder dex prefix:COIN)"),
      limit: z.number().min(1).max(200).default(50).describe("Number of liquidation events to return"),
    },
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
    description: "Get an aggregated liquidation summary over a time window. This is the best liquidation tool for summaries, rankings, and trend analysis. Returns event count, penalty fees, closed PnL, per-coin rollups, and a liquidation timeline.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      since: sinceSchema.default("7d"),
      coin: z.string().optional().describe("Optional coin filter (e.g. BTC, ETH, SOL or builder dex prefix:COIN)"),
    },
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
    description: "Get long/short ratio data. Without a coin, returns the global ratio across all Hyperliquid. With a coin, returns that specific pair's ratio. Optionally include historical data over the last N hours.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().optional().describe("Coin symbol (e.g. BTC, ETH). For builder dex: prefix:COIN (e.g. xyz:SILVER). Omit for global ratio."),
      hours: z.number().min(1).max(168).optional().describe("Include historical data for the last N hours (max 168 = 7 days)"),
    },
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
    description: "See what each trader cohort is doing on a specific coin RIGHT NOW. Returns the net long/short bias for every tier (Apex, Sharps, Middleweights, etc.) on the given coin. Answers questions like 'are the Sharps traders long or short ETH?'",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
    },
  },
  async ({ useToonFormat, coin }) => toolResult(await callAPI(useToonFormat, `/live/cohort-bias/${normalizeCoin(coin)}`))
);

// ══════════════════════════════════════════════════════════
// TOOL 17: Trader Daily Stats
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_daily_stats")) server.registerTool(
  "pulse_trader_daily_stats",
  {
    description: "Get day-by-day performance breakdown for any trader. Returns daily PnL, trade count, win rate, and volume for each day the trader was active. Use for deep due diligence and identifying consistency patterns.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
  },
  async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/daily`))
);

// ══════════════════════════════════════════════════════════
// TOOL 18: Biggest Wins & Losses (Global)
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_biggest_trades")) server.registerTool(
  "pulse_biggest_trades",
  {
    description: "Get the biggest winning or losing trades across all of Hyperliquid. Use type='wins' for the largest profitable trades, or type='losses' for the largest losses. Useful for market sentiment and narrative analysis.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      type: z.enum(["wins", "losses"]).describe("'wins' for biggest profitable trades, 'losses' for biggest losing trades"),
      limit: z.number().min(1).max(50).default(20).describe("Number of trades to return"),
      threshold: z.number().optional().describe("Minimum PnL for wins (e.g. 50000) or maximum PnL for losses (e.g. -50000)"),
    },
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
    description: "Get the order book (bid/ask depth) for any trading pair on Hyperliquid. Shows price levels and sizes on both sides. Essential for understanding liquidity, spread, and potential support/resistance.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      symbol: z.string().min(1).max(20).describe("Trading pair symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN format (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
      depth: z.number().min(1).max(50).default(10).describe("Number of price levels on each side"),
    },
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
    description: "Get the top traders for a specific coin. Answers questions like 'who are the best BTC traders?' or 'who profits most from SOL?'. Returns ranked traders with PnL, trade count, win rate, and volume for that specific coin.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
      limit: z.number().min(1).max(100).default(50).describe("Number of traders to return"),
    },
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
    description: "Get token-by-token P&L breakdown for any trader. Shows which coins they trade, their PnL per coin, win rate per coin, and volume per coin. Use to understand a trader's edge — e.g. 'this trader only makes money on ETH and loses on everything else.'",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
  },
  async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/tokens`))
);

// ══════════════════════════════════════════════════════════
// TOOL 22: Most Traded Coins                        [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_most_traded_coins")) server.registerTool(
  "pulse_most_traded_coins",
  {
    description: "Get the most actively traded coins on Hyperliquid, ranked by trade count and volume. Use to understand what the market is focused on right now.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      limit: z.number().min(1).max(100).default(20).describe("Number of coins to return"),
    },
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
    description: "Get historical performance data for a specific trader cohort over time. Shows how a tier's aggregate PnL, trade count, and activity have changed day-by-day. Use to spot trends like 'the sharps (Sharps) tier has been increasingly bearish over the last month.'",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
      tier: tierSchema,
      days: z.number().min(1).max(365).default(30).describe("Number of days of history to return"),
    },
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
    description: "Closed-position history for a wallet from the legacy closed_positions table (entry/exit prices, hold duration, PnL, leverage). SUPERSEDED by pulse_trader_lifecycles, which reads the corrected position_lifecycles_full table — more history, MAE/MFE execution quality, and spot coverage. Prefer pulse_trader_lifecycles; kept for backward compatibility.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
      limit: z.number().min(1).max(200).default(50).describe("Number of positions to return"),
      offset: z.number().min(0).default(0).describe("Pagination offset"),
      coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER)"),
    },
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
    description: "Aggregate stats for a wallet's closed positions (avg hold duration, position win rate, total positions, PnL summary) from the legacy closed_positions table. SUPERSEDED by pulse_trader_lifecycle_summary, which reads the corrected position_lifecycles_full table (richer, more history). Prefer pulse_trader_lifecycle_summary; kept for backward compatibility.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
  },
  async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/closed-positions/stats`))
);

// ══════════════════════════════════════════════════════════
// TOOL 26: Recent Closed Positions (Global)
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_recent_closed_positions")) server.registerTool(
  "pulse_recent_closed_positions",
  {
    description: "Global feed of recently closed positions across all traders, from the legacy closed_positions table. SUPERSEDED by pulse_lifecycles_recent, which reads the corrected position_lifecycles_full table (adds MAE/MFE + spot coverage). Prefer pulse_lifecycles_recent; kept for backward compatibility.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      since: sinceSchema.default("1h"),
      limit: z.number().min(1).max(200).default(50).describe("Number of positions to return"),
      coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER)"),
      minNotional: z.number().optional().describe("Minimum notional value in USD (e.g. 100000 for $100K+ positions)"),
      minDuration: z.number().optional().describe("Minimum hold duration in milliseconds (e.g. 60000 for positions held at least 1 minute)"),
      maxDuration: z.number().optional().describe("Maximum hold duration in milliseconds (e.g. 1000 for sub-second HFT trades, 60000 for under 1 minute)"),
    },
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
    description: "Global feed of the most recently CLOSED position lifecycles across ALL wallets — 'what just closed exchange-wide right now'. Reads the corrected position_lifecycles_full table: includes MAE/MFE (when backfilled), a liquidation flag, and optional spot. Cross-wallet successor to pulse_recent_closed_positions. Filter by coin, minNotional, hold-duration range, and time window. Note: the very freshest closes may not have MAE/MFE yet — the risk backfill lags real-time, so recent rows can show null MAE/MFE.",
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
if (shouldRegister("market_historical_oi")) server.tool(
  "market_historical_oi",
  "Get historical hourly open interest snapshots (notional USD). Supports per-coin filtering or global exchange aggregation. Max range is 30 days.",
  {
    useToonFormat: useToonFormatSchema,
    coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER). Omit for global exchange aggregate."),
    since: sinceSchema.optional().describe("Time window for history (max 30d). e.g. '24h', '7d', '30d'"),
    startTime: z.string().optional().describe("Explicit start time (ISO string or timestamp). Overrides 'since'."),
    endTime: z.string().optional().describe("Explicit end time (ISO string or timestamp). Defaults to now."),
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
    description: "Get recent 1-minute candle history for a market. Best for short intraday structure checks, recent momentum, and micro-pullback analysis. This MCP tool is intentionally capped to the most recent 12 hours so agents do not fetch huge minute-bar dumps in one call.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      symbol: z.string().min(1).max(20).describe("Market symbol (e.g. BTC, ETH, SOL, xyz:GOLD, cash:TSLA)"),
      limit: z.number().min(1).max(720).default(240).describe("Number of 1-minute candles to return. Capped at 720 candles (12h) to keep MCP responses practical."),
    },
  },
  async ({ useToonFormat, symbol, limit }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/market/candles/recent/${normalizeCoin(symbol)}`, { interval: "1m", limit: String(limit) }))
);

// ══════════════════════════════════════════════════════════
// TOOL 29: Cohort Bias History
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_bias_history")) server.tool(
  "pulse_cohort_bias_history",
  "Get historical hourly bias snapshots for all trader cohorts. Returns net long/short notional and account counts per tier. Use this to see how different cohorts (Sharps, Middleweights, The Crowd) have shifted their positioning over time. Supports per-coin or global aggregate. Max range is 30 days.",
  {
    useToonFormat: useToonFormatSchema,
    coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER). Omit for global exchange aggregate."),
    since: sinceSchema.optional().describe("Time window for history (max 30d). e.g. '24h', '7d', '30d'"),
    startTime: z.string().optional().describe("Explicit start time (ISO string or timestamp). Overrides 'since'."),
    endTime: z.string().optional().describe("Explicit end time (ISO string or timestamp). Defaults to now."),
  },
  async ({ useToonFormat, coin, since, startTime, endTime }) => {
    const params: Record<string, string> = {};
    if (since) params.since = since;
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;
    if (coin) params.coin = normalizeCoin(coin);
    return toolResult(await callAPI(useToonFormat, "/pulse/cohort-bias/history", params));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 30: Cohort Daily Performance Stats
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_performance_daily")) server.tool(
  "pulse_cohort_performance_daily",
  "Get historical daily performance statistics for all trader cohorts. Returns PnL, volume, trade counts, and active trader counts per tier. Use this to track the consistency and profitability of different groups over time. Max range is 30 days.",
  {
    useToonFormat: useToonFormatSchema,
    since: sinceSchema.optional().describe("Time window for history (max 30d). e.g. '7d', '14d', '30d'"),
    startTime: z.string().optional().describe("Explicit start time (ISO string or timestamp). Overrides 'since'."),
    endTime: z.string().optional().describe("Explicit end time (ISO string or timestamp). Defaults to now."),
  },
  async ({ useToonFormat, since, startTime, endTime }) => {
    const params: Record<string, string> = {};
    if (since) params.since = since;
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;
    return toolResult(await callAPI(useToonFormat, "/pulse/cohorts/daily-stats", params));
  }
);

// ══════════════════════════════════════════════════════════
// TOOL 37: Open Interest History
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_oi_history")) server.registerTool(
  "live_oi_history",
  {
    description: "Get historical open interest data for any coin on Hyperliquid, or global OI across all coins. Best for identifying accumulation/distribution phases, market conviction shifts, and whether a move was backed by positioning. Default 7 days, max 30 days.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().optional().describe("Coin symbol (e.g. BTC, ETH, SOL). Omit for global OI across all coins."),
      hours: z.number().min(1).max(720).default(168).describe("Number of hours of history (default 168 = 7 days, max 720 = 30 days)"),
    },
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
    description: "Official per-dex open interest for a coin, sourced from Hyperliquid's Info API (not derived from live_positions). Returns hourly snapshots with open interest, mark price, and 24h notional volume. Use when an agent needs venue-reported ground truth, per-dex breakdown, or wants to cross-check computed OI against official numbers. Default 7 days, max 30 days.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(40).describe("Coin symbol (e.g. BTC, ETH, SOL). Use the bare ticker — dex is supplied via the 'dex' parameter, not prefix."),
      hours: z.number().min(1).max(720).default(168).describe("Number of hours of history (default 168 = 7 days, max 720 = 30 days)"),
      dex: z.enum(["hl", "xyz", "flx", "vntl", "hyna", "km", "abcd", "cash"]).optional().default("hl").describe("Which dex's official OI to return. Defaults to 'hl' (native Hyperliquid)."),
    },
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
    description: "Get historical cohort bias data for a specific coin. Use this when a user asks 'were smart-money cohorts accumulating or exiting?' or 'which tier flipped first?'. Returns hourly net-bias snapshots for each tier or for a specific tier over time.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL)"),
      tierType: z.enum(["pnl", "size"]).default("pnl").describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
      tier: tierSchema.optional().describe("Specific tier to track. Omit for all tiers in the category."),
      hours: z.number().min(1).max(720).default(168).describe("Number of hours of history (default 168 = 7 days, max 720 = 30 days)"),
    },
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

if (shouldRegister("hip4_outcomes")) server.registerTool(
  "hip4_outcomes",
  {
    description: "List active HIP-4 outcome contracts that traded recently. Returns outcome IDs, question metadata when available, side tokens, fills, unique wallets, notional USDH, and first/last traded timestamps. Use when users ask what prediction/outcome markets are active.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      hours: z.number().int().min(1).max(168).default(24).describe("Look-back window in hours. Default 24, max 168."),
    },
  },
  async ({ useToonFormat, hours }) =>
    toolResult(await callAPI(useToonFormat, "/hip4/outcomes", { hours: String(hours) }))
);

if (shouldRegister("hip4_outcome")) server.registerTool(
  "hip4_outcome",
  {
    description: "Get details for one HIP-4 outcome contract by outcome ID. Returns metadata when available plus side tokens, fills, unique wallets, notional USDH, and trading timestamps.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      outcomeId: outcomeIdSchema,
    },
  },
  async ({ useToonFormat, outcomeId }) =>
    toolResult(await callAPI(useToonFormat, `/hip4/outcomes/${outcomeId}`))
);

if (shouldRegister("hip4_outcome_summary")) server.registerTool(
  "hip4_outcome_summary",
  {
    description: "Get the full HIP-4 summary for one outcome across both sides: fills, unique wallets, contracts, side notional, total notional, realized PnL, and trading window. Requires a Starter-or-higher key.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      outcomeId: outcomeIdSchema,
    },
  },
  async ({ useToonFormat, outcomeId }) =>
    toolResult(await callAPI(useToonFormat, `/hip4/outcomes/${outcomeId}/summary`))
);

if (shouldRegister("hip4_outcome_recent_trades")) server.registerTool(
  "hip4_outcome_recent_trades",
  {
    description: "Get recent real fills for one HIP-4 outcome. Excludes settlement, pair-redeem, and auction-phase fills. Returns trade time, wallet, side, price, size, PnL, and fee.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      outcomeId: outcomeIdSchema,
      hours: z.number().int().min(1).max(168).default(24).describe("Look-back window in hours. Default 24, max 168."),
      limit: z.number().int().min(1).max(500).default(100).describe("Maximum trades to return. Default 100, max 500."),
    },
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
    description: "List HIP-4 question metadata from Hyperliquid outcomeMeta, including question IDs, descriptions, fallback outcomes, named outcomes, settlement metadata, and parsed expiry/threshold fields when present.",
    inputSchema: { useToonFormat: useToonFormatSchema },
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/hip4/questions"))
);

if (shouldRegister("hip4_recent_settlements")) server.registerTool(
  "hip4_recent_settlements",
  {
    description: "List recent HIP-4 settlements. Returns outcome ID, settlement time, winning side when determinable, winner/loser fill counts, winner payouts, and loser losses.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      hours: z.number().int().min(1).max(720).default(168).describe("Look-back window in hours. Default 168, max 720."),
      limit: z.number().int().min(1).max(200).default(50).describe("Maximum settlements to return. Default 50, max 200."),
    },
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
    description: "Get daily HIP-4 volume trajectory: fills, unique trades, unique wallets, contracts, and notional USDH by day. Use for outcome-market activity trends.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      days: z.number().int().min(1).max(60).default(14).describe("Number of days back from today. Default 14, max 60."),
    },
  },
  async ({ useToonFormat, days }) =>
    toolResult(await callAPI(useToonFormat, "/hip4/daily-volume", { days: String(days) }))
);

if (shouldRegister("hip4_most_active")) server.registerTool(
  "hip4_most_active",
  {
    description: "Return the most active HIP-4 outcomes over a recent window, ranked by fill count. Includes outcome/question metadata when available.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      hours: z.number().int().min(1).max(168).default(24).describe("Look-back window in hours. Default 24, max 168."),
      limit: z.number().int().min(1).max(50).default(10).describe("Maximum outcomes to return. Default 10, max 50."),
    },
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
    description: "Rank top HIP-4 outcome traders by recent outcome activity. Returns address, fills, distinct outcomes, contracts, notional USDH, and realized PnL. Requires a Starter-or-higher key.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      days: z.number().int().min(1).max(30).default(7).describe("Look-back window in days. Default 7, max 30."),
      limit: z.number().int().min(1).max(100).default(25).describe("Maximum traders to return. Default 25, max 100."),
    },
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
    description: "Get one wallet's HIP-4 outcome history: outcome ID, side index, side token, fills, net shares, gross bought/sold USDH, realized PnL, and first/last traded. Requires a Starter-or-higher key.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
      days: z.number().int().min(1).max(365).default(30).describe("Look-back window in days. Default 30, max 365."),
    },
  },
  async ({ useToonFormat, address, days }) =>
    toolResult(await callAPI(useToonFormat, `/hip4/trader/${address}/outcomes`, { days: String(days) }))
);

if (shouldRegister("hip4_cross_product_overlap")) server.registerTool(
  "hip4_cross_product_overlap",
  {
    description: "Measure overlap between HIP-4 outcome traders and perp traders over a recent window. Returns outcome trader count, perp trader count, overlap count, and overlap percentage. Requires a Pro-or-higher key.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      days: z.number().int().min(1).max(30).default(7).describe("Look-back window in days. Default 7, max 30."),
    },
  },
  async ({ useToonFormat, days }) =>
    toolResult(await callAPI(useToonFormat, "/hip4/cross-product/overlap", { days: String(days) }))
);

if (shouldRegister("hip4_perp_position_context")) server.registerTool(
  "hip4_perp_position_context",
  {
    description: "Join one HIP-4 outcome's current net-positive holders to currently open perp positions on the same underlying asset. Returns per-side wallet counts, open-position overlap, long/short wallet counts, net underlying position, underlying notional, aligned vs hedge counts, prediction-native counts, and top wallets with signal labels. Use when users ask whether outcome traders are already exposed to the same asset, whether a side is directional or hedged, or which large outcome holders have no underlying perp exposure. Requires a Pro-or-higher key.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      outcomeId: outcomeIdSchema,
      days: z.number().int().min(1).max(60).default(14).describe("Look-back window in days for reconstructing current outcome holders from outcome trades. Default 14, max 60."),
      limit: z.number().int().min(1).max(100).default(25).describe("Maximum top outcome wallets to return. Default 25, max 100."),
    },
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
    description: "Get a wallet's position lifecycle history — every open->close cycle reconstructed from on-chain fills, with entry/exit VWAP, peak size, hold duration, realized PnL, fees, fill count, and liquidation status. Richer than closed-positions: each row is a full position lifecycle. 90-day rolling window; spot (@-prefixed) excluded by default. Use for deep position-level due diligence and timing analysis.",
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
    description: "Get a wallet's aggregate position-lifecycle stats: total/closed/open count, wins, losses, liquidations, win rate, total & avg PnL, biggest win/loss, avg/min/max hold duration, total fees, and unique coins traded. Same 90-day rolling window as pulse_trader_lifecycles. Use to size up a trader's position-level performance in one call.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
      coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH). For builder dex: prefix:COIN."),
      includeSpot: z.boolean().default(false).describe("Include spot (@-prefixed) pairs. Default false."),
      includeCensored: z.boolean().default(false).describe("Include censored lifecycles. Default false."),
    },
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
    description: "Look up one position lifecycle by its numeric ID, including every trade fill that composed it (timestamp, side, size, price, PnL, fee, tx hash) joined from the trades table within the open->close window. Use after pulse_trader_lifecycles to drill into exactly how a single position was built and unwound.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      id: z.number().int().min(1).describe("Lifecycle ID (from pulse_trader_lifecycles)."),
    },
  },
  async ({ useToonFormat, id }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/lifecycle/${id}`))
);

// ─── Trader Demo / Quick Brief ───────────────────────────
if (shouldRegister("pulse_trader_demo")) server.registerTool(
  "pulse_trader_demo",
  {
    description: "Get a fast wallet briefing for demos and agent triage: lifecycle summary plus recent top wins and losses. Use when the user wants a quick read on a trader before deciding whether to run deeper lifecycle, drawdown, or token-level analysis.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
    },
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
    description: "Get a wallet's per-position drawdown (MAE) and run-up (MFE) curve: for each closed perp lifecycle, the worst adverse price excursion and best favorable excursion vs entry, as percentages. Use to judge a trader's pain tolerance and exit timing — 'how far underwater did they go before it worked?'. Perp-only (spot has no MAE).",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: ethAddressSchema,
      limit: z.number().min(1).max(500).default(100).describe("Number of positions to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
  },
  async ({ useToonFormat, address, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/wallet-drawdown-curve/${address}`, { limit: String(limit), offset: String(offset) }))
);

// ─── Max-Pain Events ──────────────────────────────────────
if (shouldRegister("pulse_max_pain_events")) server.registerTool(
  "pulse_max_pain_events",
  {
    description: "Find the biggest survived drawdowns: closed perp positions that went deeply underwater (high MAE) yet still closed in profit. These are 'diamond hands' winners that nearly blew up first. Returns the position, entry/MAE/exit prices, realized PnL, and max drawdown %. Filtered to material positions (minPnl) with bounded drawdowns.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minDrawdownPct: z.number().min(0).default(10).describe("Minimum drawdown % (MAE vs entry) to qualify. Default 10."),
      minPnl: z.number().min(0).default(1000).describe("Minimum realized PnL in USD to filter noise. Default 1000."),
      limit: z.number().min(1).max(500).default(50).describe("Number of events to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
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
    description: "Find positions that exited near the top: closed perp positions whose exit captured a high fraction of the maximum favorable excursion (MFE). These are well-timed exits. Returns the position, entry/exit/MFE prices, realized PnL, and MFE capture % (capped at 100). Filtered to material positions (minPnl) with a real favorable move.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minCapturePct: z.number().min(0).max(100).default(90).describe("Minimum MFE capture % to qualify. Default 90."),
      minPnl: z.number().min(0).default(1000).describe("Minimum realized PnL in USD to filter noise. Default 1000."),
      limit: z.number().min(1).max(500).default(50).describe("Number of exits to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
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
    description: "Get the most catastrophic individual liquidations across Hyperliquid — large forced closes ranked by loss. Returns wallet, coin, side, entry VWAP, peak size, realized PnL, penalty fee, liquidation method, and liquidator address. Use for 'who got wrecked hardest?' and post-mortem analysis. Default returns $10k+ losses.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      method: z.string().optional().describe("Optional liquidation method filter (e.g. 'market', 'backstop')."),
      maxRealizedPnl: z.number().max(0).default(-10000).describe("Only return losses at least this large (negative). Default -10000 = $10k+ losses."),
      limit: z.number().min(1).max(500).default(50).describe("Number of events to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
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
    description: "Find comeback traders: wallets whose cumulative realized PnL hit a deep trough and then climbed back to positive. Returns wallet, trough depth, current cumulative PnL, and recovery amount. Use for 'who blew up but recovered?'. Realized-PnL drawdown only.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      maxTrough: z.number().max(0).default(-10000).describe("Trough must be at least this deep (negative). Default -10000."),
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
  },
  async ({ useToonFormat, maxTrough, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/survivors", { maxTrough: String(maxTrough), limit: String(limit), offset: String(offset) }))
);

// ─── Anti-Survivors ───────────────────────────────────────
if (shouldRegister("pulse_anti_survivors")) server.registerTool(
  "pulse_anti_survivors",
  {
    description: "Find wallets that blew up and never recovered — cumulative realized PnL hit a deep trough and is still underwater. Returns wallet, trough depth, and current cumulative PnL. Use for 'who got rekt and stayed rekt?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      maxTrough: z.number().max(0).default(-10000).describe("Trough must be at least this deep (negative). Default -10000."),
      stillUnderwater: z.number().max(0).default(0).describe("Current cumulative PnL must be at or below this (negative or 0). Default 0."),
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
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
    description: "Find consistently profitable wallets: traders that were profitable in N+ distinct calendar months of the 90-day window. Returns wallet, profitable-month count, total PnL, and best-month PnL. Use for 'who is consistently good, not just lucky once?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minMonths: z.number().int().min(1).max(3).default(2).describe("Minimum number of profitable months (1-3). Default 2."),
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
  },
  async ({ useToonFormat, minMonths, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/persistent-winners", { minMonths: String(minMonths), limit: String(limit), offset: String(offset) }))
);

// ─── Capital Titans ───────────────────────────────────────
if (shouldRegister("pulse_capital_titans")) server.registerTool(
  "pulse_capital_titans",
  {
    description: "Find the most fee-efficient traders: highest realized PnL per dollar of fees paid. Returns wallet, total PnL, total fees, PnL-per-fee-dollar ratio, and lifecycle count. Use for 'who extracts the most edge per dollar spent on fees?'. minPnl/minFees gates filter out noise.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minPnl: z.number().min(0).default(10000).describe("Minimum total PnL in USD. Default 10000."),
      minFees: z.number().min(0).default(100).describe("Minimum total fees in USD. Default 100."),
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
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
    description: "Find flash-in-the-pan traders: big winners in a single month who then gave it back. Returns wallet, best-month PnL, total PnL, giveback amount, active months, and profitable months. Use for 'who had one great month then faded?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minBestMonth: z.number().min(0).default(50000).describe("Minimum best-month PnL in USD to qualify. Default 50000."),
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
  },
  async ({ useToonFormat, minBestMonth, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/one-month-wonders", { minBestMonth: String(minBestMonth), limit: String(limit), offset: String(offset) }))
);

// ─── Newcomer Whales ──────────────────────────────────────
if (shouldRegister("pulse_newcomer_whales")) server.registerTool(
  "pulse_newcomer_whales",
  {
    description: "Find new big players: wallets whose first-ever lifecycle is recent but who have already moved large notional. Returns wallet, first-seen date, gross notional, total PnL, and lifecycle count. Use for 'who just showed up and is already trading big?'. Lower minNotional if no rows return at default.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      newcomerDays: z.number().int().min(1).max(90).default(30).describe("How recent the first lifecycle must be, in days. Default 30."),
      minNotional: z.number().min(0).default(100000).describe("Minimum gross notional in USD. Default 100000."),
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
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
    description: "Find the top earner(s) per coin within the window. perCoinRank=1 returns only the #1 earner ('king') of each coin; higher values return the top-N per coin. Returns coin, wallet, coin PnL, fees, lifecycle count, and rank. Use for 'who owns BTC?' / 'who is the best trader of each market?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      perCoinRank: z.number().int().min(1).max(10).default(1).describe("Top-N earners per coin to return. 1 = the king only. Default 1."),
      limit: z.number().min(1).max(500).default(50).describe("Number of rows to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
  },
  async ({ useToonFormat, perCoinRank, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/coin-kings", { perCoinRank: String(perCoinRank), limit: String(limit), offset: String(offset) }))
);

// ─── Top Liquidators ──────────────────────────────────────
if (shouldRegister("pulse_top_liquidators")) server.registerTool(
  "pulse_top_liquidators",
  {
    description: "Find wallets that profit by liquidating others' forced closes. Returns liquidator wallet, liquidations executed, distinct victims, distinct coins, total penalty collected, and total liquidation PnL. Use for 'who is the biggest backstop/liquidation player?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
  },
  async ({ useToonFormat, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/top-liquidators", { limit: String(limit), offset: String(offset) }))
);

// ─── Lethal Coins ─────────────────────────────────────────
if (shouldRegister("pulse_lethal_coins")) server.registerTool(
  "pulse_lethal_coins",
  {
    description: "Find the most dangerous markets: coins with the highest per-lifecycle liquidation rate. Returns coin, total lifecycles, liquidations, liquidation %, and total penalty. Use for 'which coins blow people up most often?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      minLifecycles: z.number().int().min(1).default(100).describe("Minimum lifecycles for a coin to qualify (filters thin markets). Default 100."),
      limit: z.number().min(1).max(500).default(50).describe("Number of coins to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
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
    description: "Per-coin profit pools split into winners vs losers vs net. Returns coin, lifecycles, unique wallets, winners pool, losers pool, net PnL, winning/losing lifecycle counts, and total fees. Use for 'which coins are net wealth creators vs destroyers?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      limit: z.number().min(1).max(500).default(100).describe("Number of coins to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
  },
  async ({ useToonFormat, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/pulse/coin-alpha-map", { limit: String(limit), offset: String(offset) }))
);

// ─── Hour Profitability ───────────────────────────────────
if (shouldRegister("pulse_hour_profitability")) server.registerTool(
  "pulse_hour_profitability",
  {
    description: "Global PnL heatmap by UTC hour of position close. Returns, for each of the 24 hours, lifecycle count, total PnL, avg PnL, wins, and losses. Use for 'what time of day is most profitable to close?' / session-bias analysis.",
    inputSchema: { useToonFormat: useToonFormatSchema },
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/pulse/hour-profitability"))
);

// ─── Market Concentration ─────────────────────────────────
if (shouldRegister("pulse_market_concentration")) server.registerTool(
  "pulse_market_concentration",
  {
    description: "Power-law shape of trader profits: percentile bands (top 0.1%, 1%, 10%, ...) and each band's share of total profits. Returns band label, wallet count, band PnL, % of total profits, and rank range. Use for 'how concentrated is alpha — do the top 1% take everything?'.",
    inputSchema: { useToonFormat: useToonFormatSchema },
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/pulse/market-concentration"))
);

// ─── Style Distribution ───────────────────────────────────
if (shouldRegister("pulse_style_distribution")) server.registerTool(
  "pulse_style_distribution",
  {
    description: "HFT vs swing vs holder PnL split, bucketed by lifecycle hold duration. Returns, per style bucket, lifecycle count, unique wallets, total PnL, avg PnL, and total fees. Use for 'do scalpers or swing traders make more money on Hyperliquid?'.",
    inputSchema: { useToonFormat: useToonFormatSchema },
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/pulse/style-distribution"))
);

// ─── Compare Wallets ──────────────────────────────────────
if (shouldRegister("pulse_compare")) server.registerTool(
  "pulse_compare",
  {
    description: "Side-by-side comparison of 2-5 wallets via their lifecycle summaries — win rate, total/avg PnL, hold duration, biggest win/loss, fees, liquidations. Use for head-to-head trader comparison ('who is the better trader, A or B?').",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      wallets: z.array(ethAddressSchema).min(2).max(5).describe("2 to 5 wallet addresses to compare."),
    },
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
    description: "Live positions held by a cohort defined by its LAST-30-DAY tier (pnl_tier_recent / size_tier_recent), not lifetime tier. Surfaces what currently-printing wallets are positioned for right now — catches regime changes the all-time pulse_cohort_positions misses.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers."),
      tier: tierSchema,
      limit: z.number().min(1).max(500).default(50).describe("Number of positions to return."),
    },
  },
  async ({ useToonFormat, tierType, tier, limit }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/cohorts-recent/${tierType}/${normalizeTier(tier)}/positions`, { limit: String(limit) }))
);

// ─── Recent-Cohort Trades ─────────────────────────────────
if (shouldRegister("pulse_cohort_recent_trades")) server.registerTool(
  "pulse_cohort_recent_trades",
  {
    description: "Recent trades by a cohort defined by its LAST-30-DAY tier (pnl_tier_recent / size_tier_recent). Shows what currently-printing wallets have been trading in the window — real-time alpha weighted to who is hot NOW, not all-time.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers."),
      tier: tierSchema,
      since: sinceSchema.default("1h"),
      limit: z.number().min(1).max(500).default(50).describe("Number of trades to return."),
    },
  },
  async ({ useToonFormat, tierType, tier, since, limit }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/cohorts-recent/${tierType}/${normalizeTier(tier)}/trades`, { since, limit: String(limit) }))
);

// ─── Recent-Cohort Lifecycle Stats ────────────────────────
if (shouldRegister("pulse_cohort_recent_lifecycle_stats")) server.registerTool(
  "pulse_cohort_recent_lifecycle_stats",
  {
    description: "Per-wallet lifecycle stats for a cohort defined by its LAST-30-DAY tier: lifecycles, wins, losses, liquidations, total PnL, fees, avg hold, biggest win/loss, plus the wallet's recent pnl/size tier labels. Use for position-level analysis of who is currently printing.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers."),
      tier: tierSchema,
      limit: z.number().min(1).max(500).default(50).describe("Number of wallets to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
  },
  async ({ useToonFormat, tierType, tier, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/cohorts-recent/${tierType}/${normalizeTier(tier)}/lifecycle-stats`, { limit: String(limit), offset: String(offset) }))
);

// ─── Recent-Cohort Top Positions ──────────────────────────
if (shouldRegister("pulse_cohort_recent_top_positions")) server.registerTool(
  "pulse_cohort_recent_top_positions",
  {
    description: "Top closed position lifecycles by a cohort defined by its LAST-30-DAY tier: the biggest/most notable open->close cycles from currently-printing wallets, with entry/exit VWAP, hold duration, realized PnL, fees, and liquidation flag.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers."),
      tier: tierSchema,
      limit: z.number().min(1).max(500).default(50).describe("Number of positions to return."),
      offset: z.number().min(0).default(0).describe("Pagination offset."),
    },
  },
  async ({ useToonFormat, tierType, tier, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/cohorts-recent/${tierType}/${normalizeTier(tier)}/top-positions`, { limit: String(limit), offset: String(offset) }))
);

// ─── Recent-Cohort Alpha Concentration ────────────────────
if (shouldRegister("pulse_cohort_recent_alpha_concentration")) server.registerTool(
  "pulse_cohort_recent_alpha_concentration",
  {
    description: "How concentrated profit is WITHIN a recent-tier cohort: percentile bands of the cohort's wallets and each band's share of the cohort's total PnL. Returns band, wallet count, band PnL, % of tier PnL, and tier total wallets. Use for 'within the hot apex (Apex) cohort, do a few wallets carry everything?'.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers."),
      tier: tierSchema,
    },
  },
  async ({ useToonFormat, tierType, tier }) =>
    toolResult(await callAPI(useToonFormat, `/pulse/cohorts-recent/${tierType}/${normalizeTier(tier)}/alpha-concentration`))
);

// ─── My Plan (tier / limits introspection) [FREE] ─────────
if (shouldRegister("pulse_my_plan")) server.registerTool(
  "pulse_my_plan",
  {
    description: "Show the current API key's plan: tier, rate limits (per-minute/daily/monthly), and a comparison of every tier's limits with an upgrade link. Call this when the user asks what plan they're on, when a request was rejected for tier or rate-limit reasons, or before recommending an upgrade. Live remaining-quota counts also arrive on every API response as X-RateLimit-* headers.",
    inputSchema: { useToonFormat: useToonFormatSchema },
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/plan"))
);

// ─── Entity Profile (owner-level view) [PRO] ──────────────
if (shouldRegister("pulse_entity_profile")) server.registerTool(
  "pulse_entity_profile",
  {
    description: "Resolve ANY wallet to its owner entity: the master account, every named sub-account (and weaker 'linked' wallets), each member's open book, the COMBINED open positions across all of them, and a 'verified vs chain at block N' stamp. Answers 'who owns this wallet?' and 'what is this trader's real total book across all their accounts?' — sub-accounts trade independently on Hyperliquid, so per-wallet views undercount every multi-account trader. Note: vaults appear as named sub-accounts of their creator. Requires Pro tier.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe("Any wallet address — master, sub-account, or unknown; it resolves to the owning entity either way."),
    },
  },
  async ({ useToonFormat, address }) =>
    toolResult(await callAPI(useToonFormat, `/entity/${address}`))
);

// ─── Entity Leaderboard (deduped by owner) [PRO] ──────────
if (shouldRegister("pulse_entity_leaderboard")) server.registerTool(
  "pulse_entity_leaderboard",
  {
    description: "Top entities (owners, NOT wallets) ranked by combined gross open entry notional across all their sub-accounts. This is the deduplicated view a wallet leaderboard cannot give: a fund running 35 sub-accounts appears as ONE entity with its true combined book. System/protocol accounts are excluded. Each row: entity master address, wallet count, open position count, gross entry notional. Requires Pro tier.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      limit: z.number().int().min(1).max(100).default(25).describe("Rows to return (max 100)."),
      offset: z.number().int().min(0).max(199).default(0).describe("Pagination offset (window capped at 200)."),
    },
  },
  async ({ useToonFormat, limit, offset }) =>
    toolResult(await callAPI(useToonFormat, "/entities/leaderboard", { limit: String(limit), offset: String(offset) }))
);

// ─── Exchange Volume by Dex [FREE] ────────────────────────
if (shouldRegister("pulse_exchange_volume")) server.registerTool(
  "pulse_exchange_volume",
  {
    description: "24h trading volume for the WHOLE exchange, split by dex: native Hyperliquid ('hl') plus every builder dex (xyz, hyna, ...), with per-dex match counts and distinct traders. Use for 'how much volume does Hyperliquid do?' — and note builder dexes are ~43% of it, which most public trackers' headline numbers omit. Aggregates cached up to 120s.",
    inputSchema: { useToonFormat: useToonFormatSchema },
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/exchange/volume"))
);

// ─── Exchange Open Interest by Dex [FREE] ─────────────────
if (shouldRegister("pulse_exchange_oi")) server.registerTool(
  "pulse_exchange_oi",
  {
    description: "Current open interest for the whole exchange by dex, with long/short notional split. Gross both-sides convention (matches HyperTracker/hl.eco headlines; halve for one-sided OI). Use for 'what's the OI on Hyperliquid / on xyz?', market-size questions, and long-vs-short balance checks. Cached up to 120s.",
    inputSchema: { useToonFormat: useToonFormatSchema },
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/exchange/oi"))
);

// ─── Active Traders 24h [FREE] ────────────────────────────
if (shouldRegister("pulse_active_traders")) server.registerTool(
  "pulse_active_traders",
  {
    description: "Distinct wallets that filled at least one perp trade in the last 24h, exchange-wide, plus total match count. The 'daily active traders' headline number. Cached up to 120s.",
    inputSchema: { useToonFormat: useToonFormatSchema },
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/exchange/active-traders"))
);

// ─── Exchange Positions & 24h Flow [FREE] ─────────────────
if (shouldRegister("pulse_exchange_positions")) server.registerTool(
  "pulse_exchange_positions",
  {
    description: "Exchange-wide position vitals by dex: open positions and wallets holding them, plus the 24h flow — positions closed, liquidations, and TOTAL REALIZED PNL across the whole exchange (gross profits/losses split). Answers 'how many positions are open on Hyperliquid?' and 'did traders collectively make or lose money today?' — a headline no public tracker publishes. Cached up to 120s.",
    inputSchema: { useToonFormat: useToonFormatSchema },
  },
  async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/exchange/positions"))
);

// ─── Daily PnL Leaders [STARTER] ──────────────────────────
if (shouldRegister("pulse_pnl_leaders")) server.registerTool(
  "pulse_pnl_leaders",
  {
    description: "Today's biggest realized winners AND losers: wallets ranked by summed realized PnL on positions CLOSED in the last 24h, with position counts and liquidation flags. Realized-on-the-day — different from the portfolio leaderboards (which rank account value over longer windows). Use for 'who made/lost the most money today?'. Requires Starter tier or higher.",
    inputSchema: {
      useToonFormat: useToonFormatSchema,
      limit: z.number().int().min(1).max(100).default(20).describe("Winners and losers each capped at this count."),
    },
  },
  async ({ useToonFormat, limit }) => toolResult(await callAPI(useToonFormat, "/exchange/pnl-leaders", { limit: String(limit) }))
);

return server;
}
