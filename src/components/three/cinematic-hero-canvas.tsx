"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Sparkles } from "@react-three/drei";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Mesh } from "three";
import { useReducedMotion, useWebglSupported } from "@/lib/use-webgl-capability";

gsap.registerPlugin(ScrollTrigger);

function GheeBlob({ reducedMotion }: { reducedMotion: boolean }) {
  const meshRef = useRef<Mesh>(null);

  useFrame((state, delta) => {
    if (!meshRef.current || reducedMotion) return;
    meshRef.current.rotation.y += delta * 0.15;
    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.15;
  });

  return (
    <mesh ref={meshRef} scale={1.4}>
      <sphereGeometry args={[1, 96, 96]} />
      <MeshDistortMaterial
        color="#d4a017"
        emissive="#5c2c06"
        emissiveIntensity={0.15}
        distort={reducedMotion ? 0.08 : 0.32}
        speed={reducedMotion ? 0 : 1.4}
        roughness={0.15}
        metalness={0.45}
      />
    </mesh>
  );
}

function BilonaRing({ reducedMotion }: { reducedMotion: boolean }) {
  const meshRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (!meshRef.current || reducedMotion) return;
    meshRef.current.rotation.z += delta * 0.08;
  });

  return (
    <mesh ref={meshRef} rotation={[Math.PI / 2.4, 0, 0]} position={[0, -0.4, 0]}>
      <torusGeometry args={[2.4, 0.05, 16, 100]} />
      <meshStandardMaterial color="#b87333" roughness={0.3} metalness={0.9} />
    </mesh>
  );
}

function Scene({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <>
      <ambientLight intensity={0.55} color="#fff8e7" />
      <directionalLight position={[4, 5, 3]} intensity={1.4} color="#ffe4a3" />
      <directionalLight position={[-4, -2, -3]} intensity={0.4} color="#d4a017" />
      <GheeBlob reducedMotion={reducedMotion} />
      <BilonaRing reducedMotion={reducedMotion} />
      {!reducedMotion ? (
        <Sparkles count={60} scale={[6, 4, 4]} size={2.5} speed={0.25} color="#e8c158" opacity={0.6} />
      ) : null}
    </>
  );
}

export function CinematicHeroCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const supported = useWebglSupported();

  useEffect(() => {
    if (!containerRef.current || reducedMotion) return;
    const ctx = gsap.context(() => {
      gsap.to(containerRef.current, {
        opacity: 0.15,
        scale: 0.92,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    });
    return () => ctx.revert();
  }, [reducedMotion]);

  const dpr = useMemo<[number, number]>(() => [1, 1.5], []);

  if (!supported) return null;

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        dpr={dpr}
        gl={{ antialias: true, alpha: true }}
        frameloop={reducedMotion ? "demand" : "always"}
      >
        <Scene reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
