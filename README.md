# Coinversa Pulse — MCP Server

<a href="https://glama.ai/mcp/servers/Coinversaa/mcp-server"><img src="https://glama.ai/mcp/servers/Coinversaa/mcp-server/badge" alt="MCP Server" /></a>

Crypto intelligence for AI agents. Query the full Hyperliquid wallet universe, indexed trade history with PnL attribution, behavioral cohorts, and live market data through any MCP-compatible client. Call `pulse_global_stats` to see exact current coverage (tracked wallets, indexed trades, volume, PnL, data window).

**Now with HIP-4 outcome contracts and builder dex support** — inspect prediction-market style outcome contracts, settlements, commodities (gold, silver, oil), stocks (TSLA, AAPL), and perps across 8 dexes and 369+ markets.

## What's new in 0.11.1

**Builder user-lifecycle, journey, heatmap, and order-intent analytics.** 4 more tools over the same builder-fee data, covering where a builder's users stand today, how fast it monetizes a new wallet, when its flow actually trades, and what its users intend at order placement.

| New tool | What it answers |
|----------|-----------------|
| `builder_journey` [Pro] | "How fast and how unevenly does builder X monetize a new user?" |
| `builder_lifecycle` [Pro] | "How many of builder X's users are still active, and how many did a rival take?" |
| `builder_heatmap` [Pro] | "What hours does builder X's volume peak, and when is it safe to ship?" |
| `builder_orders` [Pro] | "Do builder X's users place stops and take-profits, and how much of their order flow actually fills?" |

Tool count: **99 → 103**.

