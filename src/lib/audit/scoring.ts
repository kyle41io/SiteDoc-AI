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

export type AxeImpactCounts = {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
};

/**
 * Accessibility score (0-100) from axe-core violation counts, weighted by
 * impact. Penalties are summed and subtracted from 100; a perfectly clean page
 * scores 100. Critical/serious issues dominate the deduction.
 */
export function accessibilityScore(counts: AxeImpactCounts): number {
  const penalty =
    counts.critical * 16 + counts.serious * 10 + counts.moderate * 4 + counts.minor * 1;
  return Math.max(0, 100 - penalty);
}

/**
 * Headline overall score: a weighted average over whichever category scores are
 * present. The deterministic "technical" signal (scan/console/network) is always
 * present; accessibility/SEO/performance join as their engines come online, and
 * the weights are normalized over the present set so the blend always sums to 1.
 */
export function overallScore(parts: {
  technical: number;
  accessibility?: number;
  seo?: number;
  performance?: number;
}): number {
  const weighted: Array<[number | undefined, number]> = [
    [parts.accessibility, 0.3],
    [parts.seo, 0.25],
    [parts.performance, 0.25],
    [parts.technical, 0.2],
  ];
  const present = weighted.filter(
    (entry): entry is [number, number] => typeof entry[0] === "number",
  );
  const totalWeight = present.reduce((sum, [, weight]) => sum + weight, 0);
  const blended = present.reduce((sum, [value, weight]) => sum + value * weight, 0);
  return Math.round(blended / totalWeight);
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
