import { describe, expect, it } from "vitest";
import {
  accessibilityScore,
  overallScore,
  scoreFromCounts,
  severityFromIndex,
} from "@/lib/audit/scoring";

describe("scoreFromCounts", () => {
  it("returns perfect-ish scores for a fast, clean page", () => {
    const scores = scoreFromCounts(0, 0, 2000);
    expect(scores.scanner).toBe(100);
    expect(scores.console).toBe(100);
    expect(scores.network).toBe(100);
    expect(scores.overall).toBe(100);
  });

  it("penalizes console errors but floors the console score at 30", () => {
    expect(scoreFromCounts(1, 0, 2000).console).toBe(92); // 100 - 8
    expect(scoreFromCounts(3, 0, 2000).console).toBe(76); // 100 - 24
    // Penalty is capped at 30, so even many errors floor at 70 here...
    expect(scoreFromCounts(100, 0, 2000).console).toBe(70); // 100 - 30
  });

  it("penalizes failed requests and caps the network penalty at 35", () => {
    expect(scoreFromCounts(0, 1, 2000).network).toBe(90); // 100 - 10
    expect(scoreFromCounts(0, 100, 2000).network).toBe(65); // 100 - 35 cap
  });

  it("penalizes slow scans and floors scanner score at 40", () => {
    expect(scoreFromCounts(0, 0, 2500).scanner).toBe(100); // no penalty under 2500ms
    expect(scoreFromCounts(0, 0, 5000).scanner).toBe(90); // (5000-2500)/250 = 10
    expect(scoreFromCounts(0, 0, 60000).scanner).toBe(70); // penalty capped at 30
  });

  it("computes overall as a weighted blend", () => {
    // scanner 90 * .4 + console 92 * .25 + network 90 * .35 = 36 + 23 + 31.5 = 90.5 -> 91
    const scores = scoreFromCounts(1, 1, 5000);
    expect(scores).toMatchObject({ scanner: 90, console: 92, network: 90 });
    expect(scores.overall).toBe(91);
  });

  it("never produces NaN or out-of-range values", () => {
    for (const [c, n, d] of [
      [0, 0, 0],
      [5, 5, 10000],
      [50, 50, 120000],
    ] as const) {
      const s = scoreFromCounts(c, n, d);
      for (const value of Object.values(s)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("accessibilityScore", () => {
  it("is 100 with no violations", () => {
    expect(accessibilityScore({ critical: 0, serious: 0, moderate: 0, minor: 0 })).toBe(100);
  });

  it("weights critical/serious more than moderate/minor", () => {
    expect(accessibilityScore({ critical: 1, serious: 0, moderate: 0, minor: 0 })).toBe(84);
    expect(accessibilityScore({ critical: 0, serious: 1, moderate: 0, minor: 0 })).toBe(90);
    expect(accessibilityScore({ critical: 0, serious: 0, moderate: 1, minor: 0 })).toBe(96);
    expect(accessibilityScore({ critical: 0, serious: 0, moderate: 0, minor: 1 })).toBe(99);
  });

  it("never drops below 0", () => {
    expect(accessibilityScore({ critical: 20, serious: 0, moderate: 0, minor: 0 })).toBe(0);
  });
});

describe("overallScore", () => {
  it("returns the technical score when no category engines have run", () => {
    expect(overallScore({ technical: 82 })).toBe(82);
  });

  it("normalizes weights over the present categories (accessibility-heavier)", () => {
    // accessibility 0.3 + technical 0.2 → normalized 0.6 / 0.4
    expect(overallScore({ technical: 80, accessibility: 90 })).toBe(86);
  });

  it("blends accessibility, seo, performance, and technical when all present", () => {
    // 80*0.3 + 60*0.25 + 40*0.25 + 100*0.2 = 24 + 15 + 10 + 20 = 69
    expect(
      overallScore({ technical: 100, accessibility: 80, seo: 60, performance: 40 }),
    ).toBe(69);
  });
});

describe("severityFromIndex", () => {
  it("maps the first item to High, next two to Medium, rest to Low", () => {
    expect(severityFromIndex(0)).toBe("High");
    expect(severityFromIndex(1)).toBe("Medium");
    expect(severityFromIndex(2)).toBe("Medium");
    expect(severityFromIndex(3)).toBe("Low");
    expect(severityFromIndex(99)).toBe("Low");
  });
});
