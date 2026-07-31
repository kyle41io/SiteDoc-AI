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
 * A score tile: category label, 0-100 value (or "--" when not yet measured),
 * and a chunky outlined capsule filled to the score in the category accent.
 */
export function ScoreCard({ label, value, accent = "var(--sky)", emphasis }: ScoreCardProps) {
  const hasValue = typeof value === "number";
  const width = hasValue ? Math.max(0, Math.min(100, value)) : 0;

  return (
    <div className="pop-sm rounded-2xl bg-paper-2 px-3.5 py-3">
      <p className="eyebrow min-h-[2.2em] text-[0.62rem] leading-tight text-ink-soft [overflow-wrap:anywhere]">
        {label}
      </p>
      <p
        className={cn(
          "font-display leading-none tabular-nums",
          emphasis ? "text-[2.6rem]" : "text-[1.9rem]",
          hasValue ? "text-ink" : "text-ink-soft",
        )}
      >
        {hasValue ? width : "--"}
        {hasValue && <span className="ml-0.5 text-sm text-ink-soft">/100</span>}
      </p>
      <div
        className="mt-2 h-3 overflow-hidden rounded-full border-2 border-line"
        style={{ backgroundColor: "color-mix(in srgb, var(--ink) 12%, transparent)" }}
        role="presentation"
      >
        <div
          className="h-full transition-[width] duration-700 ease-out"
          style={{ width: `${width}%`, backgroundColor: accent }}
        />
      </div>
    </div>
  );
}
