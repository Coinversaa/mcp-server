# Coinversa Pulse — MCP Server

<a href="https://glama.ai/mcp/servers/Coinversaa/mcp-server"><img src="https://glama.ai/mcp/servers/Coinversaa/mcp-server/badge" alt="MCP Server" /></a>

Crypto intelligence for AI agents. Query the full Hyperliquid wallet universe, indexed trade history with PnL attribution, behavioral cohorts, and live market data through any MCP-compatible client. Call `pulse_global_stats` to see exact current coverage (tracked wallets, indexed trades, volume, PnL, data window).

**Now with HIP-4 outcome contracts and builder dex support** — inspect prediction-market style outcome contracts, settlements, commodities (gold, silver, oil), stocks (TSLA, AAPL), and perps across 8 dexes and 369+ markets.

## What's new in 0.9.0

**Entity resolution, tier-aware sessions, and chain-verified answers.**

| New tool | What it answers |
|----------|-----------------|
| `pulse_entity_profile` [Pro] | "Who owns this wallet — and what is their REAL combined book across every sub-account?" |
| `pulse_entity_leaderboard` [Pro] | "Top traders deduped by OWNER, not wallet — a fund running 35 sub-accounts shows as one entity." |
| `pulse_my_plan` | "What plan is this API key on, what are the limits, and what does upgrading unlock?" |
| `pulse_exchange_volume` | "24h volume — total and per dex (builder dexes are ~43% and most trackers miss them)." |
| `pulse_exchange_oi` | "Open interest by dex with long/short split." |
| `pulse_active_traders` | "How many wallets traded in the last 24h?" |
| `pulse_exchange_positions` | "How many positions are open right now, per dex?" |
| `pulse_pnl_leaders` | "Who made and lost the most in the last 24h, exchange-wide?" |

Also in 0.9.0:
- **Tier-aware errors** — a tier-gated or rate-limited request now explains the caller's tier, the required tier, and carries a direct upgrade link. (Fixes valid free-tier keys being told their key was "rejected" on Pro endpoints.)
- **Verified-vs-chain stamps** — entity responses carry the chain-state block they were last reconciled against.

Tool count: **83 → 91**.

## What's new in 0.8.0

**Position lifecycles, execution quality, and trader archetypes.** v0.8.0 adds 28 tools built on a fully re-derived position-lifecycle dataset — every open→close cycle reconstructed from on-chain fills, now carrying MAE/MFE (the worst adverse and best favorable price each position ever saw). This unlocks execution-quality analysis, not just PnL.

| New tool | What it answers |
|----------|-----------------|
| `pulse_trader_lifecycles` | "Show me every open→close position for this wallet, with entry/exit and hold time." |
| `pulse_trader_lifecycle_summary` | "What are this wallet's position-level stats — win rate, avg hold, biggest win/loss?" |
| `pulse_lifecycle` | "Break down lifecycle 12345 into every fill that built and unwound it." |
| `pulse_trader_demo` | "Give me a quick wallet brief before a deeper dive." |
| `pulse_wallet_drawdown_curve` | "How far underwater did each of this wallet's positions go before working?" |
| `pulse_max_pain_events` | "Which winners survived the deepest drawdowns before recovering?" |
| `pulse_perfect_exits` | "Which exits captured most of the maximum favorable move?" |
| `pulse_backstop_events` | "What were the most catastrophic individual liquidations?" |
| `pulse_survivors` / `pulse_anti_survivors` | "Who blew up and recovered — and who never did?" |
| `pulse_persistent_winners` | "Who is profitable across multiple distinct months, not just lucky once?" |
| `pulse_capital_titans` | "Who extracts the most PnL per dollar of fees paid?" |
| `pulse_one_month_wonders` | "Who had one huge month then gave it back?" |
| `pulse_newcomer_whales` | "Who just showed up and is already trading big notional?" |
| `pulse_coin_kings` | "Who is the top earner of each coin?" |
| `pulse_top_liquidators` | "Who profits most by liquidating others?" |
| `pulse_lethal_coins` | "Which coins blow people up most often?" |
| `pulse_coin_alpha_map` | "Per coin, how big are the winner vs loser profit pools?" |
| `pulse_hour_profitability` | "What UTC hour of close is most profitable?" |
| `pulse_market_concentration` | "How concentrated is alpha — do the top 1% take everything?" |
| `pulse_style_distribution` | "Do scalpers or swing traders make more money?" |
| `pulse_compare` | "Head-to-head: who is the better trader, A or B?" |
| `pulse_cohort_recent_*` | "What are wallets that are printing RIGHT NOW (last-30-day tier) doing — positions, trades, top lifecycles, concentration?" |
| `pulse_lifecycles_recent` | "What just closed exchange-wide right now?" (global feed; successor to `pulse_recent_closed_positions`) |

