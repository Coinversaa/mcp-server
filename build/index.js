#!/usr/bin/env node
// Coinversaa Pulse MCP Server
// Exposes crypto intelligence tools to AI agents via Model Context Protocol
//
// Usage with Claude Desktop / Cursor / Claude Code:
//   Set COINVERSAA_API_KEY and COINVERSAA_API_URL in your MCP config
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { encode as toonEncode } from '@toon-format/toon';
import { z } from "zod";
// ─── Configuration ───────────────────────────────────────
const API_KEY = process.env.COINVERSAA_API_KEY;
// TODO: Change default to https://api.coinversaa.ai once production API is deployed
const API_URL = process.env.COINVERSAA_API_URL || "https://staging.api.coinversaa.ai";
const BASE = `${API_URL}/api/public/v1`;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;
// Free tier tools — available without an API key
const FREE_TIER_TOOLS = new Set([
    'pulse_global_stats',
    'pulse_market_overview',
    'list_markets',
    'market_price',
    'market_orderbook',
    'pulse_most_traded_coins',
    'live_long_short_ratio',
]);
if (!API_KEY) {
    console.error("WARNING: COINVERSAA_API_KEY not set. Only free-tier tools will be available (7 of 30). Get a key at https://coinversaa.ai/developers");
}
function shouldRegister(toolName) {
    if (API_KEY)
        return true;
    return FREE_TIER_TOOLS.has(toolName);
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
const tierSchema = z
    .enum([
    "money_printer", "smart_money", "grinder", "humble_earner",
    "exit_liquidity", "semi_rekt", "full_rekt", "giga_rekt",
    "leviathan", "tidal_whale", "whale", "small_whale",
    "apex_predator", "dolphin", "fish", "shrimp",
])
    .describe("Tier name. PnL tiers: money_printer, smart_money, grinder, humble_earner, exit_liquidity, semi_rekt, full_rekt, giga_rekt. Size tiers: leviathan, tidal_whale, whale, small_whale, apex_predator, dolphin, fish, shrimp");
const sinceSchema = z
    .string()
    .regex(/^\d+[mhd]$/, "Must be a number followed by m (minutes), h (hours), or d (days). e.g. '10m', '1h', '7d'")
    .describe("Time window: e.g. '10m' (minutes), '1h' (hours), '1d' (days)");
/**
 * Normalize a coin/symbol string: uppercase the coin name while preserving
 * lowercase builder dex prefix (e.g. "xyz:silver" → "xyz:SILVER", "btc" → "BTC").
 */
function normalizeCoin(raw) {
    const idx = raw.indexOf(':');
    if (idx !== -1) {
        // Builder dex format — keep prefix lowercase, uppercase the coin
        return raw.slice(0, idx).toLowerCase() + ':' + raw.slice(idx + 1).toUpperCase();
    }
    return raw.toUpperCase();
}
// ─── API Helper (with timeout + retries + friendly errors) ─
async function callAPI(useToon, path, params) {
    const url = new URL(`${BASE}${path}`);
    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== "") {
                url.searchParams.set(key, value);
            }
        });
    }
    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            const headers = {};
            if (API_KEY)
                headers["X-API-Key"] = API_KEY;
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
                throw new Error("Rate limit exceeded. Please wait a moment and try again.");
            }
            if (response.status === 404) {
                throw new Error("Not found. The requested resource does not exist — check the address or symbol.");
            }
            if (response.status === 401) {
                throw new Error("Invalid API key. Check your COINVERSAA_API_KEY environment variable.");
            }
            if (!response.ok) {
                const body = await response.json().catch(() => null);
                const msg = body?.error || response.statusText;
                throw new Error(`Request failed (${response.status}): ${msg}`);
            }
            const data = await response.json();
            return useToon ? toonEncode(data) : data;
        }
        catch (err) {
            if (err.name === "AbortError") {
                lastError = new Error("Request timed out after 30 seconds. The server may be under heavy load — try again.");
            }
            else if (err.cause?.code === "ECONNREFUSED" || err.cause?.code === "ENOTFOUND") {
                lastError = new Error("Cannot connect to the Coinversaa API. Check your COINVERSAA_API_URL setting and network connection.");
            }
            else {
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
function formatJSON(data) {
    return JSON.stringify(data, null, 2);
}
function toolResult(data) {
    return { content: [{ type: "text", text: formatJSON(data) }] };
}
// ─── Create Server ───────────────────────────────────────
const SERVER_INSTRUCTIONS = `Coinversaa Pulse — Crypto intelligence for AI agents.

DATA COVERAGE:
- 710K+ tracked Hyperliquid wallets classified into behavioral cohorts
- 1.8B+ indexed trades with full PnL attribution
- Real-time positions, liquidation heatmaps, and market data

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

COHORT TIERS:
Wallets are classified into two tier systems:
- PnL tiers (by profitability): money_printer, smart_money, grinder, humble_earner, exit_liquidity, semi_rekt, full_rekt, giga_rekt
- Size tiers (by volume): leviathan, tidal_whale, whale, small_whale, apex_predator, dolphin, fish, shrimp

TIPS:
- When a user mentions a commodity (gold, silver, oil) or stock (TSLA, AAPL), check builder dex markets with list_markets
- Always use the prefix:TICKER format for builder dex symbols (xyz:SILVER not just SILVER)
- The list_markets tool accepts an optional dex filter to narrow results`;
const server = new McpServer({
    name: "coinversaa-pulse",
    version: "0.4.1",
}, {
    instructions: SERVER_INSTRUCTIONS,
});
// ══════════════════════════════════════════════════════════
// TOOL 1: Global Stats                              [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_global_stats"))
    server.registerTool("pulse_global_stats", {
        description: "Get global Hyperliquid trading statistics: total traders, trades, volume, PnL, and data coverage period. Use this to understand the overall scale of the market.",
        inputSchema: { useToonFormat: useToonFormatSchema },
    }, async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/pulse/stats")));
// ══════════════════════════════════════════════════════════
// TOOL 2: Market Overview                           [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_market_overview"))
    server.registerTool("pulse_market_overview", {
        description: "Get full market state: 24h volume, open interest, and live data for every trading pair on Hyperliquid (native + all builder dexes) including mark price, funding rate, and 24h change. Use the optional dex filter to narrow to a specific exchange.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            dex: z.enum(["hl", "xyz", "flx", "vntl", "hyna", "km", "abcd", "cash"]).optional().describe("Filter by dex. 'hl' for native Hyperliquid only, or a builder dex name (xyz, cash, km, etc.). Omit for all markets."),
        },
    }, async ({ useToonFormat, dex }) => {
        const params = {};
        if (dex)
            params.dex = dex;
        return toolResult(await callAPI(useToonFormat, "/pulse/market-overview", params));
    });
// ══════════════════════════════════════════════════════════
// TOOL 3: List Markets (Discovery)                  [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("list_markets"))
    server.registerTool("list_markets", {
        description: "Discover all available trading symbols on Hyperliquid and its builder dexes. Returns every market with its dex, mark price, 24h volume, funding rate, open interest, and 24h change. Use this to find which symbols exist and which dex they belong to. Essential when a user asks about commodities (gold, silver), stocks (TSLA, AAPL), or builder dex markets.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            dex: z.enum(["hl", "xyz", "flx", "vntl", "hyna", "km", "abcd", "cash"]).optional().describe("Filter by dex. 'hl' for native Hyperliquid, 'xyz' for commodities/stocks, 'cash' for equities, 'km' for energy, etc. Omit for all markets."),
        },
    }, async ({ useToonFormat, dex }) => {
        const params = {};
        if (dex)
            params.dex = dex;
        return toolResult(await callAPI(useToonFormat, "/pulse/market-overview", params));
    });
// ══════════════════════════════════════════════════════════
// TOOL 3: Leaderboard
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_leaderboard"))
    server.registerTool("pulse_leaderboard", {
        description: "Get ranked trader leaderboard. Sort by PnL, win rate, volume, score, or risk-adjusted returns. Filter by time period (day/week/month/allTime) and minimum trade count. Use this to find the best traders on Hyperliquid.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            sort: z.enum(["pnl", "winrate", "volume", "score", "risk-adjusted", "losers"]).default("pnl").describe("Sort criteria"),
            period: z.enum(["day", "week", "month", "allTime"]).default("allTime").describe("Time period"),
            limit: z.number().min(1).max(100).default(20).describe("Number of traders to return"),
            minTrades: z.number().default(100).describe("Minimum trade count filter"),
        },
    }, async ({ useToonFormat, sort, period, limit, minTrades }) => toolResult(await callAPI(useToonFormat, "/pulse/leaderboard", { sort, period, limit: String(limit), minTrades: String(minTrades) })));