Also in 0.11.1:
- **Tool titles and annotations** — every tool now carries a human-readable `title` and MCP annotations (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`), so clients can label the tools and treat them as read-only without prompting.
- **Hosted connector parity** — this package now ships exactly the tool set served by the hosted OAuth endpoint at `https://mcp.coinversa.ai/mcp`. The obsolete header-authenticated HTTP entrypoint that used to live in this repo has been removed; see [Quick Start](#quick-start) for the two supported ways to connect.

## What's new in 0.11.0

**Builder analytics — 8 new tools (91 → 99).** The Hyperliquid builder-code
economy (the fees frontends, wallet apps, bots, and builder dexes earn on
routed order flow) is now a first-class tool family:

- `builder_leaderboard` — builders ranked by exact on-chain ledger revenue, with attributed volume/users and prev-window deltas *(Starter)*
- `builder_profile` — one builder: revenue, daily series, top coins, profitable-user share *(Starter)*
- `builder_traders` — wallets trading via a builder, with exchange-wide cohort tiers *(Pro)*
- `builder_fills` — individual attributed fills through a builder, perp/spot/HIP-4 *(Pro)*
- `builder_cohorts` — a builder's user base split by behavioral tier *(Pro)*
- `builder_retention` — monthly new-user retention triangle *(Pro)*
- `builder_overlap` — which other builders share this one's users *(Pro)*
- `trader_builders` — every builder one wallet trades through, by fees paid *(Starter)*

Revenue is computed from Hyperliquid's own cumulative builder-fee ledger
(reconciled on-chain); fill-level detail comes from order→fill attribution
with honest coverage caveats in every response (`dataNotes`). Ask your agent
*"which frontends do MetaMask's traders also use?"* — no other data source
can answer that.

## What's new in 0.10.0

**Dual-vocabulary cohort tiers.** New canonical tier slugs accepted everywhere
a tier is an input — PnL tiers (`apex`, `sharps`, `grinders`, `scrapers`,
`crowd`, `bleeders`, `trapped`, `blown_out`) and weight-class size tiers
(`heavyweights` … `strawweights`). Legacy slugs (`money_printer`,
`smart_money`, …) remain valid indefinitely; responses are unchanged. No
breaking changes.

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

There are two ways to connect. Both expose the same 103 read-only tools and both require a Coinversa API key (`cvsa_...`) — there is no keyless tier.

| Method | Where | Auth | Best for |
|--------|-------|------|----------|
| **Hosted Remote MCP** (recommended) | `https://mcp.coinversa.ai/mcp` | OAuth 2.1 in the browser — no key handling in the client | Claude.ai, Claude Desktop, Claude Code, Cursor, ChatGPT, Perplexity, any Streamable HTTP client |
| Local stdio MCP (this package) | `npx -y @coinversaa/mcp-server@0.11.1` | `COINVERSAA_API_KEY` env var | Codex and other stdio-only clients, air-gapped setups, development |

The canonical, always-current client guide lives at [docs.coinversa.ai/mcp/setup](https://docs.coinversa.ai/mcp/setup). The snippets below mirror it.

### Hosted Remote MCP (OAuth)

Paste the URL into your client and leave every auth/header field empty. The client discovers the OAuth flow automatically and opens a Coinversa authorization page in your browser. There you either:

- click **Sign in / Sign up & get a key** — the developer portal opens in a popup, you pick (or auto-create) a key, and a one-time connect code is handed back to the authorization page; the raw key never reaches the MCP server in this path — or
- paste an existing `cvsa_` key directly.

Click **Authorize** and you are connected. New accounts get 14 days of Pro, no credit card. Revoking a key in the [developer portal](https://developers.coinversa.ai/keys) instantly disconnects every agent that authorized with it.

#### Claude.ai (web)

1. Open [claude.ai/customize/connectors?modal=add-custom-connector](https://claude.ai/customize/connectors?modal=add-custom-connector).
2. **Name:** `Coinversa` — **URL:** `https://mcp.coinversa.ai/mcp`. Leave the auth fields empty.
3. Click **Add**, then **Connect**; sign in on the Coinversa page and click **Authorize**.
4. In a new chat ask: *"What are the global trading stats from Coinversa Pulse?"* — Claude should call `pulse_global_stats`.

#### Claude Desktop

Claude Desktop speaks stdio only, so use the `mcp-remote` shim, which bridges stdio ↔ HTTP and handles the OAuth dance. Edit your config file:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "coinversa": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.coinversa.ai/mcp"]
    }
  }
}
```

Fully quit and reopen Claude Desktop. On first connection `mcp-remote` opens the Coinversa authorization page in your browser — sign in and click **Authorize**.

#### Cursor

Cursor supports HTTP MCP servers natively. Add to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "coinversa": {
      "url": "https://mcp.coinversa.ai/mcp"
    }
  }
}
```

Restart Cursor and approve the authorization prompt in your browser. The one-click **Install in Cursor** deeplink at [developers.coinversa.ai/connect](https://developers.coinversa.ai/connect) works too.

#### Claude Code

```bash
claude mcp add --transport http coinversa https://mcp.coinversa.ai/mcp
```

Then run `/mcp` inside Claude Code and choose **Authenticate** for `coinversa`; the browser flow is the same as above.

#### ChatGPT, Perplexity, and other remote clients

Add a custom connector / remote MCP server with URL `https://mcp.coinversa.ai/mcp` and no headers. The client will open the Coinversa authorization page on first use.

### Local stdio MCP (npx + API key)

For stdio-only clients (for example Codex) or when you would rather hold the key yourself, run this npm package locally. Get a key from the [developer portal](https://developers.coinversa.ai/keys).

```json
{
  "mcpServers": {
    "coinversa": {
      "command": "npx",
      "args": ["-y", "@coinversaa/mcp-server@0.11.1"],
      "env": {
        "COINVERSAA_API_KEY": "cvsa_your_key_here"
      }
    }
  }
}
```

Or from a shell:

```bash
COINVERSAA_API_KEY=cvsa_... npx -y @coinversaa/mcp-server@0.11.1
```

This runs the same tools locally over stdio, authenticated by the env key instead of OAuth. The stdio server exits at startup if `COINVERSAA_API_KEY` is missing. No cloning, no building — `npx` handles everything.

### Verify it works

Ask the agent: *"Use Coinversa Pulse to show me the top 5 traders on Hyperliquid by total PnL this week."* You should see a `pulse_leaderboard` call with ranked addresses. `pulse_my_plan` shows which plan the connected key is on and what each tier unlocks. If the agent reports a 401, the authorization expired or the key was revoked — reconnect the connector and it will reopen the authorization page.

## Hosted Remote MCP

**Endpoint:** `https://mcp.coinversa.ai/mcp` — Streamable HTTP, stateless. Each `POST /mcp` carries one JSON-RPC request (or batch) and gets its response on that connection; there are no server-side sessions to resume, so `GET /mcp` and `DELETE /mcp` return `405 Method Not Allowed`. There is no SSE endpoint.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/mcp` | `POST` | MCP Streamable HTTP endpoint (requires a valid OAuth access token) |
| `/health` | `GET` | Health check — returns `{ ok, name, version }` |
| `/.well-known/oauth-authorization-server` | `GET` | OAuth 2.1 authorization-server metadata (RFC 8414) |
| `/.well-known/oauth-protected-resource/mcp` | `GET` | Protected-resource metadata (RFC 9728) — this is what clients follow from the `401` on `/mcp` |
| `/authorize` | `GET` | Authorization endpoint; renders the consent page |
| `/token` | `POST` | Token endpoint (`authorization_code` + PKCE, `refresh_token`) |
| `/register` | `POST` | Dynamic client registration (RFC 7591) |
| `/revoke` | `POST` | Token revocation (RFC 7009) |

The hosted server is operated by Coinversa and calls the first-party Coinversa API at `https://api.coinversa.ai` on your behalf, with the key you authorized. It is not a third-party proxy. It serves the same tool definitions as this package (same names, descriptions, input schemas, titles, and annotations — enforced by `tests/toolParity.test.ts`); this repository is the source of the npm stdio package, not of the hosted OAuth server itself.

## Authentication

The hosted endpoint supports exactly one authentication method: **OAuth 2.1 with PKCE (S256) and dynamic client registration**. Every conformant client (Claude.ai, Claude Desktop via `mcp-remote`, Claude Code, Cursor, ChatGPT, Perplexity) handles this automatically from the URL alone.

How it works:

1. The client `POST`s to `/mcp` without a token, gets `401` with a `WWW-Authenticate` header pointing at the protected-resource metadata, and discovers the authorization server from there.
2. The client registers itself via `/register` (DCR), then opens `/authorize` in the browser with a PKCE code challenge.
3. You see the Coinversa consent page. You either paste a `cvsa_` key or click **Sign in / Sign up & get a key**, which opens the developer portal in a popup and returns a short-lived, single-use connect code to the consent page. In the portal path the raw key never reaches the MCP server — it stores only a key reference that the backend resolves.
4. The client exchanges the authorization code (plus PKCE verifier) at `/token` for tokens.

Token details:

| Token | Format | Lifetime |
|-------|--------|----------|
| Access token | opaque, random | 1 hour |
| Refresh token | opaque, random, rotated on every refresh | 90 days, sliding |

Tokens are stored hashed (SHA-256) on the server. Revoking the underlying API key in the developer portal invalidates every session authorized with it.

There is **no header-based API-key authentication on the hosted endpoint.** Requests that skip OAuth and put a raw `cvsa_` key in an `Authorization` or custom header are rejected with `401`. If you want to authenticate with a key you hold, run the local stdio server instead (see above), which reads `COINVERSAA_API_KEY` from its environment and sends it to the Coinversa API itself.

## Privacy & data handling

The hosted server is a thin, stateless bridge between your MCP client and the Coinversa API.

**What it stores (a SQLite database on Coinversa infrastructure):**

- OAuth client registrations created through dynamic client registration (client id, redirect URIs, client metadata).
- Access and refresh tokens, stored as SHA-256 hashes — the plaintext token exists only in your client.
- The API-key grant behind each token: either a **key id** (a reference the backend resolves; the key itself is never stored) when you connected through the developer portal, or the pasted key **encrypted at rest with AES-256-GCM** under a key-encryption key that lives outside the database.

**What it never stores:**

- Conversation content. The server only ever sees the tool call in flight, not your chat.
- Tool arguments or results beyond the lifetime of the request being served. Nothing is written to a database, and parameters are not logged.
- Wallet private keys, seed phrases, signatures, exchange credentials, or any custody material — no tool asks for them and none exist.

**The local stdio server** stores nothing at all: it holds `COINVERSAA_API_KEY` in memory for the life of the process and forwards each tool call to the Coinversa API.

**What tool calls send to the Coinversa API:** the parameters you can see in each tool's schema — market symbols, public wallet addresses, cohort names, HIP-4 outcome ids, builder addresses, time windows — plus your API key for authorization and metering. Usage is counted against the key's plan; see [Rate Limits](#rate-limits).

**Scope:** every tool is read-only and is annotated as such (`readOnlyHint: true`, `destructiveHint: false`). The server cannot place orders, sign transactions, move funds, approve agents, or change any account setting on Hyperliquid or Coinversa.

**Revocation:** revoke the API key in the [developer portal](https://developers.coinversa.ai/keys) to disconnect every agent that authorized with it, or remove the connector in your client; clients may also call `/revoke`.

Policies: [coinversa.ai/privacy](https://coinversa.ai/privacy) · [coinversa.ai/terms](https://coinversa.ai/terms). Questions or data requests: [chat@coinversaa.ai](mailto:chat@coinversaa.ai).

## Connector directory

For directory reviewers and security teams, in one place:

- **Read-only.** 103 tools, all `GET`-equivalent analytics; no write, trade, transfer, or account-mutation capability of any kind. No financial transactions are possible through this connector.
- **Auth:** OAuth 2.1, PKCE S256, dynamic client registration, refresh-token rotation. No API keys in headers, no static secrets in client config.
- **Data source:** first-party — the server is operated by Coinversa and calls only Coinversa's own API at `api.coinversa.ai` (plus, during sign-in, the Coinversa developer portal/backend). No third-party data brokers or LLM providers are called.
- **Transport:** Streamable HTTP (stateless `POST /mcp`), TLS only.
- **Data retention:** hashed tokens, encrypted key or key id, DCR client records. No conversation or parameter logging.
- **Source:** [github.com/coinversaa/mcp-server](https://github.com/coinversaa/mcp-server) (MIT) — the npm stdio package, with the same tool definitions the hosted connector serves.
- **Support:** [chat@coinversaa.ai](mailto:chat@coinversaa.ai) · [Privacy](https://coinversa.ai/privacy) · [Terms](https://coinversa.ai/terms)

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

## Available Tools (103)

All 103 tools require an API key. The MCP registers the full tool set, and the Coinversa API enforces access by key tier. Free API keys can use public/discovery routes, while Starter, Pro, and Enterprise keys unlock deeper trader, HIP-4, risk, historical, and official OI tools.

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

### Builder Analytics — 0.11.x

Builders (frontends, wallet apps, bots, HIP-3 dexes) charge per-order builder fees on Hyperliquid. Revenue figures are exact, from the on-chain cumulative builder-fee ledger; volume/user/fill detail comes from order→fill attribution and slightly undercounts because trigger-order (stop/TP) fills are not yet attributed — every response carries a `dataNotes` explanation and a `verified` ledger-block stamp. Builder addresses are `0x` plus 40 hex characters.

| Tool | Tier | Description |
|------|------|-------------|
| `builder_leaderboard` | Starter | Builders ranked by exact ledger revenue, with attributed volume/users/fills and prev-window deltas |
| `builder_profile` | Starter | One builder: revenue, daily series, top coins, profitable-user share |
| `trader_builders` | Starter | Every builder one wallet trades through, ordered by fees paid |
| `builder_traders` | Pro | A builder's attributed wallets with PnL, fees, volume, and all-time cohort tiers |
| `builder_fills` | Pro | Individual attributed fills through a builder (perp/spot/HIP-4) |
| `builder_cohorts` | Pro | A builder's user base split by behavioral tier |
| `builder_retention` | Pro | Monthly new-user retention triangle, last 12 months |
| `builder_overlap` | Pro | Which other builders share this builder's active users |
| `builder_journey` | Pro | Revenue ramp of the trailing-year acquisition cohort: lifetime fees per wallet, whale concentration, days to peak / 50% / 75% of lifetime revenue |
| `builder_lifecycle` | Pro | Lifetime user base split into active / cooling / switched / dormant / movedOn, plus true retention, churn, and competitive loss |
| `builder_heatmap` | Pro | Trailing 84 days as a 7×24 UTC weekday-by-hour grid of volume, fees, and fills |
| `builder_orders` | Pro | Placement-plane intent: action and time-in-force mix, reduce-only share, stop/TP trigger breakdown, fill conversion |

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

These apply to the **local stdio server** (`npx -y @coinversaa/mcp-server@0.11.1`). The hosted endpoint needs no configuration.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COINVERSAA_API_KEY` | Yes | — | Your API key (starts with `cvsa_`). Required for every tool; the stdio server exits at startup without it. |
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

This repository is the source of the `@coinversaa/mcp-server` npm package — a stdio MCP server whose entry is `src/index.ts` → `createCoinversaServer()` in `src/coinversaServer.ts`.

```bash
git clone https://github.com/coinversaa/mcp-server.git
cd mcp-server
npm install
npm run build

# run the stdio server against your key
COINVERSAA_API_KEY=cvsa_... node build/index.js

# or drive it with the MCP Inspector
npx @modelcontextprotocol/inspector build/index.js

# unit tests (bun) and typecheck
bun test
npx tsc --noEmit
```

The hosted OAuth connector at `https://mcp.coinversa.ai/mcp` is operated by Coinversa and is not built from this repository; it serves the same tool set.

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
