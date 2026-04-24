---
name: coinversaa-pulse
description: "Crypto intelligence for AI agents. 7 free tools + 36 premium tools (43 total) for Hyperliquid trader analytics, behavioral cohorts, syncer-backed risk data, live market data, builder dex markets (commodities, stocks, indices), cross-market asset taxonomy (PAXG↔GOLD, cross-venue OI/bias), liquidation heatmaps, official per-dex OI, and whale tracking across the full Hyperliquid wallet universe. Call pulse_global_stats for live coverage totals."
version: 0.6.0
author: Coinversa <chat@coinversaa.ai>
homepage: https://coinversa.ai
repository: https://github.com/coinversaa/mcp-server
license: MIT
tags:
  - crypto
  - trading
  - hyperliquid
  - market-data
  - defi
  - analytics
  - blockchain
  - whale-tracking
  - builder-dex
  - commodities
  - stocks
  - mcp
env:
  COINVERSAA_API_KEY:
    description: "Your Coinversa API key (starts with cvsa_). Get one at https://coinversa.ai/developers. Optional — 7 tools available without a key."
    required: false
  COINVERSAA_API_URL:
    description: "API base URL (defaults to https://api.coinversa.ai — production)"
    required: false
---

# Coinversa Pulse

Crypto intelligence for AI agents. Query the full Hyperliquid wallet universe with behavioral cohorts, indexed trade history with PnL attribution, and live market data through any MCP-compatible client. For current wallet/trade coverage numbers call `pulse_global_stats`.

This is not a wrapper around a public blockchain API. Coinversa indexes Hyperliquid's clearinghouse directly and computes analytics that don't exist anywhere else.

**Now with builder dex support** — 369+ markets across 8 dexes including commodities, stocks, indices, and perps.

## Setup

### Option A: Free Tier (No API Key)

Try it instantly — no sign-up needed. 7 tools with rate limits:

| Free Tool | Rate Limit |
|-----------|-----------|
| `pulse_global_stats` | 10/min |
| `pulse_market_overview` | 5/min (kept as a deprecated alias for `list_markets`) |
| `list_markets` | 5/min |
| `market_price` | 30/min |
| `market_orderbook` | 10/min |
| `pulse_most_traded_coins` | 5/min |
| `live_long_short_ratio` | 5/min |

The cross-market asset tools (`list_assets`, `list_asset`, `pulse_cross_market_asset`) and `live_official_oi` are **paid-tier** and require an API key. Create a free-tier key in 10 seconds at [coinversa.ai/developers](https://coinversa.ai/developers) to unlock them — free keys are real keys, just not keyless access.

Daily cap: 500 requests/day per IP.

```json
{
  "mcpServers": {
    "coinversaa": {
      "command": "npx",
      "args": ["-y", "@coinversaa/mcp-server"]
    }
  }
}
```

### Option B: Full Access (API Key — 43 tools)

Get a key at [coinversa.ai/developers](https://coinversa.ai/developers) — unlocks all 43 tools with higher rate limits (100 req/min, no daily cap).

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coinversaa": {
      "command": "npx",
      "args": ["-y", "@coinversaa/mcp-server"],
      "env": {
        "COINVERSAA_API_KEY": "cvsa_your_key_here"
      }
    }
  }
}
```

**Cursor** — add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "coinversaa": {
      "command": "npx",
      "args": ["-y", "@coinversaa/mcp-server"],
      "env": {
        "COINVERSAA_API_KEY": "cvsa_your_key_here"
      }
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add coinversaa -- npx -y @coinversaa/mcp-server
export COINVERSAA_API_KEY="cvsa_your_key_here"
```

**OpenClaw**:

```bash
openclaw skill install coinversaa-pulse
```

## Builder Dex Markets

Hyperliquid supports multiple builder dexes beyond the native perps exchange. Each dex has its own markets, collateral token, and symbol format.

