import type { AuditIssue, AuditSeverity } from "@/lib/audit-types";
import type { AuditStrings } from "@/lib/audit/audit-i18n";

/** Timing/resource facts extracted from the page, fed to the pure analyzer. */
export type PerfSnapshot = {
  ttfbMs: number;
  loadMs: number;
  resourceCount: number;
  totalTransferBytes: number;
  imageBytes: number;
  stylesheetCount: number;
};

type PerfCheck = {
  id: string;
  severity: AuditSeverity;
  penalty: number;
  title: string;
  fix: string;
};

const MB = 1_000_000;
const toMb = (bytes: number) => (bytes / MB).toFixed(1);

/**
 * Deterministic performance analysis from Navigation/Resource Timing. Returns
 * categorized issues + a 0-100 score (100 minus summed penalties).
 *
 * v1 scope: cross-origin resources without Timing-Allow-Origin report a
 * `transferSize` of 0, so total/image weight can undercount third-party assets.
 */
export function analyzePerformance(
  perf: PerfSnapshot,
  s: AuditStrings,
): { issues: AuditIssue[]; score: number } {
  const p = s.performance;
  const checks: PerfCheck[] = [];

  if (perf.loadMs > 6000) {
    checks.push({ id: "perf-load", severity: "High", penalty: 20, title: p.slowLoad((perf.loadMs / 1000).toFixed(1)), fix: p.slowLoadFix });
  } else if (perf.loadMs > 3000) {
    checks.push({ id: "perf-load", severity: "Medium", penalty: 10, title: p.slowLoad((perf.loadMs / 1000).toFixed(1)), fix: p.slowLoadFix });
  }

  if (perf.ttfbMs > 1200) {
    checks.push({ id: "perf-ttfb", severity: "High", penalty: 12, title: p.slowTtfb(Math.round(perf.ttfbMs)), fix: p.slowTtfbFix });
  } else if (perf.ttfbMs > 600) {
    checks.push({ id: "perf-ttfb", severity: "Medium", penalty: 6, title: p.slowTtfb(Math.round(perf.ttfbMs)), fix: p.slowTtfbFix });
  }

  if (perf.totalTransferBytes > 5 * MB) {
    checks.push({ id: "perf-weight", severity: "High", penalty: 15, title: p.heavyPage(toMb(perf.totalTransferBytes)), fix: p.heavyPageFix });
  } else if (perf.totalTransferBytes > 2 * MB) {
    checks.push({ id: "perf-weight", severity: "Medium", penalty: 8, title: p.heavyPage(toMb(perf.totalTransferBytes)), fix: p.heavyPageFix });
  }

  if (perf.resourceCount > 100) {
    checks.push({ id: "perf-requests", severity: "Medium", penalty: 8, title: p.tooManyRequests(perf.resourceCount), fix: p.tooManyRequestsFix });
  } else if (perf.resourceCount > 60) {
    checks.push({ id: "perf-requests", severity: "Low", penalty: 4, title: p.tooManyRequests(perf.resourceCount), fix: p.tooManyRequestsFix });
  }

  if (perf.imageBytes > 2 * MB) {
    checks.push({ id: "perf-images", severity: "Medium", penalty: 8, title: p.heavyImages(toMb(perf.imageBytes)), fix: p.heavyImagesFix });
  } else if (perf.imageBytes > 1 * MB) {
    checks.push({ id: "perf-images", severity: "Low", penalty: 4, title: p.heavyImages(toMb(perf.imageBytes)), fix: p.heavyImagesFix });
  }

  if (perf.stylesheetCount > 5) {
    checks.push({ id: "perf-render-blocking", severity: "Low", penalty: 4, title: p.renderBlocking(perf.stylesheetCount), fix: p.renderBlockingFix });
  }

  const score = Math.max(
    0,
    100 - checks.reduce((sum, check) => sum + check.penalty, 0),
  );

  const issues: AuditIssue[] = checks.map((check) => ({
    id: check.id,
    category: "Performance",
    severity: check.severity,
    title: check.title,
    detail: "",
    fix: check.fix,
  }));

  return { issues, score };
}