// ══════════════════════════════════════════════════════════
// TOOL 4: Hidden Gems
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_hidden_gems"))
    server.registerTool("pulse_hidden_gems", {
        description: "Discover underrated high-performing traders who fly under the radar. Filters by minimum win rate, PnL, and trade count. These are skilled traders that most platforms don't surface.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            minWinRate: z.number().default(60).describe("Minimum win rate percentage"),
            minPnl: z.number().default(10000).describe("Minimum total PnL in USD"),
            minTrades: z.number().default(50).describe("Minimum number of trades"),
            maxTrades: z.number().default(500).describe("Maximum number of trades (filters out well-known whales)"),
            limit: z.number().min(1).max(100).default(20).describe("Number of traders to return"),
        },
    }, async ({ useToonFormat, minWinRate, minPnl, minTrades, maxTrades, limit }) => toolResult(await callAPI(useToonFormat, "/pulse/hidden-gems", {
        minWinRate: String(minWinRate),
        minPnl: String(minPnl),
        minTrades: String(minTrades),
        maxTrades: String(maxTrades),
        limit: String(limit),
    })));
// ══════════════════════════════════════════════════════════
// TOOL 5: Cohort Summary
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_summary"))
    server.registerTool("pulse_cohort_summary", {
        description: "Get behavioral cohort analysis across all 710K+ tracked wallets. Returns PnL tiers (money_printer, smart_money, grinder, humble_earner, exit_liquidity, semi_rekt, full_rekt, giga_rekt) and size tiers (leviathan, tidal_whale, whale, etc). Each tier shows wallet count, avg PnL, avg win rate, and total volume. This is unique intelligence nobody else has.",
        inputSchema: { useToonFormat: useToonFormatSchema },
    }, async ({ useToonFormat }) => toolResult(await callAPI(useToonFormat, "/pulse/cohorts/summary")));
