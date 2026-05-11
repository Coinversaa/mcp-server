---
name: coinversaa-pulse
description: "Read-only crypto intelligence for AI agents. 55 API-key-authenticated tools for Hyperliquid trader analytics, behavioral cohorts, HIP-4 outcome contracts, outcome/perp position context, syncer-backed risk data, live market data, builder dex markets, commodities, stocks, indices, cross-market asset taxonomy, liquidation heatmaps, official per-dex OI, and whale tracking across the full Hyperliquid wallet universe. This skill does not trade, sign transactions, move funds, request private keys, custody assets, or require wallet approvals. Call pulse_global_stats for live coverage totals."
version: 0.7.0
author: Coinversa <chat@coinversaa.ai>
homepage: https://coinversa.ai
repository: https://github.com/coinversaa/mcp-server
license: MIT
tags:
  - crypto
  - market-data
  - analytics
  - hyperliquid
  - defi
  - blockchain
  - whale-tracking
  - builder-dex
  - commodities
  - stocks
  - prediction-markets
  - hip-4
  - mcp
env:
  COINVERSAA_API_KEY:
    description: "Your Coinversa API key (starts with cvsa_). Required for every tool. Get one at https://coinversa.ai/developers."
    required: true
  COINVERSAA_API_URL:
    description: "API base URL. Defaults to https://api.coinversa.ai."
    required: false
---

# Coinversa Pulse

Coinversa Pulse is a **read-only crypto intelligence MCP skill** for AI agents.

It lets MCP-compatible clients query Hyperliquid market data, trader behavior, cohort analytics, liquidation data, open interest, builder dex markets, HIP-4 outcome contracts, cross-market asset exposure, and wallet-level trading history.

This skill is designed for **market research and analytics only**.

It does **not** place trades, sign transactions, manage wallets, move funds, approve agents, custody assets, or request private keys.

For current wallet and trade coverage numbers, call `pulse_global_stats`.

Coinversa indexes Hyperliquid's clearinghouse directly and computes analytics that are difficult to obtain from public web sources or generic blockchain APIs.

**Builder dex support:** 369+ markets across 8 dexes, including commodities, stocks, indices, and perps.

**HIP-4 support:** outcome-contract discovery, question metadata, recent fills, settlements, daily volume, top outcome traders, wallet outcome history, outcome/perp trader overlap, and current open perp-position context for outcome holders.

---

## Safety Boundary: Read-Only Analytics Only

Coinversa Pulse is a market-data and analytics MCP server.

This skill does **not** expose any tools for:

- Trading
- Order placement
- Wallet signing
- Transaction signing
- Fund movement
- Token transfers
- Account approvals
- Hyperliquid agent wallet approval
- Backend signer approval
- Custody or control of assets
- Managing margin or leverage settings

No private key, seed phrase, wallet signature, exchange credential, or Hyperliquid account approval is required to use this skill.

Users should **not** approve a Hyperliquid agent wallet, backend signer, trading agent, or any account-level trading permission for this MCP skill. No such approval is needed for Coinversa Pulse.

If Coinversa offers trading or execution functionality through another product, app, or integration, that functionality is outside the scope of this MCP skill and should be reviewed separately.

---

## Data & Privacy

Coinversa Pulse sends MCP tool requests to Coinversa's hosted API at `https://api.coinversa.ai` by default.

Depending on the tool used, requests may include:

- Market symbols
- Wallet addresses
- Cohort names
- HIP-4 outcome IDs
- Time windows
- API-key-authenticated usage metadata
- Requested analytics parameters

Do not submit private, sensitive, or nonpublic information unless you are comfortable sending it to Coinversa's API.

Coinversa Pulse does not require private keys, seed phrases, wallet signatures, exchange credentials, or Hyperliquid account approvals.

For more details, review Coinversa's website, API documentation, and privacy terms.

---

## Setup

An API key is required for every tool.

