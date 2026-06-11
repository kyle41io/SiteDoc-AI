"use client";

import dynamic from "next/dynamic";
import { celestialColor } from "@/lib/celestial";

/**
 * CSS-only fallback shown while the WebGL hero loads, or when WebGL/3D is
 * unavailable or the user prefers reduced motion. It still conveys the score
 * via its tier color, so the hero is meaningful without the 3D scene.
 */
export function OrbFallback({ score, color: colorOverride }: { score: number; color?: string }) {
  const color = colorOverride ?? celestialColor(score);
  return (
    <div
      aria-hidden
      className="h-full w-full"
      style={{
        background: `radial-gradient(circle at 35% 30%, ${color}, #1b2350 55%, #0a0e23 80%)`,
        borderRadius: "9999px",
        boxShadow: `0 0 60px ${color}55, inset -12px -16px 40px #05071a`,
      }}
    />
  );
}

const HealthOrb = dynamic(() => import("@/components/three/HealthOrb"), {
  ssr: false,
  // Neutral brand color while the chunk loads, so the orb never flashes red.
  loading: () => <OrbFallback score={0} color="#6f8dff" />,
});

/**
 * Client-only mount for the 3D orb. Dynamically imported with `ssr: false`
 * because react-three-fiber's <Canvas> cannot render during SSR.
 */
export function HealthOrbMount({ score }: { score: number }) {
  return <HealthOrb score={score} />;
}
