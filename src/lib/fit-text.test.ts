import { describe, expect, it } from "vitest";
import { estimateTextWidthEm } from "@/lib/fit-text";

describe("estimateTextWidthEm", () => {
  it("grows with the length of the text", () => {
    expect(estimateTextWidthEm("https://example.com/a")).toBeGreaterThan(
      estimateTextWidthEm("https://example.com"),
    );
  });

  it("counts CJK characters as a full em each", () => {
    expect(estimateTextWidthEm("团队可立即处理")).toBeCloseTo(7, 1);
    expect(estimateTextWidthEm("チームがすぐ")).toBeCloseTo(6, 1);
  });

  it("ignores combining marks, so diacritics add no width", () => {
    const composed = "Vi\u1ec7t"; // e-with-circumflex-and-dot-below as one code point
    const decomposed = "Việt"; // the same, spelled out
    expect(estimateTextWidthEm(decomposed)).toBeCloseTo(estimateTextWidthEm(composed), 2);
    expect(estimateTextWidthEm(composed)).toBeCloseTo(estimateTextWidthEm("Viet"), 2);
  });

  it("treats spaces as narrower than letters", () => {
    expect(estimateTextWidthEm("a a")).toBeLessThan(estimateTextWidthEm("aaa"));
  });

  it("keeps a Latin string well under one em per character", () => {
    const text = "Website QA reports your team can act on.";
    const em = estimateTextWidthEm(text);
    expect(em).toBeLessThan(text.length);
    expect(em).toBeGreaterThan(text.length * 0.4);
  });

  it("never returns less than one em, so it is safe to divide by", () => {
    expect(estimateTextWidthEm("")).toBe(1);
    expect(estimateTextWidthEm(".")).toBe(1);
  });
});