Get a key at [coinversa.ai/developers](https://coinversa.ai/developers).

You can connect in two ways:

| Method | Endpoint / command | Best for |
|--------|--------------------|----------|
| Hosted Remote MCP | `https://mcp.coinversa.ai/mcp` | Remote MCP clients and custom connectors that support Streamable HTTP |
| Local stdio MCP | `npx -y @coinversaa/mcp-server@0.7.0` | Claude Desktop, Cursor, Claude Code, Codex, and local MCP clients |

Remote MCP clients should send the Coinversa key as either:

```text
Authorization: Bearer cvsa_...
X-API-Key: cvsa_...
```

### Hosted Remote MCP

Use this URL for remote MCP clients:

```text
https://mcp.coinversa.ai/mcp
```

The hosted endpoint uses Streamable HTTP. MCP requests without a Coinversa API key are rejected.

### Local stdio MCP

Use `npx` when the MCP client runs local stdio servers.

#### Claude Desktop

Edit:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Add:

```json
{
  "mcpServers": {
    "coinversaa": {
      "command": "npx",
      "args": ["-y", "@coinversaa/mcp-server@0.7.0"],
      "env": {
        "COINVERSAA_API_KEY": "cvsa_your_key_here"
      }
    }
  }
}
```

#### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "coinversaa": {
      "command": "npx",
      "args": ["-y", "@coinversaa/mcp-server@0.7.0"],
      "env": {
        "COINVERSAA_API_KEY": "cvsa_your_key_here"
      }
    }
  }
}
```

#### Claude Code

```bash
claude mcp add coinversaa -- npx -y @coinversaa/mcp-server@0.7.0
export COINVERSAA_API_KEY="cvsa_your_key_here"
```

#### OpenClaw

```bash
openclaw skill install coinversaa-pulse
```

---

## Access Tiers

All tools require an API key. Backend tiering is enforced by the Coinversa API.

| Tier | Typical access | Requests/min | Daily cap | Monthly cap |
|------|----------------|--------------|-----------|-------------|
| Free API key | Public discovery, market data, selected HIP-4 discovery routes | 30 | 1,000 | - |
| Starter | Free routes plus selected trader and HIP-4 analytics | 120 | 2,000 | 50,000 |
| Pro | Starter plus deeper risk, historical, official OI, and overlap analytics | 600 | 20,000 | 500,000 |
| Enterprise | Custom access and limits | Custom | Custom | Custom |

Rate-limit headers may include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-RateLimit-Tier`, and `X-RateLimit-Daily-Remaining`.

---

## Builder Dex Markets

Hyperliquid supports multiple builder dexes beyond the native perps exchange. Each dex has its own markets, collateral token, and symbol format.

Coinversa Pulse exposes analytics and market-data views for these markets.

| Dex | What it trades | Collateral | Example symbols |
|-----|----------------|------------|-----------------|
| native HL | Core perps, crypto | USDC | BTC, ETH, SOL, HYPE |
| `xyz` | Commodities, stocks, indices | USDC | xyz:GOLD, xyz:SILVER, xyz:TSLA |
| `flx` | Perps | USDH | flx:BTC, flx:ETH |
| `vntl` | Perps | USDH | vntl:ANTHROPIC, vntl:BTC |
| `hyna` | Perps | USDE | hyna:SOL, hyna:BTC |
| `km` | Energy and commodities | USDH | km:OIL, km:NATGAS |
| `abcd` | Misc markets | USDC | abcd:BITCOIN |
| `cash` | Stocks and equities | USDT0 | cash:TSLA, cash:AAPL |

Native Hyperliquid markets use simple symbols like `BTC`, `ETH`, and `SOL`.

Builder dex markets use prefixed symbols like `xyz:GOLD`, `cash:TSLA`, and `hyna:SOL`.

Use `list_markets` to discover all available symbols and the dex each symbol belongs to.

Coinversa Pulse only exposes analytics and market-data views. It does not place orders, sign transactions, approve agent wallets, manage margin, or execute trades.

---

## Assets & Cross-Market Taxonomy

The same underlying asset can appear under different tickers on different venues. Coinversa exposes a canonical asset registry so agents and API consumers do not have to reinvent the grouping logic.