| Dex | What it trades | Collateral | Example symbols |
|-----|----------------|------------|-----------------|
| *(native)* | Core perps (crypto) | USDC | BTC, ETH, SOL, HYPE |
| `xyz` | Commodities, stocks, indices | USDC | xyz:GOLD, xyz:SILVER, xyz:TSLA |
| `flx` | Perps | USDH | flx:BTC, flx:ETH |
| `vntl` | Perps | USDH | vntl:ANTHROPIC, vntl:BTC |
| `hyna` | Perps | USDE | hyna:SOL, hyna:BTC |
| `km` | Energy & commodities | USDH | km:OIL, km:NATGAS |
| `abcd` | Misc | USDC | abcd:BITCOIN |
| `cash` | Stocks & equities | USDT0 | cash:TSLA, cash:AAPL |

**Symbol format:**
- Native Hyperliquid: `BTC`, `ETH`, `SOL`
- Builder dex: `prefix:COIN` — e.g. `xyz:GOLD`, `cash:TSLA`, `hyna:SOL`

Use the `list_markets` tool to discover all available symbols and which dex they belong to.

Backend trading note for agentic traders: Coinversaa's backend-signed Hyperliquid orders rely on an approved Hyperliquid agent wallet, not a `vaultAddress`. If the backend signer changes, it must be re-approved on Hyperliquid before orders will succeed. Builder dex orders may also require unified account mode so USDC collateral is shared across supported dexes. For isolated-only markets, omitted `marginMode` now defaults to `isolated`; do not assume `cross` is available on builder dex symbols.

## Assets & Cross-Market Taxonomy

The same underlying asset can appear under different tickers on different venues. Coinversa exposes a **canonical asset registry** so agents and API consumers don't have to reinvent the grouping logic.

**Two concepts:**
- **Canonical** — the economic-exposure identifier. E.g. `GOLD` is gold exposure regardless of venue or ticker.
- **Symbol** — what a specific venue lists it as. E.g. `xyz:GOLD`, `hyna:PAXG`, `BTC`, `flx:BTC`.

**Known synonyms** (ticker → canonical):

| Synonym ticker | Canonical | Reason |
|----------------|-----------|--------|
| `PAXG` | `GOLD` | Paxos-issued gold-backed token, 1:1 gold |
| `XAUT` | `GOLD` | Tether Gold, 1:1 gold |
| `XAGT` | `SILVER` | 1:1 silver-backed token |

**Wrapped-token note:** wrappers like `WBTC`, `WETH`, `stETH`, `wstETH` are **not** aggregated with their native tickers by default because they have meaningfully different risk and liquidity profiles. If you want them treated as synonyms for a specific use case, do so in your client code.

**When to use which tool:**

| Question the user asked | Right tool |
|-------------------------|------------|
| "What markets exist on the xyz dex?" | `list_markets` |
| "What price is xyz:GOLD right now?" | `market_price` |
| "What assets are available?" / "What venues is GOLD on?" / "Show me cross-market assets" | `list_assets` |
| "Tell me about PAXG" / "Where does BTC trade?" | `list_asset` |
| "Is gold more crowded on xyz or hyna?" / "Total OI on BTC across all dexes?" / "Do venues disagree on ETH direction?" | `pulse_cross_market_asset` |

**Asset tools accept both canonical and synonyms.** `list_asset({canonical: "PAXG"})` and `list_asset({canonical: "GOLD"})` return the same asset. The server resolves the synonym for you.

### What `pulse_cross_market_asset` returns

Concrete shape so you know what fields to reach for when summarizing:

```json
{
  "query": "GOLD",
  "resolvedCanonical": "GOLD",
  "asset": {
    "canonical": "GOLD",
    "synonyms": ["GOLD", "PAXG"],
    "crossMarket": true,
    "venueCount": 6
  },
  "aggregate": {
    "totalOpenInterest": 190131959,
    "totalVolume24h": 46282352,
    "totalPositions": 5927,
    "longPositions": 3764,
    "shortPositions": 2163,
    "longNotional": 95822523,
    "shortNotional": 94309436,
    "netBias": 0.27,
    "biasRange": 0.61,
    "totalUnrealizedPnl": -1332374,
    "totalUniqueWallets": 5927
  },
  "venues": [
    { "dex": "xyz",  "symbol": "xyz:GOLD", "openInterest": 149105646, "netBias": 0.24, "longPositions": 2400, ... },
    { "dex": "hl",   "symbol": "PAXG",     "openInterest": 38946540,  "netBias": 0.41, ... },
    { "dex": "cash", "symbol": "cash:GOLD","openInterest": 1284058,   ... },
    ...
  ]
}
```

