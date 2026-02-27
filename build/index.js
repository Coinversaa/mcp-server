#!/usr/bin/env node
// Coinversaa Pulse MCP Server
// Exposes crypto intelligence tools to AI agents via Model Context Protocol
//
// Usage with Claude Desktop / Cursor / Claude Code:
//   Set COINVERSAA_API_KEY and COINVERSAA_API_URL in your MCP config
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
// ─── Configuration ───────────────────────────────────────
const API_KEY = process.env.COINVERSAA_API_KEY;
const API_URL = process.env.COINVERSAA_API_URL || "https://app.coinversaa.ai";
const BASE = `${API_URL}/api/public/v1`;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;
if (!API_KEY) {
    console.error("ERROR: COINVERSAA_API_KEY environment variable is required");
    process.exit(1);
}
// ─── Shared Validation Schemas ───────────────────────────
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
// ─── API Helper (with timeout + retries + friendly errors) ─
async function callAPI(path, params) {
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
            const response = await fetch(url.toString(), {
                headers: { "X-API-Key": API_KEY },
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
            return response.json();
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
const server = new McpServer({
    name: "coinversaa-pulse",
    version: "0.2.0",
});
// ══════════════════════════════════════════════════════════
// TOOL 1: Global Stats
// ══════════════════════════════════════════════════════════
server.tool("pulse_global_stats", "Get global Hyperliquid trading statistics: total traders, trades, volume, PnL, and data coverage period. Use this to understand the overall scale of the market.", {}, async () => toolResult(await callAPI("/pulse/stats")));
// ══════════════════════════════════════════════════════════
// TOOL 2: Market Overview
// ══════════════════════════════════════════════════════════
server.tool("pulse_market_overview", "Get full market state: 24h volume, open interest, and live data for every trading pair on Hyperliquid including mark price, funding rate, and 24h change.", {}, async () => toolResult(await callAPI("/pulse/market-overview")));
// ══════════════════════════════════════════════════════════
// TOOL 3: Leaderboard
// ══════════════════════════════════════════════════════════
server.tool("pulse_leaderboard", "Get ranked trader leaderboard. Sort by PnL, win rate, volume, score, or risk-adjusted returns. Filter by time period (day/week/month/allTime) and minimum trade count. Use this to find the best traders on Hyperliquid.", {
    sort: z.enum(["pnl", "winrate", "volume", "score", "risk-adjusted", "losers"]).default("pnl").describe("Sort criteria"),
    period: z.enum(["day", "week", "month", "allTime"]).default("allTime").describe("Time period"),
    limit: z.number().min(1).max(100).default(20).describe("Number of traders to return"),
    minTrades: z.number().default(100).describe("Minimum trade count filter"),
}, async ({ sort, period, limit, minTrades }) => toolResult(await callAPI("/pulse/leaderboard", { sort, period, limit: String(limit), minTrades: String(minTrades) })));
// ══════════════════════════════════════════════════════════
// TOOL 4: Hidden Gems
// ══════════════════════════════════════════════════════════
server.tool("pulse_hidden_gems", "Discover underrated high-performing traders who fly under the radar. Filters by minimum win rate, PnL, and trade count. These are skilled traders that most platforms don't surface.", {
    minWinRate: z.number().default(60).describe("Minimum win rate percentage"),
    minPnl: z.number().default(10000).describe("Minimum total PnL in USD"),
    minTrades: z.number().default(50).describe("Minimum number of trades"),
    maxTrades: z.number().default(500).describe("Maximum number of trades (filters out well-known whales)"),
    limit: z.number().min(1).max(100).default(20).describe("Number of traders to return"),
}, async ({ minWinRate, minPnl, minTrades, maxTrades, limit }) => toolResult(await callAPI("/pulse/hidden-gems", {
    minWinRate: String(minWinRate),
    minPnl: String(minPnl),
    minTrades: String(minTrades),
    maxTrades: String(maxTrades),
    limit: String(limit),
})));
// ══════════════════════════════════════════════════════════
// TOOL 5: Cohort Summary
// ══════════════════════════════════════════════════════════
server.tool("pulse_cohort_summary", "Get behavioral cohort analysis across all 710K+ tracked wallets. Returns PnL tiers (money_printer, smart_money, grinder, humble_earner, exit_liquidity, semi_rekt, full_rekt, giga_rekt) and size tiers (leviathan, tidal_whale, whale, etc). Each tier shows wallet count, avg PnL, avg win rate, and total volume. This is unique intelligence nobody else has.", {}, async () => toolResult(await callAPI("/pulse/cohorts/summary")));
// ══════════════════════════════════════════════════════════
// TOOL 6: Cohort Positions (What whales are doing NOW)
// ══════════════════════════════════════════════════════════
server.tool("pulse_cohort_positions", "See what a specific trader cohort is holding RIGHT NOW. For example, get all live positions held by 'money_printer' tier traders or 'leviathan' size wallets. This is real-time whale intelligence.", {
    tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
    tier: tierSchema,
    limit: z.number().min(1).max(200).default(50).describe("Number of positions to return"),
}, async ({ tierType, tier, limit }) => toolResult(await callAPI(`/pulse/cohorts/${tierType}/${tier}/positions`, { limit: String(limit) })));
// ══════════════════════════════════════════════════════════
// TOOL 7: Trader Profile
// ══════════════════════════════════════════════════════════
server.tool("pulse_trader_profile", "Get full profile for any Hyperliquid trader by wallet address. Returns total PnL, trade count, win rate, volume, largest win/loss, first/last trade dates, PnL tier, size tier, and profit factor. Use this for due diligence on any wallet.", {
    address: ethAddressSchema,
}, async ({ address }) => toolResult(await callAPI(`/pulse/trader/${address}`)));
// ══════════════════════════════════════════════════════════
// TOOL 8: Trader Performance
// ══════════════════════════════════════════════════════════
server.tool("pulse_trader_performance", "Get performance comparison for a trader: 30-day vs all-time PnL, trade count, win rate, and trend direction (improving/declining/stable). Use this to evaluate if a trader is currently hot or cooling off.", {
    address: ethAddressSchema,
}, async ({ address }) => toolResult(await callAPI(`/pulse/trader/${address}/performance`)));
// ══════════════════════════════════════════════════════════
// TOOL 9: Price Lookup
// ══════════════════════════════════════════════════════════
server.tool("market_price", "Get current mark price for any trading pair on Hyperliquid. Use standard ticker symbols like BTC, ETH, SOL, etc.", {
    symbol: z.string().min(1).max(20).describe("Trading pair symbol (e.g., BTC, ETH, SOL, DOGE)"),
}, async ({ symbol }) => toolResult(await callAPI(`/market/price/${symbol.toUpperCase()}`)));
// ══════════════════════════════════════════════════════════
// TOOL 10: Wallet Positions
// ══════════════════════════════════════════════════════════
server.tool("market_positions", "Get all open positions for any wallet address on Hyperliquid. Shows current entries, sizes, unrealized PnL, and leverage for each position.", {
    address: ethAddressSchema,
}, async ({ address }) => toolResult(await callAPI(`/market/positions/${address}`)));
// ══════════════════════════════════════════════════════════
// TOOL 11: Recent Trades (Global)
// ══════════════════════════════════════════════════════════
server.tool("pulse_recent_trades", "Get the biggest trades on Hyperliquid in the last N minutes/hours. Returns trades sorted by absolute PnL — the largest movers. Use this to see what's happening right now on the exchange.", {
    since: sinceSchema.default("10m"),
    limit: z.number().min(1).max(100).default(20).describe("Number of trades to return"),
    coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL)"),
}, async ({ since, limit, coin }) => {
    const params = { since, limit: String(limit) };
    if (coin)
        params.coin = coin.toUpperCase();
    return toolResult(await callAPI("/pulse/trades/recent", params));
});
// ══════════════════════════════════════════════════════════
// TOOL 12: Trader Recent Trades
// ══════════════════════════════════════════════════════════
server.tool("pulse_trader_trades", "Get recent trades for a specific wallet address. See exactly what a trader has been doing in the last minutes/hours — every buy, sell, size, price, and PnL. Essential for copy-trading and due diligence.", {
    address: ethAddressSchema,
    since: sinceSchema.default("1h"),
    limit: z.number().min(1).max(100).default(50).describe("Number of trades to return"),
    coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL)"),
}, async ({ address, since, limit, coin }) => {
    const params = { since, limit: String(limit) };
    if (coin)
        params.coin = coin.toUpperCase();
    return toolResult(await callAPI(`/pulse/trader/${address}/trades`, params));
});
// ══════════════════════════════════════════════════════════
// TOOL 13: Cohort Recent Trades
// ══════════════════════════════════════════════════════════
server.tool("pulse_cohort_trades", "See every trade a specific cohort has made recently. For example: 'show me all trades the money_printer tier made in the last hour.' This is real-time alpha — nobody else has this data as an API.", {
    tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
    tier: tierSchema,
    since: sinceSchema.default("1h"),
    limit: z.number().min(1).max(100).default(50).describe("Number of trades to return"),
}, async ({ tierType, tier, since, limit }) => toolResult(await callAPI(`/pulse/cohorts/${tierType}/${tier}/trades`, { since, limit: String(limit) })));
// ══════════════════════════════════════════════════════════
// TOOL 14: Liquidation Heatmap                        [NEW]
// ══════════════════════════════════════════════════════════
server.tool("live_liquidation_heatmap", "Get a liquidation heatmap for any coin. Shows where liquidation clusters are across price levels — essential for identifying support/resistance and potential squeeze zones. Unique data nobody else exposes.", {
    coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL)"),
    buckets: z.number().min(10).max(100).default(50).describe("Number of price buckets in the heatmap"),
    range: z.number().min(1).max(50).default(30).describe("Price range percentage around current price"),
}, async ({ coin, buckets, range }) => toolResult(await callAPI(`/live/liquidation-heatmap/${coin.toUpperCase()}`, {
    buckets: String(buckets),
    range: String(range),
})));
// ══════════════════════════════════════════════════════════
// TOOL 15: Long/Short Ratio                           [NEW]
// ══════════════════════════════════════════════════════════
server.tool("live_long_short_ratio", "Get long/short ratio data. Without a coin, returns the global ratio across all Hyperliquid. With a coin, returns that specific pair's ratio. Optionally include historical data over the last N hours.", {
    coin: z.string().optional().describe("Coin symbol (e.g. BTC, ETH). Omit for global ratio."),
    hours: z.number().min(1).max(168).optional().describe("Include historical data for the last N hours (max 168 = 7 days)"),
}, async ({ coin, hours }) => {
    if (hours) {
        // Historical mode
        const params = { hours: String(hours) };
        if (coin)
            params.coin = coin.toUpperCase();
        return toolResult(await callAPI("/live/long-short/history", params));
    }
    if (coin) {
        return toolResult(await callAPI(`/live/coins/${coin.toUpperCase()}/long-short`));
    }
    return toolResult(await callAPI("/live/long-short"));
});
// ══════════════════════════════════════════════════════════
// TOOL 16: Cohort Bias                                [NEW]
// ══════════════════════════════════════════════════════════
server.tool("live_cohort_bias", "See what each trader cohort is doing on a specific coin RIGHT NOW. Returns the net long/short bias for every tier (money_printer, smart_money, whales, etc.) on the given coin. Answers questions like 'are the smart money traders long or short ETH?'", {
    coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL)"),
}, async ({ coin }) => toolResult(await callAPI(`/live/cohort-bias/${coin.toUpperCase()}`)));
// ══════════════════════════════════════════════════════════
// TOOL 17: Trader Daily Stats                         [NEW]
// ══════════════════════════════════════════════════════════
server.tool("pulse_trader_daily_stats", "Get day-by-day performance breakdown for any trader. Returns daily PnL, trade count, win rate, and volume for each day the trader was active. Use for deep due diligence and identifying consistency patterns.", {
    address: ethAddressSchema,
}, async ({ address }) => toolResult(await callAPI(`/pulse/trader/${address}/daily`)));
// ══════════════════════════════════════════════════════════
// TOOL 18: Biggest Wins & Losses (Global)             [NEW]
// ══════════════════════════════════════════════════════════
server.tool("pulse_biggest_trades", "Get the biggest winning or losing trades across all of Hyperliquid. Use type='wins' for the largest profitable trades, or type='losses' for the largest losses. Useful for market sentiment and narrative analysis.", {
    type: z.enum(["wins", "losses"]).describe("'wins' for biggest profitable trades, 'losses' for biggest losing trades"),
    limit: z.number().min(1).max(50).default(20).describe("Number of trades to return"),
    threshold: z.number().optional().describe("Minimum PnL for wins (e.g. 50000) or maximum PnL for losses (e.g. -50000)"),
}, async ({ type, limit, threshold }) => {
    if (type === "wins") {
        const params = { limit: String(limit) };
        if (threshold !== undefined)
            params.minPnl = String(threshold);
        return toolResult(await callAPI("/pulse/biggest-wins", params));
    }
    else {
        const params = { limit: String(limit) };
        if (threshold !== undefined)
            params.maxPnl = String(threshold);
        return toolResult(await callAPI("/pulse/biggest-losses", params));
    }
});
// ══════════════════════════════════════════════════════════
// TOOL 19: Order Book                                 [NEW]
// ══════════════════════════════════════════════════════════
server.tool("market_orderbook", "Get the order book (bid/ask depth) for any trading pair on Hyperliquid. Shows price levels and sizes on both sides. Essential for understanding liquidity, spread, and potential support/resistance.", {
    symbol: z.string().min(1).max(20).describe("Trading pair symbol (e.g. BTC, ETH, SOL)"),
    depth: z.number().min(1).max(50).default(10).describe("Number of price levels on each side"),
}, async ({ symbol, depth }) => toolResult(await callAPI(`/market/orderbook/${symbol.toUpperCase()}`, { depth: String(depth) })));
// ══════════════════════════════════════════════════════════
// TOOL 20: Token Leaderboard                          [NEW]
// ══════════════════════════════════════════════════════════
server.tool("pulse_token_leaderboard", "Get the top traders for a specific coin. Answers questions like 'who are the best BTC traders?' or 'who profits most from SOL?'. Returns ranked traders with PnL, trade count, win rate, and volume for that specific coin.", {
    coin: z.string().min(1).max(20).describe("Coin symbol (e.g. BTC, ETH, SOL)"),
    limit: z.number().min(1).max(100).default(50).describe("Number of traders to return"),
}, async ({ coin, limit }) => toolResult(await callAPI(`/pulse/token-leaderboard/${coin.toUpperCase()}`, { limit: String(limit) })));
// ══════════════════════════════════════════════════════════
// TOOL 21: Trader Token Stats                         [NEW]
// ══════════════════════════════════════════════════════════
server.tool("pulse_trader_token_stats", "Get token-by-token P&L breakdown for any trader. Shows which coins they trade, their PnL per coin, win rate per coin, and volume per coin. Use to understand a trader's edge — e.g. 'this trader only makes money on ETH and loses on everything else.'", {
    address: ethAddressSchema,
}, async ({ address }) => toolResult(await callAPI(`/pulse/trader/${address}/tokens`)));
// ══════════════════════════════════════════════════════════
// TOOL 22: Most Traded Coins                          [NEW]
// ══════════════════════════════════════════════════════════
server.tool("pulse_most_traded_coins", "Get the most actively traded coins on Hyperliquid, ranked by trade count and volume. Use to understand what the market is focused on right now.", {
    limit: z.number().min(1).max(100).default(20).describe("Number of coins to return"),
}, async ({ limit }) => toolResult(await callAPI("/pulse/most-traded", { limit: String(limit) })));
// ══════════════════════════════════════════════════════════
// TOOL 23: Cohort History                             [NEW]
// ══════════════════════════════════════════════════════════
server.tool("pulse_cohort_history", "Get historical performance data for a specific trader cohort over time. Shows how a tier's aggregate PnL, trade count, and activity have changed day-by-day. Use to spot trends like 'smart_money has been increasingly bearish over the last month.'", {
    tierType: z.enum(["pnl", "size"]).describe("Tier category: 'pnl' for profit tiers, 'size' for volume tiers"),
    tier: tierSchema,
    days: z.number().min(1).max(365).default(30).describe("Number of days of history to return"),
}, async ({ tierType, tier, days }) => toolResult(await callAPI(`/pulse/cohorts/${tierType}/${tier}/history`, { days: String(days) })));
// ══════════════════════════════════════════════════════════
// TOOL 24: Trader Closed Positions                    [NEW]
// ══════════════════════════════════════════════════════════
server.tool("pulse_trader_closed_positions", "Get closed position history for any wallet. Shows every position that was opened and closed — with entry/exit prices, hold duration, PnL, and leverage. Use this to analyze a trader's position lifecycle and timing patterns. Answers: 'Show me all historical positions for this trader', 'What was the PnL and duration of each position?', 'When did this whale close their massive ETH long?'", {
    address: ethAddressSchema,
    limit: z.number().min(1).max(200).default(50).describe("Number of positions to return"),
    offset: z.number().min(0).default(0).describe("Pagination offset"),
    coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL)"),
}, async ({ address, limit, offset, coin }) => {
    const params = { limit: String(limit), offset: String(offset) };
    if (coin)
        params.coin = coin.toUpperCase();
    return toolResult(await callAPI(`/pulse/trader/${address}/closed-positions`, params));
});
// ══════════════════════════════════════════════════════════
// TOOL 25: Trader Closed Position Stats               [NEW]
// ══════════════════════════════════════════════════════════
server.tool("pulse_trader_closed_position_stats", "Get aggregate statistics about a trader's closed positions: average hold duration, win rate by position (not by fill), total positions closed, and PnL summary. Use this to understand how long a trader typically holds and their position-level performance. Answers: 'What is this trader's average hold time?', 'Win rate by position (not by fill)?', 'Is this trader a scalper or swing trader?', 'Average PnL per position?'", {
    address: ethAddressSchema,
}, async ({ address }) => toolResult(await callAPI(`/pulse/trader/${address}/closed-positions/stats`)));
// ══════════════════════════════════════════════════════════
// TOOL 26: Recent Closed Positions (Global)           [NEW]
// ══════════════════════════════════════════════════════════
server.tool("pulse_recent_closed_positions", "Get recently closed positions across all traders. See what positions were just closed in the last N minutes/hours — with entry/exit prices and hold duration. Filterable by coin, minimum notional size, and hold duration range. Use to find: sub-second HFT trades (maxDuration=1000), positions that just got stopped out, large positions that just closed (minNotional=100000), quick scalps vs long holds.", {
    since: sinceSchema.default("1h"),
    limit: z.number().min(1).max(200).default(50).describe("Number of positions to return"),
    coin: z.string().optional().describe("Filter by coin symbol (e.g. BTC, ETH, SOL)"),
    minNotional: z.number().optional().describe("Minimum notional value in USD (e.g. 100000 for $100K+ positions)"),
    minDuration: z.number().optional().describe("Minimum hold duration in milliseconds (e.g. 60000 for positions held at least 1 minute)"),
    maxDuration: z.number().optional().describe("Maximum hold duration in milliseconds (e.g. 1000 for sub-second HFT trades, 60000 for under 1 minute)"),
}, async ({ since, limit, coin, minNotional, minDuration, maxDuration }) => {
    const params = { since, limit: String(limit) };
    if (coin)
        params.coin = coin.toUpperCase();
    if (minNotional != null)
        params.minNotional = String(minNotional);
    if (minDuration != null)
        params.minDuration = String(minDuration);
    if (maxDuration != null)
        params.maxDuration = String(maxDuration);
    return toolResult(await callAPI("/pulse/closed-positions/recent", params));
});
// ─── Start Server ────────────────────────────────────────
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Coinversaa Pulse MCP server running on stdio (26 tools)");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