// ══════════════════════════════════════════════════════════
// TOOL 6: Cohort Positions (What whales are doing NOW)
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_positions"))
    server.registerTool("pulse_cohort_positions", {
        description: "See what a specific trader cohort is holding RIGHT NOW. For example, get all live positions held by 'money_printer' tier traders or 'leviathan' size wallets. This is real-time whale intelligence.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
            tier: tierSchema,
            limit: z.number().min(1).max(200).default(50).describe("Number of positions to return"),
        },
    }, async ({ useToonFormat, tierType, tier, limit }) => toolResult(await callAPI(useToonFormat, `/pulse/cohorts/${tierType}/${tier}/positions`, { limit: String(limit) })));
// ══════════════════════════════════════════════════════════
// TOOL 7: Trader Profile
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_profile"))
    server.registerTool("pulse_trader_profile", {
        description: "Get full profile for any Hyperliquid trader by wallet address. Returns total PnL, trade count, win rate, volume, largest win/loss, first/last trade dates, PnL tier, size tier, and profit factor. Use this for due diligence on any wallet.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            address: ethAddressSchema,
        },
    }, async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}`)));
// ══════════════════════════════════════════════════════════
// TOOL 8: Trader Performance
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_performance"))
    server.registerTool("pulse_trader_performance", {
        description: "Get performance comparison for a trader: 30-day vs all-time PnL, trade count, win rate, and trend direction (improving/declining/stable). Use this to evaluate if a trader is currently hot or cooling off.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            address: ethAddressSchema,
        },
    }, async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/performance`)));
// ══════════════════════════════════════════════════════════
// TOOL 9: Price Lookup                              [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("market_price"))
    server.registerTool("market_price", {
        description: "Get current mark price for any trading pair on Hyperliquid. Use standard symbols (BTC, ETH, SOL) or builder dex format (xyz:SILVER, km:OIL, cash:TSLA).",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            symbol: z.string().min(1).max(20).describe("Trading pair symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN format (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
        },
    }, async ({ useToonFormat, symbol }) => toolResult(await callAPI(useToonFormat, `/market/price/${normalizeCoin(symbol)}`)));
