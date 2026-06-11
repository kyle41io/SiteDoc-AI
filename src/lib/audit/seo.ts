import type { AuditIssue, AuditSeverity } from "@/lib/audit-types";
import type { AuditStrings } from "@/lib/audit/audit-i18n";

/** DOM facts extracted from the scanned page, fed to the pure SEO analyzer. */
export type SeoSnapshot = {
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  hasCanonical: boolean;
  ogTitle: boolean;
  ogDescription: boolean;
  ogImage: boolean;
  htmlLang: string | null;
  hasViewport: boolean;
  robotsNoindex: boolean;
  imagesTotal: number;
  imagesWithAlt: number;
};

type SeoCheck = {
  id: string;
  severity: AuditSeverity;
  penalty: number;
  title: string;
  fix: string;
};

/**
 * Deterministic SEO analysis. Returns categorized issues plus a 0-100 score
 * (100 minus the summed penalties of failed checks).
 *
 * v1 scope: presence-based checks (canonical/OG/viewport test that the tag
 * exists, not that its content is valid); `noindex` is read from the `robots`
 * meta only (not `googlebot` or the X-Robots-Tag HTTP header). `alt=""` counts
 * as covered, since empty alt is the correct choice for decorative images.
 */
export function analyzeSeo(
  snapshot: SeoSnapshot,
  s: AuditStrings,
): { issues: AuditIssue[]; score: number } {
  const seo = s.seo;
  const checks: SeoCheck[] = [];

  if (!snapshot.title || !snapshot.title.trim()) {
    checks.push({ id: "seo-title", severity: "High", penalty: 18, title: seo.titleMissing, fix: seo.titleMissingFix });
  }
  if (!snapshot.metaDescription || !snapshot.metaDescription.trim()) {
    checks.push({ id: "seo-description", severity: "High", penalty: 15, title: seo.descriptionMissing, fix: seo.descriptionMissingFix });
  }
  if (snapshot.h1Count === 0) {
    checks.push({ id: "seo-h1-missing", severity: "High", penalty: 12, title: seo.h1Missing, fix: seo.h1MissingFix });
  } else if (snapshot.h1Count > 1) {
    checks.push({ id: "seo-h1-multiple", severity: "Low", penalty: 4, title: seo.h1Multiple, fix: seo.h1MultipleFix });
  }
  if (!snapshot.hasCanonical) {
    checks.push({ id: "seo-canonical", severity: "Medium", penalty: 8, title: seo.canonicalMissing, fix: seo.canonicalMissingFix });
  }
  if (!(snapshot.ogTitle && snapshot.ogDescription && snapshot.ogImage)) {
    checks.push({ id: "seo-open-graph", severity: "Medium", penalty: 8, title: seo.openGraph, fix: seo.openGraphFix });
  }
  if (!snapshot.htmlLang) {
    checks.push({ id: "seo-lang", severity: "Medium", penalty: 8, title: seo.langMissing, fix: seo.langMissingFix });
  }
  if (!snapshot.hasViewport) {
    checks.push({ id: "seo-viewport", severity: "Medium", penalty: 10, title: seo.viewportMissing, fix: seo.viewportMissingFix });
  }
  if (snapshot.robotsNoindex) {
    checks.push({ id: "seo-noindex", severity: "High", penalty: 25, title: seo.noindex, fix: seo.noindexFix });
  }
  if (snapshot.imagesTotal > 0 && snapshot.imagesWithAlt < snapshot.imagesTotal) {
    const missing = snapshot.imagesTotal - snapshot.imagesWithAlt;
    const coverage = snapshot.imagesWithAlt / snapshot.imagesTotal;
    checks.push({
      id: "seo-image-alt",
      severity: coverage < 0.8 ? "Medium" : "Low",
      penalty: Math.min(15, missing * 2),
      title: seo.imageAlt(snapshot.imagesWithAlt, snapshot.imagesTotal),
      fix: seo.imageAltFix,
    });
  }

  const score = Math.max(
    0,
    100 - checks.reduce((sum, check) => sum + check.penalty, 0),
  );

  const issues: AuditIssue[] = checks.map((check) => ({
    id: check.id,
    category: "SEO",
    severity: check.severity,
    title: check.title,
    detail: "",
    fix: check.fix,
  }));

  return { issues, score };
}
