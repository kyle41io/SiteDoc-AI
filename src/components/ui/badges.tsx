import type { AuditCategory, AuditSeverity } from "@/lib/audit-types";
import {
  CATEGORY_ACCENT,
  CATEGORY_LABEL,
  SEVERITY_COLOR,
} from "@/lib/audit/category-meta";

/**
 * Badges are solid chips of their category/severity color with an inked
 * outline. The label always uses `--on-bright` (a fixed deep indigo that does
 * not follow the theme), so a chip keeps AA contrast on both sheets.
 */
const CHIP =
  "inline-flex items-center gap-1.5 rounded-full border-2 border-line px-2.5 py-0.5 font-display text-[0.7rem] uppercase leading-5 tracking-wide text-on-bright";

export function SeverityBadge({
  severity,
  label,
}: {
  severity: AuditSeverity;
  label?: string;
}) {
  const color = SEVERITY_COLOR[severity];
  return (
    <span className={CHIP} style={{ backgroundColor: color }}>
      {label ?? severity}
    </span>
  );
}

export function CategoryBadge({
  category,
  label,
}: {
  category: AuditCategory;
  label?: string;
}) {
  const color = CATEGORY_ACCENT[category];
  return (
    <span className={CHIP} style={{ backgroundColor: color }}>
      {/* Ink dot, not a paper dot: the chip fill stays bright in both themes,
          so a surface token here would invert while the chip did not. */}
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: "var(--on-bright)" }}
      />
      {label ?? CATEGORY_LABEL[category]}
    </span>
  );
}
