import { describe, expect, it } from "vitest";
import { scoreFromCounts, severityFromIndex } from "@/lib/audit/scoring";

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

describe("severityFromIndex", () => {
  it("maps the first item to High, next two to Medium, rest to Low", () => {
    expect(severityFromIndex(0)).toBe("High");
    expect(severityFromIndex(1)).toBe("Medium");
    expect(severityFromIndex(2)).toBe("Medium");
    expect(severityFromIndex(3)).toBe("Low");
    expect(severityFromIndex(99)).toBe("Low");
  });
});
