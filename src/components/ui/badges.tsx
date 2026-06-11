import type { AuditCategory, AuditSeverity } from "@/lib/audit-types";
import {
  CATEGORY_ACCENT,
  CATEGORY_LABEL,
  SEVERITY_COLOR,
} from "@/lib/audit/category-meta";

export function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  const color = SEVERITY_COLOR[severity];
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` }}
    >
      {severity}
    </span>
  );
}

export function CategoryBadge({ category }: { category: AuditCategory }) {
  const color = CATEGORY_ACCENT[category];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {CATEGORY_LABEL[category]}
    </span>
  );
}
