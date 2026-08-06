import type { CelestialTier } from "@/lib/celestial";
import { isFullBleed, PLANET_SPRITE } from "@/lib/celestial-sprite";
import { cn } from "@/lib/cn";

/**
 * The score-grade planet.
 *
 * A plain <img> rather than WebGL so it renders identically on screen and on
 * paper — the PDF export prints the same artwork, and there is no canvas to fail
 * on a constrained host.
 *
 * The planets are transparent cutouts that already carry their own inked edge,
 * so they hang free at full size. Only the galaxy needs a frame: it is an opaque
 * rectangular photo, and without the round clip it prints as a bare square.
 */
export function PlanetGrade({
  tier,
  label,
  className,
}: {
  tier: CelestialTier;
  /** Tier name, used as the image's alt text. */
  label: string;
  className?: string;
}) {
  const full = isFullBleed(tier);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static art, no loader needed
    <img
      alt={label}
      className={cn(
        full
          ? "pop h-full w-full rounded-full object-cover"
          : "h-full w-full object-contain",
        className,
      )}
      src={PLANET_SPRITE[tier]}
    />
  );
}

/**
 * Placeholder orb shown before a scan has produced a score.
 *
 * Drawn in `--ink-soft` now that it sits on the card panel rather than on the
 * hero sky, so it stays legible in both themes without a fill behind it.
 */
export function PlanetGradeEmpty({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[80%] w-[80%] items-center justify-center rounded-full border-[3px] border-dashed border-ink-soft text-ink-soft",
        className,
      )}
    >
      <span className="font-display text-4xl leading-none">--</span>
    </span>
  );
}
