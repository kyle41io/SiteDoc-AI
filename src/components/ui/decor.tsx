import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Scrolling marquee strip. The item list is rendered twice inside a
 * `width: max-content` track that translates by exactly -50%, which makes the
 * seam invisible. Decorative, so the whole strip is hidden from the a11y tree.
 */
export function Ticker({
  items,
  className,
  durationSeconds = 34,
  reverse = false,
}: {
  items: string[];
  className?: string;
  durationSeconds?: number;
  reverse?: boolean;
}) {
  if (items.length === 0) return null;

  const run = (key: string) => (
    <div className="flex shrink-0 items-center" key={key}>
      {items.map((item, index) => (
        <span className="flex items-center" key={`${key}-${index}-${item}`}>
          <span className="eyebrow px-5 py-2 text-[0.8rem] whitespace-nowrap sm:text-sm">
            {item}
          </span>
          <span className="text-[0.6rem]">★</span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      aria-hidden
      className={cn("ticker", reverse && "ticker--reverse", className)}
      style={{ ["--ticker-duration" as string]: `${durationSeconds}s` }}
    >
      <div className="ticker__track">
        {run("a")}
        {run("b")}
      </div>
    </div>
  );
}

const WAVE_WIDTH = 1200;
const WAVE_PERIOD = 60;

/**
 * One quadratic crest followed by smooth reflections of it, built rather than
 * hand-written so the crests always tile the full 1200-unit viewBox — a
 * miscounted segment leaves a straight gap at the right edge of the wave.
 */
const WAVE_PATH = [
  "M0 34",
  "q30 -34 60 0",
  ...Array.from({ length: WAVE_WIDTH / WAVE_PERIOD - 1 }, () => `t${WAVE_PERIOD} 0`),
  "V64",
  "H0",
  "Z",
].join(" ");

/**
 * Wavy section edge. `flip` points the crests downward, so the same shape can
 * close a section from below as well as open one from above.
 */
export function WaveEdge({
  className,
  fill = "var(--paper)",
  flip = false,
}: {
  className?: string;
  fill?: string;
  flip?: boolean;
}) {
  return (
    <svg
      aria-hidden
      className={cn("block h-6 w-full sm:h-9", className)}
      viewBox="0 0 1200 64"
      preserveAspectRatio="none"
      style={flip ? { transform: "scaleY(-1)" } : undefined}
    >
      <path d={WAVE_PATH} fill={fill} />
    </svg>
  );
}

/** Rotated circular sticker badge — the brand mark and hero call-outs. */
export function Sticker({
  children,
  className,
  tilt = -8,
}: {
  children: ReactNode;
  className?: string;
  tilt?: number;
}) {
  return (
    <span
      className={cn(
        "sticker inline-flex items-center justify-center text-center",
        className,
      )}
      style={{ ["--sticker-tilt" as string]: `${tilt}deg` }}
    >
      {children}
    </span>
  );
}