The legacy closed-position tools (`pulse_trader_closed_positions`, `pulse_trader_closed_position_stats`, `pulse_recent_closed_positions`) are kept for backward compatibility but **superseded** by the lifecycle tools, which read the corrected `position_lifecycles_full` table (more history, MAE/MFE, spot).

Tool count: **55 → 83**. An API key is required for every tool; backend tiering determines which tools and limits are available.

## What's new in 0.7.0

**HIP-4 outcome contract intelligence.** v0.7.0 adds 12 tools for discovering active outcomes, reading question metadata, inspecting settlements and recent fills, tracking daily volume, ranking outcome traders, measuring outcome/perp overlap, and joining outcome holders to their currently open perp positions on the same underlying asset.

| New tool | What it answers |
|----------|-----------------|
| `hip4_outcomes` | "What outcome contracts are active right now?" |
| `hip4_outcome` | "What is outcome 123 and what side tokens does it use?" |
| `hip4_outcome_summary` | "How much volume/PnL has this outcome done across both sides?" |
| `hip4_outcome_recent_trades` | "Show me recent fills for this prediction market." |
| `hip4_questions` | "What HIP-4 questions and named outcomes exist?" |
| `hip4_recent_settlements` | "Which outcomes settled recently and which side won?" |
| `hip4_daily_volume` | "Is HIP-4 outcome volume growing day by day?" |
| `hip4_most_active` | "Which outcome contracts are most active?" |
| `hip4_top_traders` | "Who are the top outcome traders?" |
| `hip4_trader_outcomes` | "What outcomes did this wallet trade?" |
| `hip4_cross_product_overlap` | "How much overlap is there between outcome traders and perp traders?" |
| `hip4_perp_position_context` | "Do outcome 25 traders currently have open BTC perp exposure, and is it aligned or hedged?" |

Tool count: **43 → 55**. An API key is required for every tool; backend tiering determines which tools and limits are available. Get a key from [coinversa.ai/developers](https://coinversa.ai/developers).

## What's new in 0.6.0

**Canonical cross-market asset taxonomy.** The same underlying asset can appear under different tickers on different venues (e.g. `GOLD` on xyz, `PAXG` on native Hyperliquid — both track gold). v0.6.0 added 3 tools that resolve synonyms server-side and aggregate across venues, plus a ground-truth OI tool:

| New tool | What it answers |
|----------|-----------------|
| `list_assets` | "What assets are available? Which are listed on 2+ venues?" |
| `list_asset` | "Where does GOLD trade? Is PAXG the same as GOLD?" |
| `pulse_cross_market_asset` | "Is gold more crowded on xyz or hyna? Do dexes disagree on BTC direction?" |
| `live_official_oi` | "What does Hyperliquid itself report for BTC OI — do our numbers match?" |

Synonyms baked in: `PAXG → GOLD`, `XAUT → GOLD`, `XAGT → SILVER`. Prefix grouping (`BTC` ≡ `flx:BTC` ≡ `hyna:BTC`) works automatically.

Other 0.6.0 housekeeping: default API URL points at production; removed stale hard-coded "710K+ wallets / 1.8B+ trades" marketing figures (call `pulse_global_stats` for current coverage); `pulse_market_overview` kept as a deprecated alias for the canonical `list_markets`.

## Quick Start

### API Key Required

Get a key at [coinversa.ai/developers](https://coinversa.ai/developers) or email [chat@coinversaa.ai](mailto:chat@coinversaa.ai).

You can connect in two ways:

| Method | Endpoint / command | Best for |
|--------|--------------------|----------|
| Hosted Remote MCP | `https://mcp.coinversa.ai/mcp` | Remote MCP clients and custom connectors that support Streamable HTTP |
| Local stdio MCP | `npx -y @coinversaa/mcp-server@0.9.0` | Claude Desktop, Cursor, Claude Code, Codex, and local MCP clients |

Remote MCP clients should send the Coinversa key as either `Authorization: Bearer cvsa_...` or `X-API-Key: cvsa_...`.

Local MCP clients must pass `COINVERSAA_API_KEY`:

```json
{
  "mcpServers": {
    "coinversaa": {
      "command": "npx",
      "args": ["-y", "@coinversaa/mcp-server@0.9.0"],
      "env": {
        "COINVERSAA_API_KEY": "cvsa_your_key_here"
      }
    }
  }
}
```

#### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "coinversaa": {
      "command": "npx",
      "args": ["-y", "@coinversaa/mcp-server@0.9.0"],
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
      "args": ["-y", "@coinversaa/mcp-server@0.9.0"],
      "env": {
        "COINVERSAA_API_KEY": "cvsa_your_key_here"
      }
    }
  }
}
```

#### Claude Code

```bash
claude mcp add coinversaa -- npx -y @coinversaa/mcp-server@0.9.0
```

Set the env var in your shell:
```bash
export COINVERSAA_API_KEY="cvsa_your_key_here"
```

That's it. No cloning, no building — `npx` handles everything for local MCP.

## Remote MCP (HTTPS Connector)

Hosted remote endpoint:

```text
https://mcp.coinversa.ai/mcp
```

Use the hosted endpoint with remote MCP clients such as Perplexity custom
connectors, or any MCP client that supports Streamable HTTP.

The npm / stdio workflow above remains the recommended path for Claude Desktop,
Cursor, Claude Code, Codex, and other local MCP clients.

For remote MCP clients such as Perplexity custom connectors, this repo also
ships a separate HTTP entrypoint:

```bash
npm run build
PORT=3000 npm run start:http
```

Remote endpoints:

| Endpoint | Transport | Notes |
|----------|-----------|-------|
| `/mcp` | Streamable HTTP | Recommended remote MCP endpoint |
| `/sse` | HTTP + SSE | Legacy compatibility endpoint |
| `/health` | JSON | Health check |

Authentication is read-only API-key forwarding. The remote MCP accepts a
Coinversa key via either header:

```text
Authorization: Bearer cvsa_...
X-API-Key: cvsa_...
```

The remote server forwards that key to the Coinversa API as `X-API-Key`. If no
key is supplied, MCP requests are rejected. The default backend is production (`https://api.coinversa.ai`); set
`COINVERSAA_API_URL` only for self-hosted or staging deployments.

