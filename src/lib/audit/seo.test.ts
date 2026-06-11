import { describe, expect, it } from "vitest";
import { analyzeSeo, type SeoSnapshot } from "@/lib/audit/seo";
import { auditStrings } from "@/lib/audit/audit-i18n";

const en = auditStrings("en");

const perfect: SeoSnapshot = {
  title: "A good, descriptive page title",
  metaDescription: "A concise summary of the page for search engines.",
  h1Count: 1,
  hasCanonical: true,
  ogTitle: true,
  ogDescription: true,
  ogImage: true,
  htmlLang: "en",
  hasViewport: true,
  robotsNoindex: false,
  imagesTotal: 4,
  imagesWithAlt: 4,
};

function ids(snapshot: SeoSnapshot) {
  return analyzeSeo(snapshot, en).issues.map((i) => i.id);
}

describe("analyzeSeo", () => {
  it("scores a clean page 100 with no issues", () => {
    const result = analyzeSeo(perfect, en);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
  });

  it("flags missing title and description and deducts their penalties", () => {
    const result = analyzeSeo({ ...perfect, title: "", metaDescription: null }, en);
    expect(result.issues.map((i) => i.id)).toEqual(["seo-title", "seo-description"]);
    expect(result.issues.every((i) => i.category === "SEO")).toBe(true);
    expect(result.issues[0].severity).toBe("High");
    expect(result.score).toBe(100 - 18 - 15);
  });

  it("distinguishes missing vs multiple H1", () => {
    expect(ids({ ...perfect, h1Count: 0 })).toContain("seo-h1-missing");
    expect(ids({ ...perfect, h1Count: 3 })).toContain("seo-h1-multiple");
  });

  it("treats noindex as a high-severity issue", () => {
    const result = analyzeSeo({ ...perfect, robotsNoindex: true }, en);
    const issue = result.issues.find((i) => i.id === "seo-noindex");
    expect(issue?.severity).toBe("High");
    expect(result.score).toBe(75);
  });

  it("scores image alt coverage by ratio", () => {
    const result = analyzeSeo({ ...perfect, imagesTotal: 4, imagesWithAlt: 1 }, en);
    const issue = result.issues.find((i) => i.id === "seo-image-alt");
    expect(issue?.severity).toBe("Medium"); // 25% coverage < 80%
    expect(issue?.title).toContain("1/4");
  });

  it("flags missing canonical, lang, and viewport", () => {
    const got = ids({ ...perfect, hasCanonical: false, htmlLang: null, hasViewport: false });
    expect(got).toEqual(
      expect.arrayContaining(["seo-canonical", "seo-lang", "seo-viewport"]),
    );
  });

  it("flags Open Graph when any one of the three tags is missing", () => {
    expect(ids({ ...perfect, ogImage: false })).toContain("seo-open-graph");
    expect(ids({ ...perfect, ogTitle: false })).toContain("seo-open-graph");
    expect(ids(perfect)).not.toContain("seo-open-graph");
  });

  it("treats multiple H1 as a low-severity, light-penalty issue", () => {
    const result = analyzeSeo({ ...perfect, h1Count: 2 }, en);
    const issue = result.issues.find((i) => i.id === "seo-h1-multiple");
    expect(issue?.severity).toBe("Low");
    expect(result.score).toBe(96); // 100 - 4
  });

  it("does not flag image alt when there are no images", () => {
    expect(ids({ ...perfect, imagesTotal: 0, imagesWithAlt: 0 })).not.toContain(
      "seo-image-alt",
    );
  });

  it("never drops below 0", () => {
    const result = analyzeSeo(
      {
        title: "",
        metaDescription: "",
        h1Count: 0,
        hasCanonical: false,
        ogTitle: false,
        ogDescription: false,
        ogImage: false,
        htmlLang: null,
        hasViewport: false,
        robotsNoindex: true,
        imagesTotal: 10,
        imagesWithAlt: 0,
      },
      en,
    );
    expect(result.score).toBe(0);
  });
});
