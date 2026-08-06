import { cn } from "@/lib/cn";

/**
 * The SiteDoc AI mark: an audit sheet under a magnifier holding a bar chart.
 *
 * Inlined rather than pointed at `/icon.svg` so it inherits the page's colours
 * on paper and never flashes an empty box while the tab icon loads. Keep the
 * artwork in sync with `src/app/icon.svg`, which is the same drawing.
 *
 * The outline is `--line` so it flips with the theme like every other pop
 * border — a fixed ink silhouette vanishes into the dark paper. The lens is the
 * exception: cream fill and ink bars are a pair, and neither may flip alone.
 */
export function BrandMark({ className, tilt = -8 }: { className?: string; tilt?: number }) {
  return (
    <svg
      aria-hidden
      className={cn("block", className)}
      viewBox="0 0 64 64"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {/* Audit sheet */}
      <rect
        x="8"
        y="6"
        width="32"
        height="44"
        rx="5"
        fill="#35a7e8"
        stroke="var(--line)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <g fill="#fff9ee">
        <rect x="15" y="14" width="17" height="5" rx="2.5" />
        <rect x="15" y="24" width="12" height="5" rx="2.5" />
      </g>

      {/* Magnifier handle, inked then filled, so it reads as one stroke */}
      <path d="M30 48 L 20.5 57.5" fill="none" stroke="var(--line)" strokeWidth="13" strokeLinecap="round" />
      <path d="M30 48 L 20.5 57.5" fill="none" stroke="#ffc93c" strokeWidth="6" strokeLinecap="round" />

      {/* Glass: cream lens, inked rim, lemon ring laid inside the ink */}
      <circle cx="40" cy="38" r="14.5" fill="#fff9ee" stroke="var(--line)" strokeWidth="9" />
      <g fill="#171436">
        <rect x="31.75" y="38" width="4.5" height="8" rx="1.5" />
        <rect x="37.75" y="32" width="4.5" height="14" rx="1.5" />
        <rect x="43.75" y="35" width="4.5" height="11" rx="1.5" />
      </g>
      <circle cx="40" cy="38" r="14.5" fill="none" stroke="#ffc93c" strokeWidth="4.5" />
    </svg>
  );
}
