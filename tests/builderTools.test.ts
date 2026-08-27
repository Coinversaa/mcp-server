// Unit tests for the builder-analytics tools (the 12-tool BUILDER ANALYTICS
// block): the period and address schema contracts, and end-to-end registration
// via an in-memory client/server pair. The period test pins the day|week|month
// backend enum (NOT 24h/7d/30d — a contract error in early docs).
//
// Run: bun test tests/builderTools.test.ts

import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  builderAddressSchema,
  builderPeriodSchema,
  createCoinversaServer,
  COINVERSA_TOTAL_TOOL_COUNT,
} from "../src/coinversaServer.js";

const BUILDER_TOOL_NAMES = [
  "builder_leaderboard",
  "builder_profile",
  "builder_traders",
  "builder_fills",
  "builder_cohorts",
  "builder_retention",
  "builder_overlap",
  "trader_builders",
  "builder_journey",
  "builder_lifecycle",
  "builder_heatmap",
  "builder_orders",
];

describe("builderPeriodSchema", () => {
  test("accepts exactly day, week, month", () => {
    for (const period of ["day", "week", "month"]) {
      expect(builderPeriodSchema.parse(period)).toBe(period);
    }
  });

  test("rejects the 24h/7d/30d/all vocabulary and other junk", () => {
    for (const bad of ["24h", "7d", "30d", "all", "Week", "DAY", "monthly", ""]) {
      expect(builderPeriodSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("builderAddressSchema", () => {
  const valid = "0x1234567890abcdefABCDEF1234567890abcdef12";

  test("accepts a 0x + 40-hex address", () => {
    expect(builderAddressSchema.parse(valid)).toBe(valid);
  });

  test("rejects malformed addresses", () => {
    for (const bad of [
      "1234567890abcdefABCDEF1234567890abcdef12", // missing 0x
      "0x1234", // too short
      valid + "ab", // too long
      "0x1234567890abcdefABCDEF1234567890abcdefZZ", // non-hex
      "",
    ]) {
      expect(builderAddressSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("builder tool registration", () => {
  test("all 12 builder tools are listed and the total count is 103", async () => {
    const server = createCoinversaServer({ apiKey: "test" });

    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    for (const name of BUILDER_TOOL_NAMES) {
      expect(names.has(name)).toBe(true);
    }
    expect(COINVERSA_TOTAL_TOOL_COUNT).toBe(103);
    expect(tools.length).toBe(COINVERSA_TOTAL_TOOL_COUNT);

    await client.close();
    await server.close();
  });
});
