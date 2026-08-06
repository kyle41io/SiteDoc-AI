import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isFullBleed, PLANET_SPRITE } from "@/lib/celestial-sprite";
import { CELESTIAL_LABEL, type CelestialTier } from "@/lib/celestial";

const PUBLIC_DIR = path.join(process.cwd(), "public");

describe("planet sprites", () => {
  const tiers = Object.keys(CELESTIAL_LABEL) as CelestialTier[];

  it("has artwork for every tier", () => {
    expect(new Set(Object.keys(PLANET_SPRITE))).toEqual(new Set(tiers));
  });

  it("points every tier at a file that exists", () => {
    // A missing sprite is invisible in tests but shows as a broken image in the
    // hero, so assert the assets are actually on disk.
    for (const tier of tiers) {
      const file = path.join(PUBLIC_DIR, PLANET_SPRITE[tier]);
      expect(existsSync(file), `${tier} -> ${PLANET_SPRITE[tier]}`).toBe(true);
    }
  });

  it("gives each tier distinct artwork", () => {
    const files = tiers.map((t) => PLANET_SPRITE[t]);
    expect(new Set(files).size).toBe(tiers.length);
  });

  it("uses transparent PNGs for the planets so the card shows through", () => {
    for (const tier of tiers.filter((t) => !isFullBleed(t))) {
      expect(PLANET_SPRITE[tier]).toMatch(/\.png$/);
    }
  });

  it("treats only the galaxy as full bleed", () => {
    expect(tiers.filter(isFullBleed)).toEqual(["galaxy"]);
  });
});
