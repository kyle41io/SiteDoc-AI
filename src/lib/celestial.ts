/**
 * Maps an overall health score (0-100) to a celestial body. The grander the
 * body, the healthier the site: Moon (lowest) → Mars → Saturn → Earth → Sun →
 * Galaxy (a perfect 100). Used by the 3D hero and its CSS fallback.
 */
export type CelestialTier =
  | "moon"
  | "mars"
  | "saturn"
  | "earth"
  | "sun"
  | "galaxy";

export function celestialTier(score: number): CelestialTier {
  const s = Math.max(0, Math.min(100, score));
  if (s >= 100) return "galaxy";
  if (s >= 90) return "sun";
  if (s >= 80) return "earth";
  if (s >= 60) return "saturn";
  if (s >= 40) return "mars";
  return "moon";
}

/** Canonical accent/fallback color per tier (also drives the CSS fallback). */
export const CELESTIAL_COLOR: Record<CelestialTier, string> = {
  moon: "#b8bcc8",
  mars: "#e0683c",
  saturn: "#d8b77a",
  earth: "#3b82f6",
  sun: "#fbbf24",
  galaxy: "#a78bfa",
};

/** Stable English label key (the UI localizes via `celestial.<tier>`). */
export const CELESTIAL_LABEL: Record<CelestialTier, string> = {
  moon: "Moon",
  mars: "Mars",
  saturn: "Saturn",
  earth: "Earth",
  sun: "Sun",
  galaxy: "Galaxy",
};

export function celestialColor(score: number): string {
  return CELESTIAL_COLOR[celestialTier(score)];
}
