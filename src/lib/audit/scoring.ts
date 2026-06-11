import type { AuditScores, AuditSeverity } from "@/lib/audit-types";

/**
 * Heuristic scores derived from raw browser signals. This is the current
 * baseline scoring; category-specific scoring (accessibility/SEO/performance)
 * is layered on in later phases via {@link AuditScores}.
 *
 * Penalties are intentionally capped so a single noisy signal cannot drive a
 * score to zero, and floors keep scores in a believable range.
 */
export function scoreFromCounts(
  consoleErrors: number,
  failedRequests: number,
  durationMs: number,
): Pick<AuditScores, "overall" | "scanner" | "console" | "network"> {
  const durationPenalty = Math.min(
    30,
    Math.max(0, Math.round((durationMs - 2500) / 250)),
  );
  const consolePenalty = Math.min(30, consoleErrors * 8);
  const networkPenalty = Math.min(35, failedRequests * 10);

  const scanner = Math.max(40, 100 - durationPenalty);
  const consoleScore = Math.max(30, 100 - consolePenalty);
  const network = Math.max(30, 100 - networkPenalty);
  const overall = Math.round(scanner * 0.4 + consoleScore * 0.25 + network * 0.35);

  return {
    overall,
    scanner,
    console: consoleScore,
    network,
  };
}

/**
 * Maps an issue's position in a (severity-sorted) list to a severity label.
 * The first item is treated as the most important.
 */
export function severityFromIndex(index: number): AuditSeverity {
  if (index === 0) {
    return "High";
  }

  if (index < 3) {
    return "Medium";
  }

  return "Low";
}