**What the key fields mean for your answer:**
- `aggregate.netBias` ∈ `[-1, 1]` — positive = long-heavy, negative = short-heavy, magnitude = conviction.
- `aggregate.biasRange` — spread between venues. `0.61` means one venue is +X and another is +X−0.61. High values (>0.3) = venues disagree meaningfully; flag this in your reply.
- `asset.synonyms` — list every ticker that mapped into this canonical. Helps you phrase things like *"Gold trades as GOLD on xyz and PAXG on native HL..."*
- `venues` is sorted by OI descending, so the first entry is the dominant venue.

## Tools (43 total — 7 free keyless, 36 require an API key)

## Risk Tools Freshness

Syncer-backed risk tools such as `live_risk_overview`, `live_coin_risk_snapshot`, `live_coin_risk_history`, `live_mark_dislocations`, `live_recent_liquidations`, `live_liquidation_summary`, `live_oi_history`, and `live_cohort_bias_history` are best treated as **beta recent-intelligence tools**. For venue ground truth on OI, use `live_official_oi` (pulled directly from Hyperliquid's Info API) as a cross-check.

- Best for research, LLM training, liquidation analysis, OI trend work, and crowding detection
- Best queried over recent windows like `7d` or `30d`
- Freshness depends on sync coverage and may lag real time
- Do not treat them as guaranteed live execution truth or exact historical accounting

## How AI Agents Use The Risk Tools

These tools are useful when the user wants market-structure answers, not just raw rows.

| Goal | Best tools | What they help answer |
|------|------------|-----------------------|
| Detect risk now | `live_risk_overview`, `live_coin_risk_snapshot` | "What looks fragile right now?", "Is this coin crowded?", "Who is holding the risk?" |
| Explain recent stress | `live_recent_liquidations`, `live_liquidation_summary`, `live_mark_dislocations` | "What got liquidated?", "Did basis stress show up before the unwind?", "Was this move liquidation-driven?" |
| Track regime change | `live_coin_risk_history`, `live_oi_history`, `live_cohort_bias_history` | "Did OI build into this move?", "Did smart money rotate early?", "How did the setup change over the last month?" |

For agent UX, prefer recent windows like `7d` or `30d` and summarize outputs in plain language instead of dumping all rows unless the user asks for raw detail.

For `market_recent_candles`, keep requests short and recent. The MCP tool intentionally caps one-minute candle responses at 720 rows (12h) so agents do not pull massive minute-bar dumps in a single call.

### Pulse — Trader Intelligence

Use these tools when the user asks about top traders, market activity, or trading trends.

- **`pulse_global_stats`** — Global Hyperliquid stats: total traders, trades, volume, PnL, data coverage period. Use when asked about overall market scale.
- **`list_markets`** — Canonical market discovery tool. Returns every trading symbol with its dex, mark price, 24h volume, funding rate, open interest, and 24h change. Use whenever the user asks "what markets are available?" or mentions a commodity, stock, or builder dex. For asset-level cross-venue grouping use `list_assets` instead.
  - Parameters: `dex` (optional — filter to a specific builder dex)
- **`pulse_market_overview`** — **DEPRECATED alias** for `list_markets`. Same endpoint, same payload. Kept only for backward compatibility; prefer `list_markets` in new integrations.
  - Parameters: `dex` (optional)
- **`list_assets`** — Canonical asset directory: every asset grouped by economic exposure (not venue ticker). Each entry has synonyms, venues, aggregated open interest, and a cross-market flag (listed on 2+ venues). Prefer this over `list_markets` when the user asks about **assets** rather than markets, or when they want cross-venue availability. **[API key required]**
  - Parameters: `crossMarketOnly` (optional boolean — return only assets on 2+ venues)
- **`list_asset`** — Single canonical asset lookup with full venue breakdown. Accepts canonical names (`GOLD`) or synonyms (`PAXG`) — the server resolves synonyms. Returns every venue where the asset trades, the collateral token per venue, and OI/volume per venue. **[API key required]**
  - Parameters: `canonical` (required — e.g. `GOLD`, `PAXG`, `BTC`)
- **`pulse_cross_market_asset`** — Aggregated cross-market view for one asset: per-venue long/short positions, notional, net bias, unique wallets, leverage, plus a cross-venue total and `biasRange` (max-min netBias across venues — high values mean venues disagree on direction). This is the agent-native answer to "is GOLD crowded?", "do dexes disagree on BTC?", "total OI on ETH across all venues?". Accepts canonical or synonym. **[API key required]**
  - Parameters: `canonical` (required — e.g. `GOLD`, `PAXG`, `BTC`)
- **`pulse_leaderboard`** — Ranked trader leaderboard. Sort by `pnl`, `winrate`, `volume`, `score`, `risk-adjusted`, or `losers`. Filter by period (`day`/`week`/`month`/`allTime`) and minimum trades.
  - Parameters: `sort`, `period`, `limit` (1-100), `minTrades`
- **`pulse_hidden_gems`** — Underrated high-performers most platforms miss. Filter by min win rate, PnL, trade count.
  - Parameters: `minWinRate`, `minPnl`, `minTrades`, `maxTrades`, `limit` (1-100)
- **`pulse_most_traded_coins`** — Most actively traded coins ranked by volume and trade count.
  - Parameters: `limit` (1-100)
- **`pulse_biggest_trades`** — Biggest winning or losing trades across all of Hyperliquid.
  - Parameters: `type` (`wins`/`losses`), `limit` (1-50), `threshold`
- **`pulse_recent_trades`** — Biggest trades in the last N minutes/hours sorted by absolute PnL.
  - Parameters: `since` (e.g. `10m`, `1h`, `1d`), `limit` (1-100), `coin` (optional)
- **`pulse_token_leaderboard`** — Top traders for a specific coin.
  - Parameters: `coin`, `limit` (1-100)
- **`market_historical_oi`** — Historical hourly open interest snapshots (notional USD). Supports per-coin filtering or global aggregate.
  - Parameters: `coin` (optional), `since` (max 30d), `startTime` (optional), `endTime` (optional)
- **`market_recent_candles`** — Recent 1-minute candles for a market. Useful for short intraday structure checks, recent momentum, and micro-pullback analysis. Intentionally capped to the last 12 hours to keep MCP responses practical.
  - Parameters: `symbol`, `limit` (1-720)

### Pulse — Trader Profiles

Use these tools for deep dives on specific wallets. Any tool taking `address` expects a full Ethereum address (0x + 40 hex chars).

- **`pulse_trader_profile`** — Full due diligence: total PnL, trade count, win rate, volume, largest win/loss, first/last trade dates, PnL tier, size tier, profit factor.
  - Parameters: `address`
- **`pulse_trader_performance`** — 30-day vs all-time comparison with trend direction (improving/declining/stable).
  - Parameters: `address`
- **`pulse_trader_trades`** — Recent trades for any wallet: every buy, sell, size, price, PnL.
  - Parameters: `address`, `since`, `limit` (1-100), `coin` (optional)
- **`pulse_trader_daily_stats`** — Day-by-day PnL, trade count, win rate, volume.
  - Parameters: `address`
- **`pulse_trader_token_stats`** — Per-coin P&L breakdown.
  - Parameters: `address`
- **`pulse_trader_closed_positions`** — Full position history: entry/exit prices, hold duration, PnL, leverage.
  - Parameters: `address`, `limit` (1-200), `offset`, `coin` (optional)
- **`pulse_trader_closed_position_stats`** — Aggregate closed position stats: avg hold duration, position win rate, total closed, PnL summary.
  - Parameters: `address`

### Pulse — Cohort Intelligence

Coinversa classifies every tracked Hyperliquid wallet into behavioral tiers. This is unique data nobody else has. Call `pulse_global_stats` first if you need the current tracked-wallet count.

**PnL tiers** (by profitability): `money_printer`, `smart_money`, `grinder`, `humble_earner`, `exit_liquidity`, `semi_rekt`, `full_rekt`, `giga_rekt`

**Size tiers** (by volume): `leviathan`, `tidal_whale`, `whale`, `small_whale`, `apex_predator`, `dolphin`, `fish`, `shrimp`

- **`pulse_cohort_summary`** — Full behavioral breakdown across all wallets. Each tier shows wallet count, avg PnL, avg win rate, total volume.
- **`pulse_cohort_positions`** — What a specific cohort is holding RIGHT NOW.
  - Parameters: `tierType` (`pnl`/`size`), `tier`, `limit` (1-200)
- **`pulse_cohort_trades`** — Every trade a cohort made in a time window.
  - Parameters: `tierType`, `tier`, `since`, `limit` (1-100)
- **`pulse_cohort_history`** — Day-by-day historical performance for a cohort.
  - Parameters: `tierType`, `tier`, `days` (1-365)
- **`pulse_cohort_bias_history`** — Historical hourly bias snapshots for all trader cohorts.
  - Parameters: `coin` (optional), `since` (max 30d), `startTime`, `endTime`
- **`pulse_cohort_performance_daily`** — Historical daily performance stats for all cohorts.
  - Parameters: `since` (max 30d), `startTime`, `endTime`

### Market — Live Data

Real-time market data directly from Hyperliquid.

- **`market_price`** — Current mark price for any symbol (native or builder dex, e.g. BTC, xyz:GOLD).
  - Parameters: `symbol`
- **`market_positions`** — All open positions for any wallet with entries, sizes, unrealized PnL, leverage.
  - Parameters: `address`
- **`market_orderbook`** — Bid/ask depth for any pair.
  - Parameters: `symbol`, `depth` (1-50)

### Live — Real-Time Analytics

Derived analytics computed in real-time.

- **`live_liquidation_heatmap`** — Liquidation clusters across price levels for any coin.
  - Parameters: `coin`, `buckets` (10-100), `range` (1-50% around current price)
- **`live_risk_overview`** — Exchange-wide risk snapshot: OI, leverage, crowding concentration, near-liquidation exposure, and 7-day liquidation totals.
- **`live_coin_risk_snapshot`** — Current risk snapshot for a single coin: OI, wallet count, concentration, top positions, liquidation heatmap, and recent liquidations.
  - Parameters: `coin`
- **`live_coin_risk_history`** — Historical risk lane for a coin: OI, long/short, cohort rotation, candles, dislocations, and liquidation flow.
  - Parameters: `coin`, `hours` (1-720)
- **`live_mark_dislocations`** — Historical mark/oracle dislocation series for a coin with mark price, oracle price, and basis percentage.
  - Parameters: `coin`, `hours` (1-720)
- **`live_recent_liquidations`** — Real liquidation events from the syncer with wallet, coin, penalty fee, and closed PnL.
  - Parameters: `since`, `coin` (optional), `limit` (1-200)
- **`live_liquidation_summary`** — Aggregated liquidation stats over a window with by-coin rollups and timeline buckets.
  - Parameters: `since`, `coin` (optional)
- **`live_long_short_ratio`** — Global or per-coin long/short ratio with optional history.
  - Parameters: `coin` (optional), `hours` (optional, 1-168 for history)
- **`live_cohort_bias`** — Net long/short stance for every tier on a given coin.
  - Parameters: `coin`
- **`live_oi_history`** — Historical open interest for any coin or global, using hourly snapshots up to 30 days. Our derived OI from `live_positions`.
  - Parameters: `coin` (optional), `hours` (1-720)
- **`live_official_oi`** — **Official per-dex open interest** for a coin, pulled from Hyperliquid's Info API (not derived). Returns hourly snapshots with OI, mark price, and 24h notional volume per venue. Use when the agent needs venue-reported ground truth, per-dex breakdowns, or wants to cross-check `live_oi_history` against official numbers. **[API key required]**
  - Parameters: `coin` (required), `hours` (1-720, default 168), `dex` (optional, defaults to `hl`)
- **`live_cohort_bias_history`** — Historical hourly long/short bias shifts for a specific coin across all cohorts or a single tier.
  - Parameters: `coin`, `tierType`, `tier` (optional), `hours` (1-720)
- **`pulse_recent_closed_positions`** — Positions just closed across all traders. Filterable by coin, size, and hold duration.
  - Parameters: `since`, `limit` (1-200), `coin`, `minNotional`, `minDuration`, `maxDuration`

## Example Prompts

Once connected, try asking your AI:

- "What are the top 5 traders on Hyperliquid by PnL?"
- "Show me what the money_printer tier is holding right now"
- "What are the biggest trades in the last 10 minutes?"
- "Find underrated traders with 70%+ win rate"
- "Do a deep dive on wallet 0x7fda...7d1 — are they still performing?"
- "Where are the BTC liquidation clusters?"
- "Show me the exchange-wide risk overview on Hyperliquid this week"
- "Which coin looks the most crowded right now?"
- "Show me ETH liquidation events from the last 7 days"
- "Give me BTC risk history with OI, liquidations, and cohort rotation"
- "Are smart money traders long or short ETH right now?"
- "What coins are most actively traded right now?"
- "Show me the biggest losses in the last 24 hours"
- "Is this trader a scalper or swing trader? What's their average hold time?"
- "Which coins does this trader actually make money on?"
- "What did the whale tier trade in the last hour?"
- "Compare this trader's last 30 days to their all-time performance"
- "What markets are available on the xyz dex?"
- "Show me all commodity markets (gold, silver, oil)"
- "What's the price of xyz:GOLD?"
- "List all builder dex markets"
- "What stocks can I trade on Hyperliquid?"
- "Which venues trade gold? Is PAXG the same as GOLD?"
- "Show me every cross-market asset (listed on 2+ dexes)"
- "Total open interest on BTC across all dexes?"
- "Is BTC more crowded on hyna or native HL?"
- "Do different dexes disagree on ETH direction right now?"

## What Makes This Different

- **Canonical cross-market taxonomy**: One asset, many venues, many tickers. `list_assets` / `list_asset` / `pulse_cross_market_asset` resolve synonyms (PAXG↔GOLD, XAUT↔GOLD, XAGT↔SILVER) and aggregate OI, bias, and positions across venues — server-side, no client grouping required.
- **Builder dex markets**: 369+ markets across 8 dexes — commodities, stocks, indices, and perps
- **Behavioral cohorts**: every tracked wallet classified into PnL tiers (money_printer to giga_rekt) and size tiers (leviathan to shrimp)
- **Live cohort positions**: See what the best traders are holding in real-time
- **Real-time trade feed**: Every trade by any wallet or cohort, queryable by time window
- **Liquidation heatmaps**: Cluster analysis across price levels for any coin
- **Closed position analytics**: Full position lifecycle with hold duration and entry/exit analysis
- **Hidden gem discovery**: Find skilled traders that ranking sites miss
- **Deepest Hyperliquid trade history available as an API**: call `pulse_global_stats` for current indexed trade and wallet counts — kept current, not a stale marketing figure.

## Rate Limits

**Free tier:** Per-route limits (5-30/min) + 500 requests/day per IP. See the table in Setup for details.

**Paid tier (API key):** 100 requests/minute, no daily cap.

Rate limit headers are included in every response:
- `X-RateLimit-Limit`: your configured limit
- `X-RateLimit-Remaining`: requests left in current window
- `X-RateLimit-Reset`: seconds until window resets
- `X-RateLimit-Tier`: `free` or `paid`
- `X-RateLimit-Daily-Remaining`: (free tier only) requests left today

## Links

- Website: [coinversa.ai](https://coinversa.ai)
- API Docs: [coinversa.ai/developers](https://coinversa.ai/developers)
- GitHub: [github.com/coinversaa/mcp-server](https://github.com/coinversaa/mcp-server)
- npm: [@coinversaa/mcp-server](https://www.npmjs.com/package/@coinversaa/mcp-server)
- Support: [chat@coinversaa.ai](mailto:chat@coinversaa.ai)

---

Built by [Coinversa](https://coinversa.ai) — Crypto intelligence for AI agents.