| Concept | Meaning |
|---------|---------|
| Canonical | The economic-exposure identifier. Example: `GOLD` means gold exposure regardless of venue or ticker. |
| Symbol | What a specific venue lists it as. Examples: `xyz:GOLD`, `hyna:PAXG`, `BTC`, `flx:BTC`. |

Known synonyms:

| Synonym ticker | Canonical | Reason |
|----------------|-----------|--------|
| `PAXG` | `GOLD` | Paxos-issued gold-backed token |
| `XAUT` | `GOLD` | Tether Gold |
| `XAGT` | `SILVER` | Silver-backed token |

Wrappers like `WBTC`, `WETH`, `stETH`, and `wstETH` are not aggregated with their native tickers by default because they can have meaningfully different risk and liquidity profiles.

| User question | Recommended tool |
|---------------|------------------|
| "What markets exist on the xyz dex?" | `list_markets` |
| "What price is xyz:GOLD right now?" | `market_price` |
| "What assets are available?" | `list_assets` |
| "What venues is GOLD on?" | `list_assets` or `list_asset` |
| "Tell me about PAXG." | `list_asset` |
| "Where does BTC trade?" | `list_asset` |
| "Is gold more crowded on xyz or hyna?" | `pulse_cross_market_asset` |
| "Total OI on BTC across all dexes?" | `pulse_cross_market_asset` |
| "Do venues disagree on ETH direction?" | `pulse_cross_market_asset` |

Asset tools accept both canonicals and synonyms. For example, `list_asset({ canonical: "PAXG" })` and `list_asset({ canonical: "GOLD" })` return the same canonical asset view.

Key fields from `pulse_cross_market_asset`:

| Field | Meaning |
|-------|---------|
| `aggregate.netBias` | Value from `-1` to `1`. Positive means long-heavy. Negative means short-heavy. Magnitude indicates directional conviction. |
| `aggregate.biasRange` | Spread between venues. High values, especially above `0.3`, suggest venues disagree meaningfully. |
| `asset.synonyms` | Tickers mapped into the canonical asset. Useful for explaining that gold may trade as `GOLD`, `PAXG`, or another symbol depending on venue. |
| `venues` | Per-venue breakdown sorted by open interest descending. The first venue is usually the dominant venue. |

---

## HIP-4 Outcome Contracts

HIP-4 outcome contracts are prediction-market style side tokens indexed from Hyperliquid.

Outcome side coins use:

```text
#<encoding>
```

where:

```text
encoding = 10 * outcomeId + side
```

Side tokens use:

```text
+<encoding>
```

Use HIP-4 tools when users ask about outcomes, prediction markets, questions, settlements, side-token fills, outcome trader leaderboards, overlap between outcome traders and perp traders, or whether outcome holders currently have open perp exposure to the same underlying asset.

