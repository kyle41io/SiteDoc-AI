import { describe, expect, it } from "vitest";
import { auditStrings } from "@/lib/audit/audit-i18n";
import { isLocale, LOCALES } from "@/i18n/config";

describe("isLocale", () => {
  it("accepts supported locales", () => {
    for (const l of LOCALES) expect(isLocale(l)).toBe(true);
  });

  it("rejects everything else", () => {
    for (const v of ["de", "english", "", undefined, null, 5]) {
      expect(isLocale(v)).toBe(false);
    }
  });
});

describe("auditStrings", () => {
  it("returns localized strings for each supported locale", () => {
    for (const l of LOCALES) {
      const s = auditStrings(l);
      expect(typeof s.consoleIssueTitle).toBe("string");
      expect(s.consoleIssueTitle.length).toBeGreaterThan(0);
      expect(s.networkIssueTitleStatus(404)).toContain("404");
      expect(s.summaryClean("1.2")).toContain("1.2");
    }
  });

  it("falls back to English for unknown/empty locales", () => {
    const en = auditStrings("en");
    expect(auditStrings("de").consoleIssueTitle).toBe(en.consoleIssueTitle);
    expect(auditStrings(undefined).consoleIssueTitle).toBe(en.consoleIssueTitle);
  });

  it("produces distinct text per locale", () => {
    expect(auditStrings("ja").consoleIssueTitle).not.toBe(
      auditStrings("en").consoleIssueTitle,
    );
  });
});