// ══════════════════════════════════════════════════════════
// TOOL 10: Wallet Positions
// ══════════════════════════════════════════════════════════
if (shouldRegister("market_positions"))
    server.registerTool("market_positions", {
        description: "Get all open positions for any wallet address on Hyperliquid. Shows current entries, sizes, unrealized PnL, and leverage for each position.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            address: ethAddressSchema,
        },
    }, async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/market/positions/${address}`)));
// ══════════════════════════════════════════════════════════
// TOOL 11: Recent Trades (Global)
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_recent_trades"))
    server.registerTool("pulse_recent_trades", {
        description: "Get the biggest trades on Hyperliquid in the last N minutes/hours. Returns trades sorted by absolute PnL — the largest movers. Use this to see what's happening right now on the exchange.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            since: sinceSchema.default("10m"),
            limit: z.number().min(1).max(100).default(20).describe("Number of trades to return"),
            coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER)"),
        },
    }, async ({ useToonFormat, since, limit, coin }) => {
        const params = { since, limit: String(limit) };
        if (coin)
            params.coin = normalizeCoin(coin);
        return toolResult(await callAPI(useToonFormat, "/pulse/trades/recent", params));
    });
// ══════════════════════════════════════════════════════════
// TOOL 12: Trader Recent Trades
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_trades"))
    server.registerTool("pulse_trader_trades", {
        description: "Get recent trades for a specific wallet address. See exactly what a trader has been doing in the last minutes/hours — every buy, sell, size, price, and PnL. Essential for copy-trading and due diligence.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            address: ethAddressSchema,
            since: sinceSchema.default("1h"),
            limit: z.number().min(1).max(100).default(50).describe("Number of trades to return"),
            coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER)"),
        },
    }, async ({ useToonFormat, address, since, limit, coin }) => {
        const params = { since, limit: String(limit) };
        if (coin)
            params.coin = normalizeCoin(coin);
        return toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/trades`, params));
    });
// ══════════════════════════════════════════════════════════
// TOOL 13: Cohort Recent Trades
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_trades"))
    server.registerTool("pulse_cohort_trades", {
        description: "See every trade a specific cohort has made recently. For example: 'show me all trades the money_printer tier made in the last hour.' This is real-time alpha — nobody else has this data as an API.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
            tier: tierSchema,
            since: sinceSchema.default("1h"),
            limit: z.number().min(1).max(100).default(50).describe("Number of trades to return"),
        },
    }, async ({ useToonFormat, tierType, tier, since, limit }) => toolResult(await callAPI(useToonFormat, `/pulse/cohorts/${tierType}/${tier}/trades`, { since, limit: String(limit) })));
// ══════════════════════════════════════════════════════════
// TOOL 14: Liquidation Heatmap
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_liquidation_heatmap"))
    server.registerTool("live_liquidation_heatmap", {
        description: "Get a liquidation heatmap for any coin. Shows where liquidation clusters are across price levels — essential for identifying support/resistance and potential squeeze zones. Unique data nobody else exposes.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
            buckets: z.number().min(10).max(100).default(50).describe("Number of price buckets in the heatmap"),
            range: z.number().min(1).max(50).default(30).describe("Price range percentage around current price"),
        },
    }, async ({ useToonFormat, coin, buckets, range }) => toolResult(await callAPI(useToonFormat, `/live/liquidation-heatmap/${normalizeCoin(coin)}`, {
        buckets: String(buckets),
        range: String(range),
    })));