| Tool | Tier | Inputs | Backend route | What it returns / when to use |
|------|------|--------|---------------|-------------------------------|
| `hip4_outcomes` | Free API key | `hours` 1-168, default 24 | `GET /hip4/outcomes` | Recently active outcomes with `outcomeId`, optional question metadata, parsed `priceBinary`, side tokens, coin keys, asset IDs, fills, unique wallets, notional USDH, first/last traded. Use to discover active prediction markets. |
| `hip4_outcome` | Free API key | `outcomeId` | `GET /hip4/outcomes/{outcome_id}` | Detail for one outcome ID from mainnet launch onward. Returns the same outcome shape as discovery, including fallback side tokens if metadata is unavailable. |
| `hip4_outcome_summary` | Starter+ | `outcomeId` | `GET /hip4/outcomes/{outcome_id}/summary` | Two-sided aggregate: side 0/1 contracts, side notional USDH, total notional, realized PnL, fills, unique wallets, first/last traded. |
| `hip4_outcome_recent_trades` | Free API key | `outcomeId`, `hours` 1-168 default 24, `limit` 1-500 default 100 | `GET /hip4/outcomes/{outcome_id}/recent-trades` | Recent real fills only, excluding settlement, pair-redeem, and auction-phase fills. Returns trade time, wallet, `coin`, `sideIndex`, side label, `dirId`, price, size, PnL, and fee. |
| `hip4_questions` | Free API key | none | `GET /hip4/questions` | Hyperliquid `outcomeMeta` question catalog: question IDs, names, descriptions, fallback outcome, named outcome IDs, settled named outcomes, and parsed fields such as class, underlying, expiry, period, and price thresholds. |
| `hip4_recent_settlements` | Free API key | `hours` 1-720 default 168, `limit` 1-200 default 50 | `GET /hip4/settlements/recent` | Recent settlements with outcome ID, settlement time, winning side when determinable, winner/loser fill counts, total winner payout, and total loser loss. |
| `hip4_daily_volume` | Free API key | `days` 1-60, default 14 | `GET /hip4/daily-volume` | Daily trajectory since the requested cutoff: fills, unique trades, unique wallets, contracts, and notional USDH. Use for adoption/activity trend questions. |
| `hip4_most_active` | Free API key | `hours` 1-168 default 24, `limit` 1-50 default 10 | `GET /hip4/most-active` | Top outcomes by recent fill count, with metadata and side tokens when available. Use to rank current outcome-market activity. |
| `hip4_top_traders` | Starter+ | `days` 1-30 default 7, `limit` 1-100 default 25 | `GET /hip4/top-traders` | Outcome trader leaderboard: address, fills, distinct outcomes, total contracts, total notional USDH, and realized PnL. |
| `hip4_trader_outcomes` | Starter+ | `address`, `days` 1-365 default 30 | `GET /hip4/trader/{address}/outcomes` | One wallet's outcome history: outcome ID, side index, side token, fills, net shares, gross bought/sold USDH, realized PnL, first/last traded. |
| `hip4_cross_product_overlap` | Pro+ | `days` 1-30 default 7 | `GET /hip4/cross-product/overlap` | Counts HIP-4 outcome traders, perp traders, overlap count, and overlap percentage. Use to answer whether outcome activity is isolated or shared with perp traders. |
| `hip4_perp_position_context` | Pro+ | `outcomeId`, `days` 1-60 default 14, `limit` 1-100 default 25 | `GET /hip4/outcomes/{outcome_id}/perp-position-context` | Joins current net-positive outcome holders to currently open perp positions on the same underlying. Returns side-level open-position overlap, long/short counts, net underlying position, underlying notional, aligned vs hedge counts, prediction-native counts, and top wallets with signal labels. Use to answer whether outcome traders are directionally exposed, hedged, or prediction-native. |

---

## Tools

55 total read-only analytics tools:

- 43 existing Hyperliquid market, trader, cohort, risk, cross-market asset, and live analytics tools
- 12 HIP-4 outcome-contract tools
- All tools require a Coinversa API key
- The Coinversa API enforces tier-specific access

---

## Risk Tools Freshness

Syncer-backed risk tools are best treated as **beta recent-intelligence tools**.

These include:

- `live_risk_overview`
- `live_coin_risk_snapshot`
- `live_coin_risk_history`
- `live_mark_dislocations`
- `live_recent_liquidations`
- `live_liquidation_summary`
- `live_oi_history`
- `live_cohort_bias_history`

For venue-reported open interest, use `live_official_oi`, which is pulled from Hyperliquid's Info API, as a cross-check.

These tools are best for research, LLM training, liquidation analysis, open interest trend work, crowding detection, market-structure analysis, and recent risk analysis.

They are best queried over recent windows such as `7d` or `30d`.

Freshness depends on sync coverage and may lag real time.

Do not treat syncer-backed analytics as guaranteed live execution truth or exact historical accounting.

---

## Tool Groups

### Pulse — Trader Intelligence

