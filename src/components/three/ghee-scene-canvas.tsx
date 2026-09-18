"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Sparkles } from "@react-three/drei";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Group, Mesh } from "three";
import { useReducedMotion, useWebglSupported } from "@/lib/use-webgl-capability";

gsap.registerPlugin(ScrollTrigger);

type Progress = { value: number };
type ProgressRef = RefObject<Progress>;

function PouringVessel({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current || reducedMotion) return;
    groupRef.current.rotation.y += delta * 0.1;
  });

  return (
    <group ref={groupRef} position={[-1.3, 1.1, 0]} rotation={[0, 0, -0.55]}>
      <mesh>
        <coneGeometry args={[0.55, 1.1, 32, 1, true]} />
        <meshStandardMaterial color="#b87333" roughness={0.28} metalness={0.9} side={2} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <torusGeometry args={[0.55, 0.05, 16, 48]} />
        <meshStandardMaterial color="#8a5527" roughness={0.3} metalness={0.85} />
      </mesh>
    </group>
  );
}

function PourStream({ progressRef }: { progressRef: ProgressRef }) {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (!meshRef.current || !progressRef.current) return;
    const p = Math.min(1, Math.max(0, progressRef.current.value));
    const streamLength = p * 1.9;
    meshRef.current.scale.y = Math.max(0.001, streamLength);
    meshRef.current.position.y = 0.55 - streamLength / 2;
    const material = meshRef.current.material as { opacity: number };
    material.opacity = p > 0.02 ? 0.9 : 0;
  });

  return (
    <mesh ref={meshRef} position={[-0.75, 0.55, 0]}>
      <cylinderGeometry args={[0.045, 0.03, 1, 16]} />
      <meshStandardMaterial
        color="#e8c158"
        emissive="#d4a017"
        emissiveIntensity={0.6}
        transparent
        roughness={0.2}
        metalness={0.2}
      />
    </mesh>
  );
}

function GheePool({
  progressRef,
  reducedMotion,
}: {
  progressRef: ProgressRef;
  reducedMotion: boolean;
}) {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current || !progressRef.current) return;
    const p = Math.min(1, Math.max(0, progressRef.current.value));
    const grow = 0.08 + p * 0.85;
    meshRef.current.scale.set(0.9 + p * 0.5, grow * 0.35, 0.9 + p * 0.5);
    if (!reducedMotion) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.12;
    }
  });

  return (
    <mesh ref={meshRef} position={[-0.7, -0.55, 0]}>
      <sphereGeometry args={[0.9, 64, 64]} />
      <MeshDistortMaterial
        color="#d4a017"
        emissive="#5c2c06"
        emissiveIntensity={0.12}
        distort={reducedMotion ? 0.05 : 0.18}
        speed={reducedMotion ? 0 : 1.1}
        roughness={0.12}
        metalness={0.4}
      />
    </mesh>
  );
}

function Scene({ progressRef, reducedMotion }: { progressRef: ProgressRef; reducedMotion: boolean }) {
  return (
    <>
      <ambientLight intensity={0.5} color="#fff8e7" />
      <directionalLight position={[3, 4, 4]} intensity={1.5} color="#ffe4a3" />
      <directionalLight position={[-3, -1, -2]} intensity={0.35} color="#d4a017" />
      <PouringVessel reducedMotion={reducedMotion} />
      <PourStream progressRef={progressRef} />
      <GheePool progressRef={progressRef} reducedMotion={reducedMotion} />
      {!reducedMotion ? (
        <Sparkles count={25} scale={[2.5, 1.5, 1.5]} position={[-0.7, -0.3, 0]} size={2} speed={0.3} color="#e8c158" opacity={0.7} />
      ) : null}
    </>
  );
}

export function GheeSceneCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<Progress>({ value: 0 });
  const reducedMotion = useReducedMotion();
  const supported = useWebglSupported();

  useEffect(() => {
    if (!containerRef.current || reducedMotion) {
      progressRef.current.value = 0.9;
      return;
    }
    const ctx = gsap.context(() => {
      gsap.to(progressRef.current, {
        value: 1,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top 70%",
          end: "bottom 45%",
          scrub: 0.5,
        },
      });
    });
    return () => ctx.revert();
  }, [reducedMotion]);

  const dpr = useMemo<[number, number]>(() => [1, 1.5], []);

  if (!supported) return null;

  return (
    <div ref={containerRef} className="absolute inset-0" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 42 }}
        dpr={dpr}
        gl={{ antialias: true, alpha: true }}
        frameloop={reducedMotion ? "demand" : "always"}
      >
        <Scene progressRef={progressRef} reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
