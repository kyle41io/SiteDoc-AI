import type { CelestialTier } from "@/lib/celestial";

/**
 * Artwork for the score-grade planet.
 *
 * Each planet is its own transparent PNG, cut from the cartoon sticker sheet at
 * `public/textures/planets/planets.jpeg` (see `sprites/SOURCE.md`). They are
 * separate files rather than CSS crops of the sheet because the sheet packs the
 * stickers on a white background: any frame big enough to hold one sticker also
 * shows white corners and the edges of its neighbours. Transparency lets the
 * porthole colour show through instead.
 */
export const PLANET_SPRITE: Record<CelestialTier, string> = {
  moon: "/textures/planets/sprites/moon.png",
  mars: "/textures/planets/sprites/mars.png",
  saturn: "/textures/planets/sprites/saturn.png",
  earth: "/textures/planets/sprites/earth.png",
  sun: "/textures/planets/sprites/sun.png",
  // A perfect score earns the whole galaxy, which fills the porthole edge to edge.
  galaxy: "/textures/planets/galaxy.jpeg",
};

/** The galaxy is a full-bleed backdrop; the planets are centred cutouts. */
export function isFullBleed(tier: CelestialTier): boolean {
  return tier === "galaxy";
}
