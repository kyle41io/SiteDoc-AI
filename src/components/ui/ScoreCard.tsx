import { cn } from "@/lib/cn";

type ScoreCardProps = {
  label: string;
  value?: number;
  /** Accent color (CSS color or var); defaults to the brand accent. */
  accent?: string;
  /** Render a larger "overall" variant. */
  emphasis?: boolean;
};

/**
 * A glass score tile: label, 0-100 value (or "--" when not yet measured), and
 * a thin progress bar colored by the category accent.
 */
export function ScoreCard({ label, value, accent = "var(--accent)", emphasis }: ScoreCardProps) {
  const hasValue = typeof value === "number";
  const width = hasValue ? Math.max(0, Math.min(100, value)) : 0;

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="px-4 pt-3 pb-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          {label}
        </p>
        <p
          className={cn(
            "mt-1 font-semibold tabular-nums",
            emphasis ? "text-4xl" : "text-2xl",
          )}
          style={{ color: hasValue ? "var(--foreground)" : "var(--muted)" }}
        >
          {hasValue ? width : "--"}
          {hasValue && (
            <span className="ml-0.5 text-sm font-normal text-[var(--muted)]">/100</span>
          )}
        </p>
      </div>
      <div className="h-1.5 w-full bg-white/10" role="presentation">
        <div
          className="h-full rounded-r-full transition-[width] duration-700 ease-out"
          style={{ width: `${width}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  );
}
