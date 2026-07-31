import type { CelestialTier } from "@/lib/celestial";
import { isFullBleed, PLANET_SPRITE } from "@/lib/celestial-sprite";
import { cn } from "@/lib/cn";

/**
 * The score-grade planet.
 *
 * A plain <img> rather than WebGL so it renders identically on screen and on
 * paper — the PDF export prints the same artwork, and there is no canvas to fail
 * on a constrained host.
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
        full ? "h-full w-full object-cover" : "h-[95%] w-[95%] object-contain",
        className,
      )}
      src={PLANET_SPRITE[tier]}
    />
  );
}

/**
 * Placeholder porthole shown before a scan has produced a score.
 *
 * Drawn in `--hero-muted`, which flips with the theme: the porthole behind it
 * is `--hero-bg`, so a fixed colour fails contrast in one theme or the other
 * (cream reaches only 2.6:1 on the light sky, ink 1.9:1 on the dark one).
 */
export function PlanetGradeEmpty({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[70%] w-[70%] items-center justify-center rounded-full border-[3px] border-dashed",
        className,
      )}
      style={{ borderColor: "var(--hero-muted)" }}
    >
      <span className="font-display text-4xl leading-none" style={{ color: "var(--hero-muted)" }}>
        --
      </span>
    </span>
  );
}