Coinversa's hosted production Remote MCP URL is:

```text
https://mcp.coinversa.ai/mcp
```

For self-hosted deployments, run `build/remote.js` behind TLS at your own stable
URL.

Optional deployment env vars:

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port, default `3000` |
| `HOST` | Bind host, default `0.0.0.0` |
| `COINVERSAA_API_URL` | Backend API base URL override |
| `COINVERSAA_REMOTE_ALLOWED_HOSTS` | Comma-separated allowed Host headers |
| `COINVERSAA_REMOTE_ALLOW_ENV_API_KEY=true` | Allow env-key fallback for private/internal deployments only |

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

## Available Tools (82)

All 99 tools require an API key. The MCP registers the full tool set, and the Coinversa API enforces access by key tier. Free API keys can use public/discovery routes, while Starter, Pro, and Enterprise keys unlock deeper trader, HIP-4, risk, historical, and official OI tools.

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

### HIP-4 — Outcome Contracts (v0.7.0)

Prediction-market style outcome contracts indexed from Hyperliquid. Outcome side coins use `#<encoding>` where `encoding = 10 * outcomeId + side`; side tokens use `+<encoding>`.

Backend tiering is enforced by the Coinversa API. "Free" below means a free API key is still required.

| Tool | Tier | Inputs | Backend route | Returns / use it for |
|------|------|--------|---------------|----------------------|
| `hip4_outcomes` | Free API key | `hours` 1-168, default 24 | `GET /hip4/outcomes` | Recently active outcomes with `outcomeId`, optional question metadata, parsed `priceBinary`, side tokens, coin keys, asset IDs, fills, unique wallets, notional USDH, first/last traded. Use to discover active prediction markets. |
| `hip4_outcome` | Free API key | `outcomeId` | `GET /hip4/outcomes/{outcome_id}` | Detail for one outcome ID from mainnet launch onward. Returns the same outcome shape as discovery, including fallback side tokens if metadata is unavailable. |
| `hip4_outcome_summary` | Starter+ | `outcomeId` | `GET /hip4/outcomes/{outcome_id}/summary` | Two-sided aggregate: side 0/1 contracts, side notional USDH, total notional, realized PnL, fills, unique wallets, first/last traded. Use for "how big was this market?" and PnL/volume summaries. |
| `hip4_outcome_recent_trades` | Free API key | `outcomeId`, `hours` 1-168 default 24, `limit` 1-500 default 100 | `GET /hip4/outcomes/{outcome_id}/recent-trades` | Recent real fills only, excluding settlement, pair-redeem, and auction-phase fills. Returns trade time, wallet, `coin`, `sideIndex`, side label, `dirId`, price, size, PnL, and fee. |
| `hip4_questions` | Free API key | none | `GET /hip4/questions` | Hyperliquid `outcomeMeta` question catalog: question IDs, names, descriptions, fallback outcome, named outcome IDs, settled named outcomes, and parsed fields such as class, underlying, expiry, period, and price thresholds. |
| `hip4_recent_settlements` | Free API key | `hours` 1-720 default 168, `limit` 1-200 default 50 | `GET /hip4/settlements/recent` | Recent settlements with outcome ID, settlement time, winning side when determinable, winner/loser fill counts, total winner payout, and total loser loss. |
| `hip4_daily_volume` | Free API key | `days` 1-60, default 14 | `GET /hip4/daily-volume` | Daily trajectory since the requested cutoff: fills, unique trades, unique wallets, contracts, and notional USDH. Use for adoption/activity trend questions. |
| `hip4_most_active` | Free API key | `hours` 1-168 default 24, `limit` 1-50 default 10 | `GET /hip4/most-active` | Top outcomes by recent fill count, with metadata and side tokens when available. Use to rank current outcome-market activity. |
| `hip4_top_traders` | Starter+ | `days` 1-30 default 7, `limit` 1-100 default 25 | `GET /hip4/top-traders` | Outcome trader leaderboard: address, fills, distinct outcomes, total contracts, total notional USDH, and realized PnL. |
| `hip4_trader_outcomes` | Starter+ | `address`, `days` 1-365 default 30 | `GET /hip4/trader/{address}/outcomes` | One wallet's outcome history: outcome ID, side index, side token, fills, net shares, gross bought/sold USDH, realized PnL, first/last traded. Use for wallet-level outcome due diligence. |
| `hip4_cross_product_overlap` | Pro+ | `days` 1-30 default 7 | `GET /hip4/cross-product/overlap` | Counts HIP-4 outcome traders, perp traders, overlap count, and overlap percentage. Use to answer whether outcome activity is isolated or shared with perp traders. |
| `hip4_perp_position_context` | Pro+ | `outcomeId`, `days` 1-60 default 14, `limit` 1-100 default 25 | `GET /hip4/outcomes/{outcome_id}/perp-position-context` | Joins current net-positive outcome holders to currently open perp positions on the same underlying. Returns side-level overlap, long/short counts, net underlying position, notional, aligned vs hedge counts, prediction-native counts, and top wallets with signal labels. Use to answer whether outcome traders are directionally exposed, hedged, or prediction-native. |

