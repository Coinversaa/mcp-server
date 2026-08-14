// Unit tests for the cohort tier vocabulary: new→legacy normalization,
// legacy passthrough, and enum acceptance/rejection.
// Run with: bun test

import { describe, expect, test } from "bun:test";
import { NEW_TO_LEGACY_TIER, normalizeTier, tierEnum, TIER_SLUGS } from "../src/coinversaServer.js";

const NEW_TO_LEGACY_EXPECTED: Array<[string, string]> = [
  // PnL tiers
  ["apex", "money_printer"],
  ["sharps", "smart_money"],
  ["grinders", "grinder"],
  ["scrapers", "humble_earner"],
  ["crowd", "exit_liquidity"],
  ["bleeders", "semi_rekt"],
  ["trapped", "full_rekt"],
  ["blown_out", "giga_rekt"],
  // Size tiers
  ["heavyweights", "leviathan"],
  ["cruiserweights", "tidal_whale"],
  ["middleweights", "whale"],
  ["welterweights", "small_whale"],
  ["lightweights", "apex_predator"],
  ["featherweights", "dolphin"],
  ["flyweights", "fish"],
  ["strawweights", "shrimp"],
];

describe("normalizeTier", () => {
  test("maps every new slug to its legacy equivalent (all 16)", () => {
    for (const [newSlug, legacySlug] of NEW_TO_LEGACY_EXPECTED) {
      expect(normalizeTier(newSlug)).toBe(legacySlug);
    }
  });

  test("mapping table covers exactly the 16 new slugs", () => {
    expect(Object.keys(NEW_TO_LEGACY_TIER).sort()).toEqual(
      NEW_TO_LEGACY_EXPECTED.map(([n]) => n).sort()
    );
  });

  test("passes every legacy slug through unchanged", () => {
    for (const [, legacySlug] of NEW_TO_LEGACY_EXPECTED) {
      expect(normalizeTier(legacySlug)).toBe(legacySlug);
    }
  });
});

describe("tierEnum", () => {
  test("accepts all 32 slugs (16 new + 16 legacy)", () => {
    expect(TIER_SLUGS.length).toBe(32);
    for (const slug of TIER_SLUGS) {
      expect(tierEnum.parse(slug)).toBe(slug);
    }
  });

  test("rejects unknown slugs", () => {
    for (const bad of ["mega_whale", "APEX", "Apex", "sharp", "", "money-printer"]) {
      expect(tierEnum.safeParse(bad).success).toBe(false);
    }
  });

  test("every new slug's legacy target is itself an accepted slug", () => {
    const slugSet = new Set<string>(TIER_SLUGS);
    for (const legacy of Object.values(NEW_TO_LEGACY_TIER)) {
      expect(slugSet.has(legacy)).toBe(true);
    }
  });
});
