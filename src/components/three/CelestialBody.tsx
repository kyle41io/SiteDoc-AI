"use client";

import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CelestialTier } from "@/lib/celestial";

const TEX = "/textures/planets";

// A neutral white radial-gradient glow, created once and reused (Sun corona +
// galaxy core). Module-level singleton so it is never re-created or leaked.
let glowSingleton: THREE.CanvasTexture | null = null;
function getGlow(): THREE.CanvasTexture {
  if (glowSingleton) return glowSingleton;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.4, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowSingleton = new THREE.CanvasTexture(canvas);
  return glowSingleton;
}

function buildGalaxy() {
  const count = 7000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const arms = 3;
  const radiusMax = 2.1;
  const core = new THREE.Color("#fff1c2");
  const outer = new THREE.Color("#7c5cff");
  for (let i = 0; i < count; i++) {
    const r = Math.pow(Math.random(), 0.6) * radiusMax;
    const branch = ((i % arms) / arms) * Math.PI * 2;
    const spin = r * 1.8;
    const scatter = (Math.random() - 0.5) * (0.3 + r * 0.12);
    const angle = branch + spin + scatter;
    positions[i * 3] = Math.cos(angle) * r + (Math.random() - 0.5) * 0.1;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 0.16 * (1 - r / radiusMax);
    positions[i * 3 + 2] = Math.sin(angle) * r + (Math.random() - 0.5) * 0.1;
    const c = core.clone().lerp(outer, Math.min(1, r / radiusMax));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  return { positions, colors };
}

/**
 * Load a color (sRGB) texture. We clone it so the color space can be tagged
 * without mutating the loader-cached original (which the React Compiler treats
 * as immutable), and dispose the clone on unmount to avoid GPU leaks.
 */
function useColorMap(file: string) {
  const src = useLoader(THREE.TextureLoader, `${TEX}/${file}`);
  const tex = useMemo(() => {
    const t = src.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }, [src]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Load a linear data texture (bump / alpha) straight from the loader cache. */
function useDataMap(file: string) {
  return useLoader(THREE.TextureLoader, `${TEX}/${file}`);
}

function useSpin(speed: number, reduce: boolean) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (reduce || !ref.current) return;
    ref.current.rotation.y += delta * speed;
  });
  return ref;
}

function Moon({ reduce }: { reduce: boolean }) {
  const map = useColorMap("moonmap1k.jpg");
  const bump = useDataMap("moonbump1k.jpg");
  const ref = useSpin(0.05, reduce);
  return (
    <group ref={ref} rotation={[0.2, 0, 0.08]}>
      <mesh>
        <sphereGeometry args={[1.25, 64, 64]} />
        <meshStandardMaterial map={map} bumpMap={bump} bumpScale={0.05} roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

function Mars({ reduce }: { reduce: boolean }) {
  const map = useColorMap("marsmap1k.jpg");
  const bump = useDataMap("marsbump1k.jpg");
  const ref = useSpin(0.07, reduce);
  return (
    <group ref={ref} rotation={[0.25, 0, 0.1]}>
      <mesh>
        <sphereGeometry args={[1.25, 64, 64]} />
        <meshStandardMaterial map={map} bumpMap={bump} bumpScale={0.04} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}

function Saturn({ reduce }: { reduce: boolean }) {
  const map = useColorMap("saturnmap.jpg");
  const ringColor = useColorMap("saturnringcolor.jpg");
  const ringAlpha = useDataMap("saturnringpattern.gif");
  const spin = useSpin(0.08, reduce);

  // Ring disk with radial UVs so the strip texture maps inner→outer.
  const ringGeo = useMemo(() => {
    const inner = 1.45;
    const outer = 2.6;
    const geo = new THREE.RingGeometry(inner, outer, 96, 1);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
    }
    uv.needsUpdate = true;
    return geo;
  }, []);
  useEffect(() => () => ringGeo.dispose(), [ringGeo]);

  return (
    <group rotation={[0.46, 0, 0.12]}>
      <group ref={spin}>
        <mesh>
          <sphereGeometry args={[1.05, 64, 64]} />
          <meshStandardMaterial map={map} roughness={0.9} metalness={0} />
        </mesh>
      </group>
      <mesh geometry={ringGeo} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial
          map={ringColor}
          alphaMap={ringAlpha}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function Earth({ reduce }: { reduce: boolean }) {
  const map = useColorMap("earthmap1k.jpg");
  const bump = useDataMap("earthbump1k.jpg");
  const clouds = useDataMap("earthcloudmaptrans.jpg");
  const spin = useSpin(0.1, reduce);
  return (
    <group rotation={[0.4, 0, 0.05]}>
      <group ref={spin}>
        <mesh>
          <sphereGeometry args={[1.2, 64, 64]} />
          <meshStandardMaterial map={map} bumpMap={bump} bumpScale={0.03} roughness={0.85} metalness={0.05} />
        </mesh>
        <mesh scale={1.013}>
          <sphereGeometry args={[1.2, 64, 64]} />
          <meshStandardMaterial
            color="#ffffff"
            alphaMap={clouds}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </mesh>
      </group>
      {/* Atmosphere rim glow */}
      <mesh scale={1.06}>
        <sphereGeometry args={[1.2, 48, 48]} />
        <meshBasicMaterial
          color="#5aa9ff"
          transparent
          opacity={0.16}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function Sun({ reduce }: { reduce: boolean }) {
  const map = useColorMap("sunmap.jpg");
  const glow = useMemo(() => getGlow(), []);
  const spin = useSpin(0.05, reduce);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    if (reduce || !matRef.current) return;
    matRef.current.emissiveIntensity = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.12;
  });
  return (
    <group>
      <group ref={spin}>
        <mesh>
          <sphereGeometry args={[1.2, 64, 64]} />
          <meshStandardMaterial
            ref={matRef}
            map={map}
            emissiveMap={map}
            emissive="#ffffff"
            emissiveIntensity={1}
            toneMapped={false}
          />
        </mesh>
      </group>
      <sprite scale={[5, 5, 1]}>
        <spriteMaterial
          map={glow}
          color="#ff9a3c"
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}

function Galaxy({ reduce }: { reduce: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, colors } = useMemo(() => buildGalaxy(), []);
  const glow = useMemo(() => getGlow(), []);
  useFrame((_, delta) => {
    if (reduce || !ref.current) return;
    ref.current.rotation.y += delta * 0.16;
  });
  return (
    <group rotation={[1.1, 0, 0.12]}>
      <points ref={ref}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.035}
          sizeAttenuation
          vertexColors
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      <sprite scale={[1.8, 1.8, 1]}>
        <spriteMaterial
          map={glow}
          color="#fff2cc"
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}

export function CelestialBody({
  tier,
  reduce,
}: {
  tier: CelestialTier;
  reduce: boolean;
}) {
  switch (tier) {
    case "moon":
      return <Moon reduce={reduce} />;
    case "mars":
      return <Mars reduce={reduce} />;
    case "saturn":
      return <Saturn reduce={reduce} />;
    case "earth":
      return <Earth reduce={reduce} />;
    case "sun":
      return <Sun reduce={reduce} />;
    case "galaxy":
      return <Galaxy reduce={reduce} />;
  }
}