### Position Lifecycles — 0.8.0

The lifecycle tools are the preferred position-level surface for new agents. A lifecycle is one reconstructed open->close position, including scale-ins, scale-outs, realized PnL, fees, hold time, and liquidation state. Use the older closed-position tools only when you specifically need the legacy closed-position payload or global recent-closed feed.

| Goal | Recommended tool |
|------|------------------|
| Quick wallet read | `pulse_trader_demo` |
| Wallet-level position stats | `pulse_trader_lifecycle_summary` |
| Full wallet lifecycle history | `pulse_trader_lifecycles` |
| Drill into one position's fills | `pulse_lifecycle` |
| MAE/MFE pain and exit timing | `pulse_wallet_drawdown_curve`, `pulse_max_pain_events`, `pulse_perfect_exits` |
| Find trader archetypes | `pulse_survivors`, `pulse_anti_survivors`, `pulse_persistent_winners`, `pulse_capital_titans`, `pulse_one_month_wonders`, `pulse_newcomer_whales` |
| Market-wide lifecycle structure | `pulse_coin_alpha_map`, `pulse_hour_profitability`, `pulse_market_concentration`, `pulse_style_distribution` |
| Compare wallets | `pulse_compare` |
| Analyze currently-hot cohorts | `pulse_cohort_recent_positions`, `pulse_cohort_recent_trades`, `pulse_cohort_recent_lifecycle_stats`, `pulse_cohort_recent_top_positions`, `pulse_cohort_recent_alpha_concentration` |

### Pulse — Trader Profiles