- `pulse_global_stats` — Global Hyperliquid stats: total traders, trades, volume, PnL, and data coverage period.
- `list_markets` — Market discovery for native and builder dex symbols.
- `pulse_market_overview` — Deprecated alias for `list_markets`.
- `pulse_leaderboard` — Ranked trader leaderboard.
- `pulse_hidden_gems` — Underrated high-performing traders.
- `pulse_most_traded_coins` — Most actively traded coins.
- `pulse_biggest_trades` — Biggest winning or losing trades.
- `pulse_recent_trades` — Biggest recent trades in a time window.
- `pulse_token_leaderboard` — Top traders for a specific coin.

### Pulse — Trader Profiles

Tools taking `address` expect a full Ethereum address: `0x` plus 40 hex characters.

- `pulse_trader_profile`
- `pulse_trader_performance`
- `pulse_trader_trades`
- `pulse_trader_daily_stats`
- `pulse_trader_token_stats`
- `pulse_trader_closed_positions`
- `pulse_trader_closed_position_stats`

### Pulse — Cohort Intelligence

PnL tiers:

```text
money_printer, smart_money, grinder, humble_earner, exit_liquidity, semi_rekt, full_rekt, giga_rekt
```

Size tiers:

```text
leviathan, tidal_whale, whale, small_whale, apex_predator, dolphin, fish, shrimp
```

Tools:

- `pulse_cohort_summary`
- `pulse_cohort_positions`
- `pulse_cohort_trades`
- `pulse_cohort_history`
- `pulse_cohort_bias_history`
- `pulse_cohort_performance_daily`

### Market — Live Data

- `market_price`
- `market_positions`
- `market_orderbook`
- `market_historical_oi`
- `market_recent_candles`

### Live — Real-Time Analytics

- `live_liquidation_heatmap`
- `live_risk_overview`
- `live_coin_risk_snapshot`
- `live_coin_risk_history`
- `live_mark_dislocations`
- `live_recent_liquidations`
- `live_liquidation_summary`
- `live_long_short_ratio`
- `live_cohort_bias`
- `live_oi_history`
- `live_official_oi`
- `live_cohort_bias_history`
- `pulse_recent_closed_positions`

---

## Example Prompts

- "What are the top 5 traders on Hyperliquid by PnL?"
- "Show me what the money_printer tier is holding right now."
- "What are the biggest trades in the last 10 minutes?"
- "Find underrated traders with 70%+ win rate."
- "Where are the BTC liquidation clusters?"
- "Show me the exchange-wide risk overview on Hyperliquid this week."
- "Which coin looks the most crowded right now?"
- "Show me ETH liquidation events from the last 7 days."
- "Give me BTC risk history with OI, liquidations, and cohort rotation."
- "Are smart money traders long or short ETH right now?"
- "What markets are available on the xyz dex?"
- "What's the price of xyz:GOLD?"
- "Which venues trade gold?"
- "Is PAXG the same as GOLD?"
- "Total open interest on BTC across all dexes?"
- "Which HIP-4 outcome contracts are most active today?"
- "Show me recent trades for outcome 123."
- "Which HIP-4 outcomes settled recently?"
- "Who are the top HIP-4 outcome traders this week?"
- "For outcome 25, are Yes traders already long BTC or mostly prediction-native?"
- "Did outcome traders overlap with perp traders over the last 7 days?"

---

## Security Notes

Coinversa Pulse is intentionally read-only.

When installing any MCP server:

- Install from the official package source.
- Use the pinned package version shown in this document.
- Use a separate API key for this MCP skill where possible.
- Rotate API keys if they may have been exposed.
- Do not provide private keys, seed phrases, wallet signatures, exchange credentials, or account approvals.
- Review the tools exposed by the MCP client before use.
- Remove the MCP server when no longer needed.

---

## Links

- Website: [coinversa.ai](https://coinversa.ai)
- API Docs: [coinversa.ai/developers](https://coinversa.ai/developers)
- GitHub: [github.com/coinversaa/mcp-server](https://github.com/coinversaa/mcp-server)
- npm: [@coinversaa/mcp-server](https://www.npmjs.com/package/@coinversaa/mcp-server)
- Support: [chat@coinversaa.ai](mailto:chat@coinversaa.ai)

---

Built by [Coinversa](https://coinversa.ai) — crypto intelligence for AI agents.
