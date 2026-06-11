"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import { celestialTier } from "@/lib/celestial";
import { CelestialBody } from "@/components/three/CelestialBody";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The 3D hero. Renders a score-driven celestial body (Moon → … → Galaxy).
 * Imported only via `next/dynamic` with `ssr:false` (see HealthOrbMount).
 */
export default function HealthOrb({ score = 0 }: { score?: number }) {
  const tier = useMemo(() => celestialTier(score), [score]);
  const reduce = useMemo(() => prefersReducedMotion(), []);

  return (
    <Canvas
      aria-hidden
      // Reduced motion: render one frame then idle (no continuous rAF).
      frameloop={reduce ? "demand" : "always"}
      camera={{ position: [0, 0, 5.2], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 3, 5]} intensity={3.2} />
      <pointLight position={[-5, -3, -2]} intensity={12} color="#8aa6ff" />
      <Suspense fallback={null}>
        <CelestialBody tier={tier} reduce={reduce} />
      </Suspense>
    </Canvas>
  );
}