| Tool | Description |
|------|-------------|
| `pulse_trader_profile` | Full due diligence on any wallet (PnL, win rate, tiers, profit factor) |
| `pulse_trader_performance` | 30-day vs all-time comparison with trend direction |
| `pulse_trader_demo` | Fast wallet briefing: lifecycle summary plus recent top wins and losses |
| `pulse_trader_trades` | Recent trades for any wallet — the copy-trading signal |
| `pulse_trader_daily_stats` | Day-by-day PnL, win rate, and volume breakdown |
| `pulse_trader_token_stats` | Per-coin P&L breakdown (find a trader's edge) |
| `pulse_trader_lifecycle_summary` | Preferred 0.8 wallet position summary — wins/losses, liquidation count, hold time, fees, biggest win/loss |
| `pulse_trader_lifecycles` | Preferred 0.8 lifecycle history — one reconstructed open->close position per row |
| `pulse_lifecycle` | One lifecycle by ID, including composing fills |
| `pulse_trader_closed_positions` | Legacy closed-position payload; prefer `pulse_trader_lifecycles` for new position analysis |
| `pulse_trader_closed_position_stats` | Legacy aggregate stats; prefer `pulse_trader_lifecycle_summary` for new position analysis |

### Pulse — Cohort Intelligence

Every tracked Hyperliquid wallet classified into behavioral tiers — unique data nobody else has. For the current tracked-wallet count, call `pulse_global_stats`.

**PnL tiers** (by profitability, best to worst):

| Display name | Slug | Legacy slug (still accepted) |
|--------------|------|------------------------------|
| Apex | `apex` | `money_printer` |
| Sharps | `sharps` | `smart_money` |
| Grinders | `grinders` | `grinder` |
| Scrapers | `scrapers` | `humble_earner` |
| The Crowd | `crowd` | `exit_liquidity` |
| Bleeders | `bleeders` | `semi_rekt` |
| Trapped | `trapped` | `full_rekt` |
| Blown Out | `blown_out` | `giga_rekt` |

**Size tiers** (by volume, largest to smallest):

| Display name | Slug | Legacy slug (still accepted) |
|--------------|------|------------------------------|
| Heavyweights | `heavyweights` | `leviathan` |
| Cruiserweights | `cruiserweights` | `tidal_whale` |
| Middleweights | `middleweights` | `whale` |
| Welterweights | `welterweights` | `small_whale` |
| Lightweights | `lightweights` | `apex_predator` |
| Featherweights | `featherweights` | `dolphin` |
| Flyweights | `flyweights` | `fish` |
| Strawweights | `strawweights` | `shrimp` |

Tool inputs accept both vocabularies (new slugs are normalized before the API call). API responses currently still emit legacy slugs (e.g. `pnlTier: "money_printer"`).

| Tool | Description |
|------|-------------|
| `pulse_cohort_summary` | Behavioral tier breakdown across every tracked wallet |
| `pulse_cohort_positions` | What the Apex / Heavyweights tiers are holding RIGHT NOW |
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
- "Show me what the apex tier is holding right now"
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
- "Which HIP-4 outcome contracts are most active today?"
- "Show me recent trades for outcome 123"
- "Which HIP-4 outcomes settled recently?"
- "Who are the top HIP-4 outcome traders this week?"
- "For outcome 25, are Yes traders already long BTC or mostly prediction-native?"
- "Did outcome traders overlap with perp traders over the last 7 days?"

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COINVERSAA_API_KEY` | Yes | — | Your API key (starts with `cvsa_`). Required for every tool. |
| `COINVERSAA_API_URL` | No | `https://api.coinversa.ai` | Override the API host. Only needed if you operate your own Coinversa backend (self-hosted or fork). |

## Rate Limits

Rate limits are enforced by API-key tier:

| Tier | Requests/min | Daily cap | Monthly cap |
|------|--------------|-----------|-------------|
| Free API key | 30 | 1,000 | — |
| Starter | 120 | 2,000 | 50,000 |
| Pro | 600 | 20,000 | 500,000 |
| Enterprise | Custom | Custom | Custom |

Rate limit headers are included in every response:
- `X-RateLimit-Limit`: your configured limit
- `X-RateLimit-Remaining`: requests left in current window
- `X-RateLimit-Reset`: seconds until window resets
- `X-RateLimit-Tier`: your API-key tier
- `X-RateLimit-Daily-Remaining`: requests left today, when a daily cap applies

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
- **Behavioral cohorts**: every tracked wallet classified into PnL tiers (Apex to Blown Out) and size tiers (Heavyweights to Strawweights)
- **Live cohort positions**: See what the best traders are holding in real-time
- **Real-time trade feed**: Every trade by any wallet or cohort, queryable by time window
- **Liquidation heatmaps**: Cluster analysis across price levels for any coin
- **Position lifecycle analytics**: Reconstructed open->close lifecycles with hold duration, entry/exit VWAP, realized PnL, fees, liquidation state, and MAE/MFE execution-quality analysis
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