// ══════════════════════════════════════════════════════════
// TOOL 15: Long/Short Ratio                         [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_long_short_ratio"))
    server.registerTool("live_long_short_ratio", {
        description: "Get long/short ratio data. Without a coin, returns the global ratio across all Hyperliquid. With a coin, returns that specific pair's ratio. Optionally include historical data over the last N hours.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            coin: z.string().optional().describe("Coin symbol (e.g. BTC, ETH). For builder dex: prefix:COIN (e.g. xyz:SILVER). Omit for global ratio."),
            hours: z.number().min(1).max(168).optional().describe("Include historical data for the last N hours (max 168 = 7 days)"),
        },
    }, async ({ useToonFormat, coin, hours }) => {
        if (hours) {
            // Historical mode
            const params = { hours: String(hours) };
            if (coin)
                params.coin = normalizeCoin(coin);
            return toolResult(await callAPI(useToonFormat, "/live/long-short/history", params));
        }
        if (coin) {
            return toolResult(await callAPI(useToonFormat, `/live/coins/${normalizeCoin(coin)}/long-short`));
        }
        return toolResult(await callAPI(useToonFormat, "/live/long-short"));
    });
// ══════════════════════════════════════════════════════════
// TOOL 16: Cohort Bias
// ══════════════════════════════════════════════════════════
if (shouldRegister("live_cohort_bias"))
    server.registerTool("live_cohort_bias", {
        description: "See what each trader cohort is doing on a specific coin RIGHT NOW. Returns the net long/short bias for every tier (money_printer, smart_money, whales, etc.) on the given coin. Answers questions like 'are the smart money traders long or short ETH?'",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
        },
    }, async ({ useToonFormat, coin }) => toolResult(await callAPI(useToonFormat, `/live/cohort-bias/${normalizeCoin(coin)}`)));
// ══════════════════════════════════════════════════════════
// TOOL 17: Trader Daily Stats
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_daily_stats"))
    server.registerTool("pulse_trader_daily_stats", {
        description: "Get day-by-day performance breakdown for any trader. Returns daily PnL, trade count, win rate, and volume for each day the trader was active. Use for deep due diligence and identifying consistency patterns.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            address: ethAddressSchema,
        },
    }, async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/daily`)));
// ══════════════════════════════════════════════════════════
// TOOL 18: Biggest Wins & Losses (Global)
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_biggest_trades"))
    server.registerTool("pulse_biggest_trades", {
        description: "Get the biggest winning or losing trades across all of Hyperliquid. Use type='wins' for the largest profitable trades, or type='losses' for the largest losses. Useful for market sentiment and narrative analysis.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            type: z.enum(["wins", "losses"]).describe("'wins' for biggest profitable trades, 'losses' for biggest losing trades"),
            limit: z.number().min(1).max(50).default(20).describe("Number of trades to return"),
            threshold: z.number().optional().describe("Minimum PnL for wins (e.g. 50000) or maximum PnL for losses (e.g. -50000)"),
        },
    }, async ({ useToonFormat, type, limit, threshold }) => {
        if (type === "wins") {
            const params = { limit: String(limit) };
            if (threshold !== undefined)
                params.minPnl = String(threshold);
            return toolResult(await callAPI(useToonFormat, "/pulse/biggest-wins", params));
        }
        else {
            const params = { limit: String(limit) };
            if (threshold !== undefined)
                params.maxPnl = String(threshold);
            return toolResult(await callAPI(useToonFormat, "/pulse/biggest-losses", params));
        }
    });
// ══════════════════════════════════════════════════════════
// TOOL 19: Order Book                               [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("market_orderbook"))
    server.registerTool("market_orderbook", {
        description: "Get the order book (bid/ask depth) for any trading pair on Hyperliquid. Shows price levels and sizes on both sides. Essential for understanding liquidity, spread, and potential support/resistance.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            symbol: z.string().min(1).max(20).describe("Trading pair symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN format (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
            depth: z.number().min(1).max(50).default(10).describe("Number of price levels on each side"),
        },
    }, async ({ useToonFormat, symbol, depth }) => toolResult(await callAPI(useToonFormat, `/market/orderbook/${normalizeCoin(symbol)}`, { depth: String(depth) })));
// ══════════════════════════════════════════════════════════
// TOOL 20: Token Leaderboard
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_token_leaderboard"))
    server.registerTool("pulse_token_leaderboard", {
        description: "Get the top traders for a specific coin. Answers questions like 'who are the best BTC traders?' or 'who profits most from SOL?'. Returns ranked traders with PnL, trade count, win rate, and volume for that specific coin.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
            limit: z.number().min(1).max(100).default(50).describe("Number of traders to return"),
        },
    }, async ({ useToonFormat, coin, limit }) => toolResult(await callAPI(useToonFormat, `/pulse/token-leaderboard/${normalizeCoin(coin)}`, { limit: String(limit) })));
// ══════════════════════════════════════════════════════════
// TOOL 21: Trader Token Stats
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_token_stats"))
    server.registerTool("pulse_trader_token_stats", {
        description: "Get token-by-token P&L breakdown for any trader. Shows which coins they trade, their PnL per coin, win rate per coin, and volume per coin. Use to understand a trader's edge — e.g. 'this trader only makes money on ETH and loses on everything else.'",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            address: ethAddressSchema,
        },
    }, async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/tokens`)));
