import { describe, expect, it } from "vitest";
import { analyzePerformance, type PerfSnapshot } from "@/lib/audit/performance";
import { auditStrings } from "@/lib/audit/audit-i18n";

const en = auditStrings("en");

const fast: PerfSnapshot = {
  ttfbMs: 150,
  loadMs: 1200,
  resourceCount: 20,
  totalTransferBytes: 400_000,
  imageBytes: 150_000,
  stylesheetCount: 2,
};

function ids(snapshot: PerfSnapshot) {
  return analyzePerformance(snapshot, en).issues.map((i) => i.id);
}

describe("analyzePerformance", () => {
  it("scores a fast, light page 100 with no issues", () => {
    const result = analyzePerformance(fast, en);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
  });

  it("escalates load-time severity by threshold", () => {
    expect(analyzePerformance({ ...fast, loadMs: 4000 }, en).issues[0].severity).toBe("Medium");
    const slow = analyzePerformance({ ...fast, loadMs: 8000 }, en);
    expect(slow.issues[0].severity).toBe("High");
    expect(slow.issues[0].title).toContain("8.0s");
    expect(slow.score).toBe(80);
  });

  it("flags heavy page weight and high request counts", () => {
    expect(ids({ ...fast, totalTransferBytes: 6 * 1_000_000 })).toContain("perf-weight");
    expect(ids({ ...fast, resourceCount: 120 })).toContain("perf-requests");
  });

  it("flags slow TTFB, heavy images, and render-blocking stylesheets", () => {
    expect(ids({ ...fast, ttfbMs: 1500 })).toContain("perf-ttfb");
    expect(ids({ ...fast, imageBytes: 3 * 1_000_000 })).toContain("perf-images");
    expect(ids({ ...fast, stylesheetCount: 8 })).toContain("perf-render-blocking");
  });

  it("tags every issue as Performance and stays non-negative on a worst-case page", () => {
    const bad = analyzePerformance(
      {
        ttfbMs: 5000,
        loadMs: 20000,
        resourceCount: 300,
        totalTransferBytes: 30 * 1_000_000,
        imageBytes: 20 * 1_000_000,
        stylesheetCount: 30,
      },
      en,
    );
    // Max penalties (20+12+15+8+8+4 = 67) → 33; clamp guards against future weights.
    expect(bad.score).toBe(33);
    expect(bad.score).toBeGreaterThanOrEqual(0);
    expect(bad.issues.every((i) => i.category === "Performance")).toBe(true);
  });
});
