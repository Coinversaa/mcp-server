#!/usr/bin/env node
// Coinversa Pulse MCP Server (stdio)
// Existing npx workflow entrypoint:
//   COINVERSAA_API_KEY=... npx @coinversaa/mcp-server
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCoinversaServer, COINVERSA_TOTAL_TOOL_COUNT } from "./coinversaServer.js";
async function main() {
    const apiKey = process.env.COINVERSAA_API_KEY?.trim();
    if (!apiKey) {
        console.error("Fatal error: COINVERSAA_API_KEY is required. Get a key at https://developers.coinversa.ai/keys");
        process.exit(1);
    }
    const server = createCoinversaServer({
        apiKey,
        apiUrl: process.env.COINVERSAA_API_URL,
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`Coinversa Pulse MCP server running on stdio (${COINVERSA_TOTAL_TOOL_COUNT} tools registered; backend enforces API-key tier)`);
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