// ══════════════════════════════════════════════════════════
// TOOL 22: Most Traded Coins                        [FREE]
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_most_traded_coins"))
    server.registerTool("pulse_most_traded_coins", {
        description: "Get the most actively traded coins on Hyperliquid, ranked by trade count and volume. Use to understand what the market is focused on right now.",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            limit: z.number().min(1).max(100).default(20).describe("Number of coins to return"),
        },
    }, async ({ useToonFormat, limit }) => toolResult(await callAPI(useToonFormat, "/pulse/most-traded", { limit: String(limit) })));
// ══════════════════════════════════════════════════════════
// TOOL 23: Cohort History
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_history"))
    server.registerTool("pulse_cohort_history", {
        description: "Get historical performance data for a specific trader cohort over time. Shows how a tier's aggregate PnL, trade count, and activity have changed day-by-day. Use to spot trends like 'smart_money has been increasingly bearish over the last month.'",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
            tier: tierSchema,
            days: z.number().min(1).max(365).default(30).describe("Number of days of history to return"),
        },
    }, async ({ useToonFormat, tierType, tier, days }) => toolResult(await callAPI(useToonFormat, `/pulse/cohorts/${tierType}/${tier}/history`, { days: String(days) })));
// ══════════════════════════════════════════════════════════
// TOOL 24: Trader Closed Positions
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_closed_positions"))
    server.registerTool("pulse_trader_closed_positions", {
        description: "Get closed position history for any wallet. Shows every position that was opened and closed — with entry/exit prices, hold duration, PnL, and leverage. Use this to analyze a trader's position lifecycle and timing patterns. Answers: 'Show me all historical positions for this trader', 'What was the PnL and duration of each position?', 'When did this whale close their massive ETH long?'",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            address: ethAddressSchema,
            limit: z.number().min(1).max(200).default(50).describe("Number of positions to return"),
            offset: z.number().min(0).default(0).describe("Pagination offset"),
            coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER)"),
        },
    }, async ({ useToonFormat, address, limit, offset, coin }) => {
        const params = { limit: String(limit), offset: String(offset) };
        if (coin)
            params.coin = normalizeCoin(coin);
        return toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/closed-positions`, params));
    });
// ══════════════════════════════════════════════════════════
// TOOL 25: Trader Closed Position Stats
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_trader_closed_position_stats"))
    server.registerTool("pulse_trader_closed_position_stats", {
        description: "Get aggregate statistics about a trader's closed positions: average hold duration, win rate by position (not by fill), total positions closed, and PnL summary. Use this to understand how long a trader typically holds and their position-level performance. Answers: 'What is this trader's average hold time?', 'Win rate by position (not by fill)?', 'Is this trader a scalper or swing trader?', 'Average PnL per position?'",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            address: ethAddressSchema,
        },
    }, async ({ useToonFormat, address }) => toolResult(await callAPI(useToonFormat, `/pulse/trader/${address}/closed-positions/stats`)));
// ══════════════════════════════════════════════════════════
// TOOL 26: Recent Closed Positions (Global)
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_recent_closed_positions"))
    server.registerTool("pulse_recent_closed_positions", {
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
    }, async ({ useToonFormat, since, limit, coin, minNotional, minDuration, maxDuration }) => {
        const params = { since, limit: String(limit) };
        if (coin)
            params.coin = normalizeCoin(coin);
        if (minNotional != null)
            params.minNotional = String(minNotional);
        if (minDuration != null)
            params.minDuration = String(minDuration);
        if (maxDuration != null)
            params.maxDuration = String(maxDuration);
        return toolResult(await callAPI(useToonFormat, "/pulse/closed-positions/recent", params));
    });
// ══════════════════════════════════════════════════════════
// TOOL 27: Historical Open Interest
// ══════════════════════════════════════════════════════════
if (shouldRegister("market_historical_oi"))
    server.tool("market_historical_oi", "Get historical hourly open interest snapshots (notional USD). Supports per-coin filtering or global exchange aggregation. Max range is 30 days.", {
        useToonFormat: useToonFormatSchema,
        coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER). Omit for global exchange aggregate."),
        since: sinceSchema.optional().describe("Time window for history (max 30d). e.g. '24h', '7d', '30d'"),
        startTime: z.string().optional().describe("Explicit start time (ISO string or timestamp). Overrides 'since'."),
        endTime: z.string().optional().describe("Explicit end time (ISO string or timestamp). Defaults to now."),
    }, async ({ useToonFormat, coin, since, startTime, endTime }) => {
        const params = {};
        if (since)
            params.since = since;
        if (startTime)
            params.startTime = startTime;
        if (endTime)
            params.endTime = endTime;
        if (coin)
            params.coin = normalizeCoin(coin);
        return toolResult(await callAPI(useToonFormat, "/market/historical-oi", params));
    });
// ══════════════════════════════════════════════════════════
// TOOL 28: Cohort Bias History
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_bias_history"))
    server.tool("pulse_cohort_bias_history", "Get historical hourly bias snapshots for all trader cohorts. Returns net long/short notional and account counts per tier. Use this to see how different groups (whales, smart money) have shifted their positioning over time. Supports per-coin or global aggregate. Max range is 30 days.", {
        useToonFormat: useToonFormatSchema,
        coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER). Omit for global exchange aggregate."),
        since: sinceSchema.optional().describe("Time window for history (max 30d). e.g. '24h', '7d', '30d'"),
        startTime: z.string().optional().describe("Explicit start time (ISO string or timestamp). Overrides 'since'."),
        endTime: z.string().optional().describe("Explicit end time (ISO string or timestamp). Defaults to now."),
    }, async ({ useToonFormat, coin, since, startTime, endTime }) => {
        const params = {};
        if (since)
            params.since = since;
        if (startTime)
            params.startTime = startTime;
        if (endTime)
            params.endTime = endTime;
        if (coin)
            params.coin = normalizeCoin(coin);
        return toolResult(await callAPI(useToonFormat, "/pulse/cohort-bias/history", params));
    });
// ══════════════════════════════════════════════════════════
// TOOL 29: Cohort Daily Performance Stats
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_cohort_performance_daily"))
    server.tool("pulse_cohort_performance_daily", "Get historical daily performance statistics for all trader cohorts. Returns PnL, volume, trade counts, and active trader counts per tier. Use this to track the consistency and profitability of different groups over time. Max range is 30 days.", {
        useToonFormat: useToonFormatSchema,
        since: sinceSchema.optional().describe("Time window for history (max 30d). e.g. '7d', '14d', '30d'"),
        startTime: z.string().optional().describe("Explicit start time (ISO string or timestamp). Overrides 'since'."),
        endTime: z.string().optional().describe("Explicit end time (ISO string or timestamp). Defaults to now."),
    }, async ({ useToonFormat, since, startTime, endTime }) => {
        const params = {};
        if (since)
            params.since = since;
        if (startTime)
            params.startTime = startTime;
        if (endTime)
            params.endTime = endTime;
        return toolResult(await callAPI(useToonFormat, "/pulse/cohorts/daily-stats", params));
    });
// ══════════════════════════════════════════════════════════
// TOOL 27: Open Interest History                       [NEW]
// ══════════════════════════════════════════════════════════
server.tool("live_oi_history", "Get historical open interest data for any coin on Hyperliquid, or global OI across all coins. Hourly snapshots showing how OI has changed over time. Essential for identifying accumulation/distribution phases, market conviction shifts, and correlating OI changes with price moves. Default 7 days, max 30 days.", {
    useToonFormat: useToonFormatSchema,
    coin: z.string().optional().describe("Coin symbol (e.g. BTC, ETH, SOL). Omit for global OI across all coins."),
    hours: z.number().min(1).max(720).default(168).describe("Number of hours of history (default 168 = 7 days, max 720 = 30 days)"),
}, async ({ useToonFormat, coin, hours }) => {
    if (coin) {
        return toolResult(await callAPI(useToonFormat, `/live/oi-history/${coin.toUpperCase()}`, { hours: String(hours) }));
    }
    return toolResult(await callAPI(useToonFormat, "/live/oi-history", { hours: String(hours) }));
});
// ══════════════════════════════════════════════════════════
// TOOL 28: Cohort Bias History                         [NEW]
// ══════════════════════════════════════════════════════════
server.tool("live_cohort_bias_history", "Get historical cohort bias data for a specific coin. See how smart_money, money_printers, whales, etc. have shifted between long and short over time. Hourly snapshots of each tier's net bias. Use to spot when smart money started accumulating or exiting. Specify a single tier for focused analysis, or omit tier for all tiers comparison.", {
    useToonFormat: useToonFormatSchema,
    coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL)"),
    tierType: z.enum(["pnl", "size"]).default("pnl").describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
    tier: tierSchema.optional().describe("Specific tier to track. Omit for all tiers in the category."),
    hours: z.number().min(1).max(720).default(168).describe("Number of hours of history (default 168 = 7 days, max 720 = 30 days)"),
}, async ({ useToonFormat, coin, tierType, tier, hours }) => {
    const params = { hours: String(hours), tierType };
    if (tier)
        params.tier = tier;
    return toolResult(await callAPI(useToonFormat, `/live/cohort-bias-history/${coin.toUpperCase()}`, params));
});
// ══════════════════════════════════════════════════════════
// TOOL 29: Recent Liquidations                         [NEW]
// ══════════════════════════════════════════════════════════
server.tool("pulse_recent_liquidations", "Get recent liquidations from Hyperliquid. Returns liquidation events with details on liquidated users, coins, sizes, prices, and closed PnL. Filter by time window, coin, or specific liquidated user. Useful for tracking forced liquidations and market stress events. There are typically 40-80k liquidations per week, filter by user to get the most out of limit.", {
    useToonFormat: useToonFormatSchema,
    since: sinceSchema.default("1h"),
    limit: z.number().min(1).max(10_000).default(50).describe("Number of liquidations to return"),
    coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL). For builder dex: prefix:COIN (e.g. xyz:SILVER)"),
    liquidatedUser: ethAddressSchema.optional().describe("Filter by specific liquidated user address (0x...)"),
}, async ({ useToonFormat, since, limit, coin, liquidatedUser }) => {
    const params = { since, limit: String(limit) };
    if (coin)
        params.coin = normalizeCoin(coin);
    if (liquidatedUser)
        params.liquidatedUser = liquidatedUser;
    return toolResult(await callAPI(useToonFormat, "/pulse/liquidations/recent", params));
});
// ══════════════════════════════════════════════════════════
// TOOL 30: Recent prices                               [NEW]
// ══════════════════════════════════════════════════════════
if (shouldRegister("pulse_candles_recent"))
    server.registerTool("pulse_candles_recent", {
        description: "Get market prices with open, high, low, close, volume, and trade count on a given interval. ",
        inputSchema: {
            useToonFormat: useToonFormatSchema,
            symbol: z.string().min(1).max(20).describe("Trading pair symbol (e.g. BTC, ETH, SOL). For builder dex markets use prefix:COIN format (e.g. xyz:SILVER, km:OIL, cash:TSLA)"),
            interval: z.enum(['1m']),
        },
    }, async ({ useToonFormat, symbol, ...params }) => toolResult(await callAPI(useToonFormat, `/pulse/market/candles/recent/${normalizeCoin(symbol)}`, params)));
// ─── Start Server ────────────────────────────────────────
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    const toolCount = API_KEY ? 31 : FREE_TIER_TOOLS.size;
    console.error(`Coinversaa Pulse MCP server running on stdio (${toolCount} tools, ${API_KEY ? 'full access' : 'free tier'})`);
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
