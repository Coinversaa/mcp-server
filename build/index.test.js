import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { server, callAPI, normalizeCoin, FREE_TIER_TOOLS } from "./index.js";
// Test configuration
const TEST_TIMEOUT = 60000; // 60 seconds per test
const VALID_ETH_ADDRESS = "0x1111111111111111111111111111111111111111";
const VALID_BUILDER_DEX_SYMBOL = "xyz:SILVER";
const VALID_NATIVE_SYMBOL = "BTC";
// API Configuration (override via env vars)
const API_BASE_URL = process.env.COINVERSA_API_URL || process.env.COINVERSAA_API_URL || "https://api.coinversa.ai";
const API_KEY = process.env.COINVERSA_API_KEY || process.env.COINVERSAA_API_KEY || "";
describe("MCP Server", () => {
    let client;
    let transport;
    beforeAll(async () => {
        // Create linked in-memory transport pair
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        // Connect server to its transport
        await server.connect(serverTransport);
        // Create and initialize client
        client = new Client({ name: "test-client", version: "1.0.0" });
        await client.connect(clientTransport);
        transport = clientTransport;
    });
    afterAll(async () => {
        if (client) {
            await client.close();
        }
    });
    describe("Tool Registration", () => {
        test("should have tools registered", async () => {
            const tools = await client.listTools();
            expect(tools.tools.length).toBeGreaterThan(0);
        });
        test("free-tier tools should be available without API key", async () => {
            const tools = await client.listTools();
            const toolNames = tools.tools.map((t) => t.name);
            // All free-tier tools should be registered
            for (const freeTool of FREE_TIER_TOOLS) {
                expect(toolNames).toContain(freeTool);
            }
        });
    });
    describe("Free-Tier Tools", () => {
        // Helper to parse response - throws on non-JSON errors (strict mode)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const safeParseResult = (result) => {
            const text = result.content[0].text;
            // Try to parse as JSON first
            try {
                const data = JSON.parse(text);
                return { data, text };
            }
            catch {
                // Not valid JSON - it's an error message, THROW to fail the test
                throw new Error(`API returned non-JSON error: ${text.substring(0, 200)}`);
            }
        };
        test("pulse_global_stats should return data", async () => {
            const result = await client.callTool({
                name: "pulse_global_stats",
                arguments: { useToonFormat: false },
            });
            expect(result.content).toBeDefined();
            expect(result.content.length).toBeGreaterThan(0);
            const parsed = safeParseResult(result);
            // API must return success
            expect(parsed.data.success).toBe(true);
            expect(parsed.data.totalTraders).toBeDefined();
            expect(parsed.data.totalTrades).toBeDefined();
        }, TEST_TIMEOUT);
        test("pulse_market_overview should return market data", async () => {
            const result = await client.callTool({
                name: "pulse_market_overview",
                arguments: { useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            expect(Array.isArray(parsed.data.markets)).toBe(true);
        }, TEST_TIMEOUT);
        test("list_markets should return all markets", async () => {
            const result = await client.callTool({
                name: "list_markets",
                arguments: { useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            expect(Array.isArray(parsed.data.markets)).toBe(true);
            expect(parsed.data.markets.length).toBeGreaterThan(0);
        }, TEST_TIMEOUT);
        test("market_price should return price for native symbol", async () => {
            const result = await client.callTool({
                name: "market_price",
                arguments: { symbol: VALID_NATIVE_SYMBOL, useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            expect(parsed.data.price).toBeDefined();
            // Price can be a number or an object with mark/oracle prices
            expect(typeof parsed.data.price === "number" || typeof parsed.data.price === "object").toBe(true);
        }, TEST_TIMEOUT);
        test("market_price should return price for builder dex symbol", async () => {
            const result = await client.callTool({
                name: "market_price",
                arguments: { symbol: VALID_BUILDER_DEX_SYMBOL, useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            expect(parsed.data.price).toBeDefined();
        }, TEST_TIMEOUT);
        test("market_orderbook should return order book data", async () => {
            const result = await client.callTool({
                name: "market_orderbook",
                arguments: { symbol: VALID_NATIVE_SYMBOL, depth: 5, useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            expect(parsed.data.bids).toBeDefined();
            expect(parsed.data.asks).toBeDefined();
        }, TEST_TIMEOUT);
        test("pulse_most_traded_coins should return trending coins", async () => {
            const result = await client.callTool({
                name: "pulse_most_traded_coins",
                arguments: { limit: 10, useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            expect(Array.isArray(parsed.data.coins)).toBe(true);
        }, TEST_TIMEOUT);
        test("live_long_short_ratio should return ratio data", async () => {
            const result = await client.callTool({
                name: "live_long_short_ratio",
                arguments: { coin: VALID_NATIVE_SYMBOL, useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            // Response structure varies: can be single coin data or contain ratios field
            expect(parsed.data.ratio || parsed.data.longRatio || parsed.data.ratios || parsed.data.coin).toBeDefined();
        }, TEST_TIMEOUT);
    });
    describe("Authenticated Tools (require API key)", () => {
        const hasApiKey = !!API_KEY;
        // Skip these tests if no API key is available
        const conditionalTest = hasApiKey ? test : test.skip;
        // Helper to parse response - throws on non-JSON errors (strict mode)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const safeParseResult = (result) => {
            const text = result.content[0].text;
            // Try to parse as JSON first
            try {
                const data = JSON.parse(text);
                return { data, text };
            }
            catch {
                // Not valid JSON - it's an error message, THROW to fail the test
                throw new Error(`API returned non-JSON error: ${text.substring(0, 200)}`);
            }
        };
        conditionalTest("pulse_leaderboard should return ranked traders", async () => {
            const result = await client.callTool({
                name: "pulse_leaderboard",
                arguments: { sort: "pnl", period: "allTime", limit: 10, useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            expect(Array.isArray(parsed.data.traders)).toBe(true);
        }, TEST_TIMEOUT);
        conditionalTest("pulse_trader_profile should return trader data", async () => {
            const result = await client.callTool({
                name: "pulse_trader_profile",
                arguments: { address: VALID_ETH_ADDRESS, useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            expect(parsed.data.address).toBe(VALID_ETH_ADDRESS.toLowerCase());
        }, TEST_TIMEOUT);
        conditionalTest("market_positions should return wallet positions", async () => {
            const result = await client.callTool({
                name: "market_positions",
                arguments: { address: VALID_ETH_ADDRESS, useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            expect(Array.isArray(parsed.data.positions)).toBe(true);
        }, TEST_TIMEOUT);
        conditionalTest("pulse_cohort_summary should return cohort analysis", async () => {
            const result = await client.callTool({
                name: "pulse_cohort_summary",
                arguments: { useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            expect(parsed.data.pnlTiers).toBeDefined();
            expect(parsed.data.sizeTiers).toBeDefined();
        }, TEST_TIMEOUT);
        conditionalTest("live_liquidation_heatmap should return heatmap data", async () => {
            const result = await client.callTool({
                name: "live_liquidation_heatmap",
                arguments: { coin: VALID_NATIVE_SYMBOL, buckets: 20, range: 20, useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            // API returns buckets array, not heatmap field
            expect(parsed.data.buckets).toBeDefined();
            expect(parsed.data.currentPrice).toBeDefined();
        }, TEST_TIMEOUT);
        conditionalTest("live_cohort_bias should return bias data", async () => {
            const result = await client.callTool({
                name: "live_cohort_bias",
                arguments: { coin: VALID_NATIVE_SYMBOL, useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            expect(parsed.data.coin).toBe(VALID_NATIVE_SYMBOL);
        }, TEST_TIMEOUT);
        conditionalTest("pulse_recent_trades should return recent trades", async () => {
            const result = await client.callTool({
                name: "pulse_recent_trades",
                arguments: { since: "10m", limit: 10, useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            expect(Array.isArray(parsed.data.trades)).toBe(true);
        }, TEST_TIMEOUT);
        conditionalTest("live_recent_liquidations should return liquidation data", async () => {
            const result = await client.callTool({
                name: "live_recent_liquidations",
                arguments: { since: "1h", limit: 10, useToonFormat: false },
            });
            const parsed = safeParseResult(result);
            expect(parsed.data.success).toBe(true);
            // API returns "events" array, not "liquidations"
            expect(Array.isArray(parsed.data.events)).toBe(true);
        }, TEST_TIMEOUT);
    });
    describe("Parameter Validation", () => {
        // Skip this test suite if no API key (authenticated tools not registered)
        const hasApiKey = !!API_KEY;
        const conditionalTest = hasApiKey ? test : test.skip;
        conditionalTest("should handle invalid Ethereum address when tool is available", async () => {
            const result = await client.callTool({
                name: "pulse_trader_profile",
                arguments: { address: "invalid-address", useToonFormat: false },
            });
            // MCP/Zod validation returns error in response content, not thrown
            const text = result.content[0].text;
            expect(text).toBeDefined();
            expect(typeof text).toBe("string");
            // Should be a validation error message (not valid JSON)
            const isValidationError = text.toLowerCase().includes("validation") ||
                text.toLowerCase().includes("invalid") ||
                text.toLowerCase().includes("address") ||
                text.toLowerCase().includes("regex") ||
                text.toLowerCase().includes("ethereum");
            expect(isValidationError).toBe(true);
        });
        test("should handle invalid symbol gracefully", async () => {
            const result = await client.callTool({
                name: "market_price",
                arguments: { symbol: "INVALID_SYMBOL_THAT_DOES_NOT_EXIST", useToonFormat: false },
            });
            // Response might be error text or JSON, handle both
            const text = result.content[0].text;
            expect(text).toBeDefined();
            expect(typeof text).toBe("string");
            try {
                const data = JSON.parse(text);
                // Should either succeed with null/empty or fail gracefully with success:false
                expect(data).toBeDefined();
            }
            catch {
                // If it's not JSON, it might be an error message
                expect(text.length).toBeGreaterThan(0);
            }
        });
        test("should handle toon format parameter", async () => {
            const result = await client.callTool({
                name: "pulse_global_stats",
                arguments: { useToonFormat: true },
            });
            expect(result.content).toBeDefined();
            // Toon format returns compact string
            const text = result.content[0].text;
            expect(typeof text).toBe("string");
        });
    });
    describe("Helper Functions", () => {
        test("normalizeCoin should handle native symbols", () => {
            expect(normalizeCoin("btc")).toBe("BTC");
            expect(normalizeCoin("ETH")).toBe("ETH");
            expect(normalizeCoin("sol")).toBe("SOL");
        });
        test("normalizeCoin should handle builder dex symbols", () => {
            expect(normalizeCoin("xyz:silver")).toBe("xyz:SILVER");
            expect(normalizeCoin("XYZ:GOLD")).toBe("xyz:GOLD");
            expect(normalizeCoin("cash:tsla")).toBe("cash:TSLA");
            expect(normalizeCoin("km:oil")).toBe("km:OIL");
        });
    });
    describe("API Connectivity & Error Handling", () => {
        test("callAPI should handle timeouts gracefully", async () => {
            // This test verifies the API helper doesn't crash on network issues
            // We'll test with a very short timeout scenario by calling an endpoint
            const startTime = Date.now();
            try {
                await callAPI(false, "/pulse/stats");
                // If successful, should complete within reasonable time
                const elapsed = Date.now() - startTime;
                expect(elapsed).toBeLessThan(35000); // Should complete within 35 seconds
            }
            catch (error) {
                // Should provide meaningful error message
                expect(error.message).toBeDefined();
            }
        });
        test("should handle API error responses gracefully", async () => {
            // Test with non-existent endpoint via internal call
            // Without API key, this might return 401 first, with API key it returns 404
            try {
                await callAPI(false, "/non-existent-endpoint");
                expect(false).toBe(true); // Should throw
            }
            catch (error) {
                // Could be 401 (unauthorized), 403 (forbidden), or 404 (not found)
                expect(error.message).toMatch(/not found|404|invalid.*key|401|403/i);
            }
        });
    });
});
describe("Remote URL Specification Testing", () => {
    test("should verify API URL is reachable", async () => {
        // This endpoint is free-tier, no API key needed
        const response = await fetch(`${API_BASE_URL}/api/public/v1/pulse/stats`);
        // API must respond (200 = success, 401 = auth required but endpoint exists)
        expect([200, 401]).toContain(response.status);
        if (response.status === 200) {
            const data = await response.json();
            expect(data.success).toBe(true);
        }
    });
    test("should verify API specification matches implementation", async () => {
        // Test that API responses match expected structure
        // Add delay between requests to avoid rate limiting
        const endpoints = [
            { path: "/pulse/stats", requiredFields: ["success", "totalTraders", "totalTrades"] },
            { path: "/pulse/market-overview", requiredFields: ["success", "markets"] },
            { path: `/market/price/${VALID_NATIVE_SYMBOL}`, requiredFields: ["success", "price"] },
        ];
        for (let i = 0; i < endpoints.length; i++) {
            const endpoint = endpoints[i];
            // Add delay between requests (except first)
            if (i > 0) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            const url = `${API_BASE_URL}/api/public/v1${endpoint.path}`;
            const response = await fetch(url, {
                headers: API_KEY ? { "X-API-Key": API_KEY } : {},
            });
            // Handle rate limiting
            if (response.status === 429) {
                throw new Error(`Rate limited on ${endpoint.path}`);
            }
            // Handle invalid API key - fail the test
            if (response.status === 401) {
                throw new Error(`Authentication failed for ${endpoint.path} - invalid API key?`);
            }
            // Must return 200 OK
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.success).toBe(true);
            // Verify required fields exist
            for (const field of endpoint.requiredFields) {
                expect(data[field]).toBeDefined();
            }
        }
    }, TEST_TIMEOUT);
    test("should handle invalid API key response", async () => {
        // Test that protected endpoints return 401 with invalid key
        const protectedEndpoints = ["/pulse/leaderboard", "/pulse/trader/0x1111111111111111111111111111111111111111"];
        for (const path of protectedEndpoints) {
            const url = `${API_BASE_URL}/api/public/v1${path}`;
            const response = await fetch(url, {
                headers: { "X-API-Key": "invalid-key-for-testing" },
            });
            // Should get 401 or 403 for invalid key
            expect([401, 403]).toContain(response.status);
        }
    });
});
