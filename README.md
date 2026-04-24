# Coinversa Pulse — MCP Server

<a href="https://glama.ai/mcp/servers/Coinversaa/mcp-server"><img src="https://glama.ai/mcp/servers/Coinversaa/mcp-server/badge" alt="MCP Server" /></a>

Crypto intelligence for AI agents. Query the full Hyperliquid wallet universe, indexed trade history with PnL attribution, behavioral cohorts, and live market data through any MCP-compatible client. Call `pulse_global_stats` to see exact current coverage (tracked wallets, indexed trades, volume, PnL, data window).

**Now with builder dex support** — trade commodities (gold, silver, oil), stocks (TSLA, AAPL), and perps across 8 dexes and 369+ markets.

## What's new in 0.6.0

**Canonical cross-market asset taxonomy.** The same underlying asset can appear under different tickers on different venues (e.g. `GOLD` on xyz, `PAXG` on native Hyperliquid — both track gold). v0.6.0 adds 3 new tools that resolve synonyms server-side and aggregate across venues, plus a ground-truth OI tool:

| New tool | What it answers |
|----------|-----------------|
| `list_assets` | "What assets are available? Which are listed on 2+ venues?" |
| `list_asset` | "Where does GOLD trade? Is PAXG the same as GOLD?" |
| `pulse_cross_market_asset` | "Is gold more crowded on xyz or hyna? Do dexes disagree on BTC direction?" |
| `live_official_oi` | "What does Hyperliquid itself report for BTC OI — do our numbers match?" |

Synonyms baked in: `PAXG → GOLD`, `XAUT → GOLD`, `XAGT → SILVER`. Prefix grouping (`BTC` ≡ `flx:BTC` ≡ `hyna:BTC`) works automatically.

