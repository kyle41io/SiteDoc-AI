import type { AuditCategory, AuditSeverity } from "@/lib/audit-types";

/** Accent color (CSS variable) for each audit category. */
export const CATEGORY_ACCENT: Record<AuditCategory, string> = {
  Accessibility: "var(--cat-accessibility)",
  SEO: "var(--cat-seo)",
  Performance: "var(--cat-performance)",
  UX: "var(--cat-ux)",
  BestPractices: "var(--cat-bestpractices)",
  Console: "var(--cat-console)",
  Network: "var(--cat-network)",
  Scanner: "var(--cat-scanner)",
};

/** Human-readable label for each category (handles "BestPractices"). */
export const CATEGORY_LABEL: Record<AuditCategory, string> = {
  Accessibility: "Accessibility",
  SEO: "SEO",
  Performance: "Performance",
  UX: "UX",
  BestPractices: "Best Practices",
  Console: "Console",
  Network: "Network",
  Scanner: "Scanner",
};

export const SEVERITY_COLOR: Record<AuditSeverity, string> = {
  High: "var(--sev-high)",
  Medium: "var(--sev-medium)",
  Low: "var(--sev-low)",
};
