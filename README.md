# Coinversaa Pulse — MCP Server

<a href="https://glama.ai/mcp/servers"><img width="380" height="20" src="https://glama.ai/mcp/servers/badge" alt="MCP Server" /></a>

Crypto intelligence for AI agents. Query 710K+ Hyperliquid wallets, 1.8B+ trades, behavioral cohorts, and live market data through any MCP-compatible client.

## Quick Start

### 1. Get an API Key

Sign up at [coinversaa.ai](https://coinversaa.ai) and generate a key from **Settings > API Keys**.

### 2. Configure Your MCP Client

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

## Available Tools (26)

### Pulse — Trader Intelligence

| Tool | Description |
|------|-------------|
| `pulse_global_stats` | Total traders, trades, volume, PnL across Hyperliquid |
| `pulse_market_overview` | Live prices, funding rates, OI for every pair |
| `pulse_leaderboard` | Top traders ranked by PnL, win rate, volume, score, or risk-adjusted returns |
| `pulse_hidden_gems` | Underrated high-performers most platforms miss |
| `pulse_most_traded_coins` | Most actively traded coins ranked by volume and trade count |
| `pulse_biggest_trades` | Biggest winning or losing trades across all of Hyperliquid |
| `pulse_recent_trades` | Biggest trades in the last N minutes/hours |
| `pulse_token_leaderboard` | Top traders for a specific coin |

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

| Tool | Description |
|------|-------------|
| `pulse_cohort_summary` | Behavioral tier breakdown across 710K+ wallets |
| `pulse_cohort_positions` | What money_printers / whales are holding RIGHT NOW |
| `pulse_cohort_trades` | Every trade a cohort made in the last N minutes/hours |
| `pulse_cohort_history` | Historical performance trends for any cohort |

### Market — Live Data

| Tool | Description |
|------|-------------|
| `market_price` | Current mark price for any symbol |
| `market_positions` | Open positions for any wallet |
| `market_orderbook` | Bid/ask depth for any trading pair |

### Live — Real-Time Analytics

| Tool | Description |
|------|-------------|
| `live_liquidation_heatmap` | Liquidation clusters across price levels — support/resistance signals |
| `live_long_short_ratio` | Global or per-coin long/short ratio with optional history |
| `live_cohort_bias` | Net long/short stance for every tier on a given coin |
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
- "Are smart money traders long or short ETH right now?"
- "Show me the biggest losses in the last 24 hours"
- "What coins are most actively traded right now?"
- "What's this trader's average hold time and position win rate?"

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COINVERSAA_API_KEY` | Yes | — | Your API key (starts with `cvsa_`) |
| `COINVERSAA_API_URL` | No | `https://app.coinversaa.ai` | API base URL (override for self-hosted) |

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

This isn't a wrapper around a public blockchain API. Coinversaa indexes Hyperliquid's clearinghouse directly and computes analytics that don't exist anywhere else:

- **Behavioral cohorts**: 710K wallets classified into PnL tiers (money_printer to giga_rekt) and size tiers (leviathan to shrimp)
- **Live cohort positions**: See what the best traders are holding in real-time
- **Real-time trade feed**: Every trade by any wallet or cohort, queryable by time window
- **Liquidation heatmaps**: Cluster analysis across price levels for any coin
- **Closed position analytics**: Full position lifecycle with hold duration and entry/exit analysis
- **Hidden gem discovery**: Find skilled traders that ranking sites miss
- **1.8B+ trades indexed**: The deepest Hyperliquid dataset available as an API

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](LICENSE)

---

Built by [Coinversaa](https://coinversaa.ai)