Tool count: **39 → 43**. Free tier remains **7 keyless tools**. The new tools require an API key — a free-tier key from [coinversa.ai/developers](https://coinversa.ai/developers) takes 10 seconds to create and unlocks them.

Other 0.6.0 housekeeping: default API URL points at production; removed stale hard-coded "710K+ wallets / 1.8B+ trades" marketing figures (call `pulse_global_stats` for current coverage); `pulse_market_overview` kept as a deprecated alias for the canonical `list_markets`.

## Quick Start

### Option A: Free Tier (No API Key)

Try it instantly — no sign-up needed. 7 keyless tools with rate limits:

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

For all 43 tools and higher rate limits, get an API key (Option B).

### Option B: Full Access (API Key)

Get a key at [coinversa.ai/developers](https://coinversa.ai/developers) or email [chat@coinversaa.ai](mailto:chat@coinversaa.ai).

#### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

#### Cursor

Add to `.cursor/mcp.json` in your project root:

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

#### Claude Code

```bash
claude mcp add coinversaa -- npx -y @coinversaa/mcp-server
```

Set the env var in your shell:
```bash
export COINVERSAA_API_KEY="cvsa_your_key_here"
```

That's it. No cloning, no building — `npx` handles everything.

## Builder Dex Markets

Hyperliquid supports multiple builder dexes beyond the native perps exchange. Each dex has its own set of markets, collateral token, and symbol format.

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
- Native Hyperliquid symbols: `BTC`, `ETH`, `SOL`
- Builder dex symbols: `prefix:COIN` — e.g. `xyz:GOLD`, `cash:TSLA`, `hyna:SOL`

Use the `list_markets` tool to discover all available symbols and which dex they belong to.

Backend trading note for agentic traders: Coinversaa's backend-signed Hyperliquid orders use an approved Hyperliquid agent wallet, not a `vaultAddress`. If the backend signer changes, re-approve that signer on Hyperliquid before submitting orders. Builder dex orders may also require unified account mode so USDC collateral is shared across supported dexes. For isolated-only markets, omitted `marginMode` now defaults to `isolated`; do not assume `cross` is available on builder dex symbols.
Frontend account-mode note: the app can now prepare a user-signed abstraction change via `POST /api/v1/hyperliquid/prepare-abstraction`, which lets the user enable or disable Unified Account mode without leaving Coinversa. Hyperliquid may still reject a transition for exchange-side reasons.

## Cross-Market Asset Taxonomy

The same underlying asset can appear under different tickers on different venues (e.g. `GOLD` on xyz and `PAXG` on hyna both track gold). Coinversa exposes a **canonical asset registry** so you don't have to reinvent the grouping.

- **Canonical** — the economic-exposure identifier (`GOLD`, `BTC`, `ETH`).
- **Symbol** — what a venue lists it as (`xyz:GOLD`, `hyna:PAXG`, `BTC`, `flx:BTC`).
- **Synonyms** (ticker → canonical): `PAXG → GOLD`, `XAUT → GOLD`, `XAGT → SILVER`.

Use `list_assets` / `list_asset` / `pulse_cross_market_asset` for anything asset-level (venue availability, cross-venue OI, cross-venue bias disagreement). Use `list_markets` / `market_price` for single-venue queries.

**How grouping works:**
- Same ticker across venues (`BTC`, `flx:BTC`, `hyna:BTC`) → automatically grouped under canonical `BTC`. Zero-config.
- Different ticker, same exposure (`PAXG` and `GOLD` both track 1 oz gold) → resolved via the synonym table above.
- Wrapped or staked variants (`WBTC`, `WETH`, `stETH`, `wstETH`) → **not** aggregated by default. They have different risk profiles and liquidity; treat them as independent assets.

**Example: what "GOLD" looks like aggregated** (live snapshot, April 2026):
- 6 venues: `xyz:GOLD` ($149M OI dominant), `PAXG` (native HL, $39M), `cash:GOLD`, `km:GOLD`, `flx:GOLD`, `hyna:GOLD`
- `netBias: 0.27` — moderately long across venues
- `biasRange: 0.61` — venues disagree strongly on strength of conviction (worth flagging in any answer)
- `synonyms: ["GOLD", "PAXG"]` — confirms PAXG was correctly merged into canonical GOLD

Numbers are illustrative — call `pulse_cross_market_asset` with `canonical: "GOLD"` for current values.

### Backend dependency

The 3 asset tools call `/api/public/v1/assets*` endpoints on the production Coinversa backend (`https://api.coinversa.ai`). Self-hosted or forked setups need to run a backend that exposes these routes; see the Coinversa backend repo for the reference implementation.

## Available Tools (43)

### Free Tier (No API Key Required)

These 7 tools work without an API key, with IP-based rate limits:

| Tool | Rate Limit | Description |
|------|-----------|-------------|
| `pulse_global_stats` | 10/min | Total traders, trades, volume across Hyperliquid (call this for current coverage numbers) |
| `list_markets` | 5/min | Every trading symbol with dex, price, volume, OI |
| `pulse_market_overview` | 5/min | Deprecated alias for `list_markets` — kept for backward compatibility |
| `market_price` | 30/min | Current mark price for any symbol |
| `market_orderbook` | 10/min | Bid/ask depth for any trading pair |
| `pulse_most_traded_coins` | 5/min | Most actively traded coins by volume |
| `live_long_short_ratio` | 5/min | Global or per-coin long/short ratio |

Daily cap: 500 requests/day per IP.

**Cross-market asset tools and `live_official_oi` require an API key** — even a free-tier one. Grab one from [coinversa.ai/developers](https://coinversa.ai/developers) in 10 seconds.

### Full Access (API Key Required — 36 additional tools)

All 43 tools with 100 req/min per key. Includes cross-market asset taxonomy, trader profiles, cohort intelligence, syncer-backed risk routes, closed positions, historical analytics, official per-dex OI, and more.

### Risk Tools Freshness

Syncer-backed risk tools such as `live_risk_overview`, `live_coin_risk_snapshot`, `live_coin_risk_history`, `live_mark_dislocations`, `live_recent_liquidations`, `live_liquidation_summary`, `live_oi_history`, and `live_cohort_bias_history` are best treated as **beta recent-intelligence tools**. For venue ground-truth OI, `live_official_oi` pulls directly from Hyperliquid's Info API as a cross-check.

- Best for research, LLM training, liquidation analysis, OI trend work, and crowding detection
- Best queried over recent windows like `7d` or `30d`
- Freshness depends on sync coverage and may lag real time
- Do not treat them as guaranteed live execution truth or exact historical accounting

For `market_recent_candles`, keep requests short and recent. The MCP tool intentionally caps one-minute candle responses at 720 rows (12h) so agents do not pull massive minute-bar dumps in a single call.

### How AI Agents Use The Risk Tools

These risk tools are meant to help an AI answer market-structure questions clearly, not just dump raw rows.

| Goal | Best tools | Questions an AI can answer |
|------|------------|----------------------------|
| Detect risk now | `live_risk_overview`, `live_coin_risk_snapshot` | "What looks fragile right now?", "Is BTC crowded?", "Which coin is closest to forced unwinds?" |
| Explain recent stress | `live_recent_liquidations`, `live_liquidation_summary`, `live_mark_dislocations` | "Where did forced unwind activity hit?", "Did basis stress show up before liquidations?", "What got liquidated over the last 30 days?" |
| Track regime change | `live_coin_risk_history`, `live_oi_history`, `live_cohort_bias_history` | "Did OI build into this move?", "Were smart-money cohorts rotating first?", "How did this setup become fragile over time?" |

In practice, a Claude-style agent can use them to move from:

- raw question: "What do you think about BTC?"
- better answer: "BTC OI has been building, liquidations picked up, smart-money bias faded, and basis stress widened late in the move."

### Pulse — Trader Intelligence

| Tool | Description |
|------|-------------|
| `pulse_global_stats` | Total traders, trades, volume, PnL across Hyperliquid — call this for current coverage numbers |
| `list_markets` | Canonical market discovery — every symbol with dex, price, volume, funding rate, OI |
| `pulse_market_overview` | Deprecated alias for `list_markets` (same payload) |
| `pulse_leaderboard` | Top traders ranked by PnL, win rate, volume, score, or risk-adjusted returns |
| `pulse_hidden_gems` | Underrated high-performers most platforms miss |
| `pulse_most_traded_coins` | Most actively traded coins ranked by volume and trade count |
| `pulse_biggest_trades` | Biggest winning or losing trades across all of Hyperliquid |
| `pulse_recent_trades` | Biggest trades in the last N minutes/hours |
| `pulse_token_leaderboard` | Top traders for a specific coin |

### Assets — Canonical Cross-Market (v0.6.0)

One asset, many venues, many tickers. Server-side resolution of synonyms (PAXG↔GOLD, XAUT↔GOLD, XAGT↔SILVER) and venue prefixes (`BTC` ≡ `flx:BTC` ≡ `hyna:BTC`). All three require an API key.

| Tool | Description |
|------|-------------|
| `list_assets` | Directory of canonical assets — every asset grouped by economic exposure, with venues, synonyms, and a cross-market flag. Use `crossMarketOnly: true` to filter to multi-venue assets. |
| `list_asset` | Single canonical lookup with venue breakdown. Accepts synonyms — `list_asset({canonical: "PAXG"})` returns the GOLD asset. |
| `pulse_cross_market_asset` | Aggregated per-venue long/short/bias/OI for one asset, plus cross-venue totals and a `biasRange` metric (venues agree vs disagree on direction). The agent-native answer to "is X crowded?" and "do venues disagree on Y?". |

### Pulse — Trader Profiles

| Tool | Description |
|------|-------------|
| `pulse_trader_profile` | Full due diligence on any wallet (PnL, win rate, tiers, profit factor) |
| `pulse_trader_performance` | 30-day vs all-time comparison with trend direction |
| `pulse_trader_trades` | Recent trades for any wallet — the copy-trading signal |
| `pulse_trader_daily_stats` | Day-by-day PnL, win rate, and volume breakdown |
| `pulse_trader_token_stats` | Per-coin P&L breakdown (find a trader's edge) |
| `pulse_trader_closed_positions` | Historical position lifecycle — entry/exit prices, hold duration, PnL |
| `pulse_trader_closed_position_stats` | Aggregate stats: avg hold time, position win rate, scalper vs swing |

### Pulse — Cohort Intelligence

Every tracked Hyperliquid wallet classified into behavioral tiers — unique data nobody else has. For the current tracked-wallet count, call `pulse_global_stats`.

**PnL tiers** (by profitability): `money_printer`, `smart_money`, `grinder`, `humble_earner`, `exit_liquidity`, `semi_rekt`, `full_rekt`, `giga_rekt`

**Size tiers** (by volume): `leviathan`, `tidal_whale`, `whale`, `small_whale`, `apex_predator`, `dolphin`, `fish`, `shrimp`

| Tool | Description |
|------|-------------|
| `pulse_cohort_summary` | Behavioral tier breakdown across every tracked wallet |
| `pulse_cohort_positions` | What money_printers / whales are holding RIGHT NOW |
| `pulse_cohort_trades` | Every trade a cohort made in the last N minutes/hours |
| `pulse_cohort_history` | Historical performance trends for any cohort |
| `pulse_cohort_bias_history` | Historical hourly bias snapshots for all cohorts |
| `pulse_cohort_performance_daily` | Historical daily performance stats for all cohorts |

### Market — Live Data

| Tool | Description |
|------|-------------|
| `market_price` | Current mark price for any symbol (native or builder dex) |
| `market_positions` | Open positions for any wallet |
| `market_orderbook` | Bid/ask depth for any trading pair |
| `market_historical_oi` | Historical hourly open interest snapshots (notional USD) |
| `market_recent_candles` | Recent 1-minute candles for a market, capped to the last 12 hours to keep MCP responses practical |

### Live — Real-Time Analytics

| Tool | Description |
|------|-------------|
| `live_liquidation_heatmap` | Liquidation clusters across price levels — support/resistance signals |
| `live_risk_overview` | Exchange-wide risk snapshot: OI, leverage, crowding, near-liquidation exposure, and 7-day liquidation totals |
| `live_coin_risk_snapshot` | Current single-coin fragility snapshot: OI, crowding, top positions, liquidation heatmap, and 7-day stress |
| `live_coin_risk_history` | Multi-lane history for a coin: OI, long/short, cohort rotation, candles, dislocations, and liquidation flow |
| `live_mark_dislocations` | Mark/oracle dislocation history for a coin — useful for spotting basis stress before or during unwinds |
| `live_recent_liquidations` | Real syncer liquidation events with wallet, coin, penalty fee, and closed PnL |
| `live_liquidation_summary` | Best liquidation summary tool: counts, totals, by-coin rollups, and timeline buckets |
| `live_long_short_ratio` | Global or per-coin long/short ratio with optional history |
| `live_cohort_bias` | Net long/short stance for every tier on a given coin |
| `live_oi_history` | Historical open interest for any coin or global — hourly snapshots up to 30 days (our derived OI) |
| `live_official_oi` | **Official per-dex OI** pulled from Hyperliquid's Info API (venue ground truth, not derived) — hourly snapshots up to 30 days |
| `live_cohort_bias_history` | How each cohort's long/short bias evolved over time — useful for tracking smart-money rotation |
| `pulse_recent_closed_positions` | Positions just closed across all traders with entry/exit data |

## Example Prompts

Once connected, try asking your AI:

- "What are the top 5 traders on Hyperliquid by PnL?"
- "Show me what the money_printer tier is holding right now"
- "What are the biggest trades in the last 10 minutes?"
- "What did wallet 0x7fda...7d1 trade in the last hour?"
- "Find underrated traders with 70%+ win rate"
- "Do a deep dive on wallet 0x7fda...7d1 — are they still performing?"
- "Where are the BTC liquidation clusters?"
- "Show me the exchange-wide risk overview on Hyperliquid this week"
- "Which coin looks the most crowded right now?"
- "Show me ETH liquidation events from the last 7 days"
- "Give me BTC risk history with OI, liquidations, and cohort rotation"
- "Show me BTC mark/oracle dislocations for the last 30 days"
- "Are smart money traders long or short ETH right now?"
- "Show me the biggest losses in the last 24 hours"
- "What coins are most actively traded right now?"
- "What's this trader's average hold time and position win rate?"
- "What markets are available on the xyz dex?"
- "Show me all gold and silver markets"
- "What's the price of xyz:GOLD?"
- "List all builder dex markets with their prices"
- "What stocks can I trade on Hyperliquid?"
- "Show me the last 240 one-minute candles for BTC"
- "Is PAXG the same as GOLD? Which venues list it?"
- "Show me every asset that trades on 2+ dexes"
- "Total open interest on BTC across all dexes right now"
- "Is ETH more crowded on HYNA or native Hyperliquid?"
- "Do the dexes disagree on gold direction?"
- "What does Hyperliquid's own Info API say BTC OI is — does it match our number?"

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COINVERSAA_API_KEY` | No | — | Your API key (starts with `cvsa_`). Without it, only the 7 keyless free tools are available. |
| `COINVERSAA_API_URL` | No | `https://api.coinversa.ai` | Override the API host. Only needed if you operate your own Coinversa backend (self-hosted or fork). |

## Rate Limits

**Free tier:** Per-route limits (5-30/min) + 500 requests/day per IP. See the free tier table for details.

**Paid tier (API key):** 100 requests/minute, no daily cap.

Rate limit headers are included in every response:
- `X-RateLimit-Limit`: your configured limit
- `X-RateLimit-Remaining`: requests left in current window
- `X-RateLimit-Reset`: seconds until window resets
- `X-RateLimit-Tier`: `free` or `paid`
- `X-RateLimit-Daily-Remaining`: (free tier only) requests left today

## Development

```bash
git clone https://github.com/coinversaa/mcp-server.git
cd mcp-server
npm install
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector build/index.js
```

## What Makes This Different

This isn't a wrapper around a public blockchain API. Coinversa indexes Hyperliquid's clearinghouse directly and computes analytics that don't exist anywhere else:

- **Canonical cross-market taxonomy**: one asset, many venues, many tickers. `list_assets` / `list_asset` / `pulse_cross_market_asset` resolve synonyms (PAXG↔GOLD, XAUT↔GOLD, XAGT↔SILVER) and aggregate OI, bias, and positions across venues — server-side, no client grouping required
- **Builder dex markets**: Access 369+ markets across 8 dexes — commodities, stocks, indices, and perps
- **Venue ground-truth OI**: `live_official_oi` pulls directly from Hyperliquid's Info API, cross-checkable against our derived numbers
- **Behavioral cohorts**: every tracked wallet classified into PnL tiers (money_printer to giga_rekt) and size tiers (leviathan to shrimp)
- **Live cohort positions**: See what the best traders are holding in real-time
- **Real-time trade feed**: Every trade by any wallet or cohort, queryable by time window
- **Liquidation heatmaps**: Cluster analysis across price levels for any coin
- **Closed position analytics**: Full position lifecycle with hold duration and entry/exit analysis
- **Hidden gem discovery**: Find skilled traders that ranking sites miss
- **Open interest history**: Hourly OI snapshots for any coin, up to 30 days back
- **Cohort bias history**: Track how smart money, whales, and other tiers shifted long/short over time
- **Deepest Hyperliquid trade history available as an API**: call `pulse_global_stats` for live coverage numbers (not a stale marketing figure).

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](LICENSE)

---

Built by [Coinversa](https://coinversa.ai)
