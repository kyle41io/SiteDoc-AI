import { describe, expect, it } from "vitest";
import {
  CELESTIAL_COLOR,
  CELESTIAL_LABEL,
  celestialColor,
  celestialTier,
  type CelestialTier,
} from "@/lib/celestial";

describe("celestialTier", () => {
  it("maps each band to the right body", () => {
    expect(celestialTier(0)).toBe("moon");
    expect(celestialTier(39)).toBe("moon");
    expect(celestialTier(40)).toBe("mars");
    expect(celestialTier(59)).toBe("mars");
    expect(celestialTier(60)).toBe("saturn");
    expect(celestialTier(79)).toBe("saturn");
    expect(celestialTier(80)).toBe("earth");
    expect(celestialTier(89)).toBe("earth");
    expect(celestialTier(90)).toBe("sun");
    expect(celestialTier(99)).toBe("sun");
    expect(celestialTier(100)).toBe("galaxy");
  });

  it("clamps out-of-range scores", () => {
    expect(celestialTier(-20)).toBe("moon");
    expect(celestialTier(150)).toBe("galaxy");
  });
});

describe("celestial color/label maps", () => {
  const tiers: CelestialTier[] = ["moon", "mars", "saturn", "earth", "sun", "galaxy"];

  it("celestialColor returns the tier's color", () => {
    expect(celestialColor(0)).toBe(CELESTIAL_COLOR.moon);
    expect(celestialColor(85)).toBe(CELESTIAL_COLOR.earth);
    expect(celestialColor(100)).toBe(CELESTIAL_COLOR.galaxy);
  });

  it("has a color and label for every tier", () => {
    for (const tier of tiers) {
      expect(CELESTIAL_COLOR[tier]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(CELESTIAL_LABEL[tier]).toBeTruthy();
    }
  });
});
