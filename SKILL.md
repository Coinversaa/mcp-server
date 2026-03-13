---
name: coinversaa-pulse
description: "Crypto intelligence for AI agents. 7 free tools + 23 premium tools for Hyperliquid trader analytics, behavioral cohorts, live market data, builder dex markets (commodities, stocks, indices), liquidation heatmaps, and whale tracking across 710K+ wallets, 1.8B+ trades, and 369+ markets."
version: 0.4.1
author: Coinversaa <chat@coinversaa.ai>
homepage: https://coinversaa.ai
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
    description: "Your Coinversaa API key (starts with cvsa_). Get one at https://coinversaa.ai/developers. Optional — 7 tools available without a key."
    required: false
  COINVERSAA_API_URL:
    description: "API base URL (defaults to https://staging.api.coinversaa.ai)"
    required: false
---

# Coinversaa Pulse

Crypto intelligence for AI agents. Query 710K+ Hyperliquid wallets, 1.8B+ trades, behavioral cohorts, and live market data through any MCP-compatible client.

This is not a wrapper around a public blockchain API. Coinversaa indexes Hyperliquid's clearinghouse directly and computes analytics that don't exist anywhere else.

**Now with builder dex support** — 369+ markets across 8 dexes including commodities, stocks, indices, and perps.

## Setup

### Option A: Free Tier (No API Key)

Try it instantly — no sign-up needed. 7 tools with rate limits:

| Free Tool | Rate Limit |
|-----------|-----------|
| `pulse_global_stats` | 10/min |
| `pulse_market_overview` | 5/min |
| `list_markets` | 5/min |
| `market_price` | 30/min |
| `market_orderbook` | 10/min |
| `pulse_most_traded_coins` | 5/min |
| `live_long_short_ratio` | 5/min |

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

### Option B: Full Access (API Key — 30 tools)

Get a key at [coinversaa.ai/developers](https://coinversaa.ai/developers) — unlocks all 30 tools with higher rate limits (100 req/min, no daily cap).

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

## Tools (30 total — 7 free, 23 require API key)

### Pulse — Trader Intelligence

Use these tools when the user asks about top traders, market activity, or trading trends.

- **`pulse_global_stats`** — Global Hyperliquid stats: total traders, trades, volume, PnL, data coverage period. Use when asked about overall market scale.
- **`pulse_market_overview`** — Full market state: 24h volume, open interest, mark prices, funding rates, 24h change for every pair. Optional `dex` param to filter by builder dex (hl, xyz, flx, vntl, hyna, km, abcd, cash).
  - Parameters: `dex` (optional)
- **`list_markets`** — Discover all available markets across all dexes. Returns each market's dex, mark price, 24h volume, funding rate, open interest, and 24h change. Use when a user asks "what markets are available?" or mentions a commodity/stock.
  - Parameters: `dex` (optional — filter to a specific builder dex)
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

Coinversaa classifies 710K+ wallets into behavioral tiers. This is unique data nobody else has.

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
- **`live_long_short_ratio`** — Global or per-coin long/short ratio with optional history.
  - Parameters: `coin` (optional), `hours` (optional, 1-168 for history)
- **`live_cohort_bias`** — Net long/short stance for every tier on a given coin.
  - Parameters: `coin`
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

## What Makes This Different

- **Builder dex markets**: 369+ markets across 8 dexes — commodities, stocks, indices, and perps
- **Behavioral cohorts**: 710K wallets classified into PnL tiers (money_printer to giga_rekt) and size tiers (leviathan to shrimp)
- **Live cohort positions**: See what the best traders are holding in real-time
- **Real-time trade feed**: Every trade by any wallet or cohort, queryable by time window
- **Liquidation heatmaps**: Cluster analysis across price levels for any coin
- **Closed position analytics**: Full position lifecycle with hold duration and entry/exit analysis
- **Hidden gem discovery**: Find skilled traders that ranking sites miss
- **1.8B+ trades indexed**: The deepest Hyperliquid dataset available as an API

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

- Website: [coinversaa.ai](https://coinversaa.ai)
- API Docs: [coinversaa.ai/developers](https://coinversaa.ai/developers)
- GitHub: [github.com/coinversaa/mcp-server](https://github.com/coinversaa/mcp-server)
- npm: [@coinversaa/mcp-server](https://www.npmjs.com/package/@coinversaa/mcp-server)
- Support: [chat@coinversaa.ai](mailto:chat@coinversaa.ai)

---

Built by [Coinversaa](https://coinversaa.ai) — Crypto intelligence for AI agents.
