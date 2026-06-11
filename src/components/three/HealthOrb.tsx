"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial } from "@react-three/drei";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";

/** Maps an overall score (0-100) to the orb's health color. */
export function scoreColor(score: number): string {
  if (score >= 80) return "#34d399"; // emerald
  if (score >= 50) return "#fbbf24"; // amber
  return "#fb7185"; // rose
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function Orb({ score }: { score: number }) {
  const meshRef = useRef<Mesh>(null);
  const color = useMemo(() => scoreColor(score), [score]);
  const reduce = useMemo(() => prefersReducedMotion(), []);

  useFrame((_, delta) => {
    if (reduce || !meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.25;
    meshRef.current.rotation.x += delta * 0.08;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 64, 64]} />
      <MeshDistortMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.35}
        roughness={0.2}
        metalness={0.35}
        distort={0.32}
        speed={reduce ? 0 : 1.4}
      />
    </mesh>
  );
}

function Rings({ score }: { score: number }) {
  const groupRef = useRef<Group>(null);
  const color = useMemo(() => scoreColor(score), [score]);
  const reduce = useMemo(() => prefersReducedMotion(), []);

  useFrame((_, delta) => {
    if (reduce || !groupRef.current) return;
    groupRef.current.rotation.z += delta * 0.12;
  });

  return (
    <group ref={groupRef} rotation={[Math.PI / 2.3, 0, 0]}>
      <mesh>
        <torusGeometry args={[1.7, 0.012, 16, 140]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 3]}>
        <torusGeometry args={[2.05, 0.008, 16, 140]} />
        <meshBasicMaterial color="#8aa6ff" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

export default function HealthOrb({ score = 0 }: { score?: number }) {
  return (
    <Canvas
      aria-hidden
      camera={{ position: [0, 0, 5], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.7} />
      <pointLight position={[4, 4, 5]} intensity={70} />
      <pointLight position={[-5, -3, -2]} intensity={25} color="#8aa6ff" />
      <Orb score={score} />
      <Rings score={score} />
    </Canvas>
  );
}
