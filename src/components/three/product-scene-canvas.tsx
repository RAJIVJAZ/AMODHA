"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Sparkles } from "@react-three/drei";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Color, type Group, type Mesh } from "three";
import { useReducedMotion, useWebglSupported } from "@/lib/use-webgl-capability";
import type { ProductSceneKind } from "@/data/dairy-products";

gsap.registerPlugin(ScrollTrigger);

type Progress = { value: number };
type ProgressRef = RefObject<Progress>;
type SceneProps = { progressRef: ProgressRef; reducedMotion: boolean };

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

function Lighting() {
  return (
    <>
      <ambientLight intensity={0.5} color="#fff8e7" />
      <directionalLight position={[3, 4, 4]} intensity={1.5} color="#ffe4a3" />
      <directionalLight position={[-3, -1, -2]} intensity={0.35} color="#d4a017" />
    </>
  );
}

// GHEE — copper vessel pours a gold stream into a growing pool.
function PourScene({ progressRef, reducedMotion }: SceneProps) {
  const vesselRef = useRef<Group>(null);
  const streamRef = useRef<Mesh>(null);
  const poolRef = useRef<Mesh>(null);

  useFrame((state, delta) => {
    if (vesselRef.current && !reducedMotion) vesselRef.current.rotation.y += delta * 0.1;
    const p = clamp01(progressRef.current?.value ?? 0);

    if (streamRef.current) {
      const len = p * 1.9;
      streamRef.current.scale.y = Math.max(0.001, len);
      streamRef.current.position.y = 0.55 - len / 2;
      (streamRef.current.material as { opacity: number }).opacity = p > 0.02 ? 0.9 : 0;
    }
    if (poolRef.current) {
      const grow = 0.08 + p * 0.85;
      poolRef.current.scale.set(0.9 + p * 0.5, grow * 0.35, 0.9 + p * 0.5);
      if (!reducedMotion) poolRef.current.rotation.y = state.clock.elapsedTime * 0.12;
    }
  });

  return (
    <>
      <group ref={vesselRef} position={[-1.3, 1.1, 0]} rotation={[0, 0, -0.55]}>
        <mesh>
          <coneGeometry args={[0.55, 1.1, 32, 1, true]} />
          <meshStandardMaterial color="#b87333" roughness={0.28} metalness={0.9} side={2} />
        </mesh>
        <mesh position={[0, 0.55, 0]}>
          <torusGeometry args={[0.55, 0.05, 16, 48]} />
          <meshStandardMaterial color="#8a5527" roughness={0.3} metalness={0.85} />
        </mesh>
      </group>
      <mesh ref={streamRef} position={[-0.75, 0.55, 0]}>
        <cylinderGeometry args={[0.045, 0.03, 1, 16]} />
        <meshStandardMaterial color="#e8c158" emissive="#d4a017" emissiveIntensity={0.6} transparent roughness={0.2} metalness={0.2} />
      </mesh>
      <mesh ref={poolRef} position={[-0.7, -0.55, 0]}>
        <sphereGeometry args={[0.9, 64, 64]} />
        <MeshDistortMaterial color="#d4a017" emissive="#5c2c06" emissiveIntensity={0.12} distort={reducedMotion ? 0.05 : 0.18} speed={reducedMotion ? 0 : 1.1} roughness={0.12} metalness={0.4} />
      </mesh>
      {!reducedMotion ? <Sparkles count={25} scale={[2.5, 1.5, 1.5]} position={[-0.7, -0.3, 0]} size={2} speed={0.3} color="#e8c158" opacity={0.7} /> : null}
    </>
  );
}

// PANEER — scattered cubes assemble into a clean stacked block.
function SizzleScene({ progressRef, reducedMotion }: SceneProps) {
  const cubes = useMemo(() => {
    const items: { grid: [number, number, number]; scatter: [number, number, number] }[] = [];
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed % 1000) / 1000;
    };
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 2; y++) {
        items.push({
          grid: [(x - 1) * 0.42, (y - 0.5) * 0.42 - 0.15, 0],
          scatter: [(rand() - 0.5) * 3.2, (rand() - 0.5) * 2.4 + 0.4, (rand() - 0.5) * 1.6],
        });
      }
    }
    return items;
  }, []);

  const refs = useRef<(Mesh | null)[]>([]);

  useFrame(() => {
    const p = clamp01(progressRef.current?.value ?? 0);
    cubes.forEach((cube, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      mesh.position.x = cube.scatter[0] + (cube.grid[0] - cube.scatter[0]) * p;
      mesh.position.y = cube.scatter[1] + (cube.grid[1] - cube.scatter[1]) * p;
      mesh.position.z = cube.scatter[2] + (cube.grid[2] - cube.scatter[2]) * p;
      if (!reducedMotion) mesh.rotation.y = (1 - p) * (i + 1) * 0.6;
    });
  });

  return (
    <>
      {cubes.map((_, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }}>
          <boxGeometry args={[0.38, 0.38, 0.38]} />
          <meshStandardMaterial color="#f5ecd4" roughness={0.5} metalness={0.05} />
        </mesh>
      ))}
      {!reducedMotion ? <Sparkles count={20} scale={[2, 1.2, 1.2]} position={[0, -0.2, 0.3]} size={2} speed={0.5} color="#e8834a" opacity={0.55} /> : null}
    </>
  );
}

// BUTTER — a turbulent blob calms and flattens into a set block as a paddle slows.
function ChurnScene({ progressRef, reducedMotion }: SceneProps) {
  const blobRef = useRef<Mesh>(null);
  const paddleRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    const p = clamp01(progressRef.current?.value ?? 0);
    if (blobRef.current) {
      blobRef.current.scale.set(1.15, 1.15 - p * 0.55, 1.15);
    }
    if (paddleRef.current && !reducedMotion) {
      paddleRef.current.rotation.y += delta * (3.2 * (1 - p) + 0.15);
    }
  });

  return (
    <>
      <mesh ref={blobRef}>
        <sphereGeometry args={[0.95, 64, 64]} />
        <MeshDistortMaterial color="#f0dca0" emissive="#8a6f3f" emissiveIntensity={0.08} distort={reducedMotion ? 0.04 : 0.4} speed={reducedMotion ? 0 : 1.6} roughness={0.2} metalness={0.15} />
      </mesh>
      <mesh ref={paddleRef} position={[0, 0.1, 0]}>
        <boxGeometry args={[0.08, 1.3, 0.08]} />
        <meshStandardMaterial color="#5c2c06" roughness={0.6} />
      </mesh>
    </>
  );
}

// MILK — a stream pours and a glass fills, level rising with scroll.
function SplashScene({ progressRef, reducedMotion }: SceneProps) {
  const streamRef = useRef<Mesh>(null);
  const fillRef = useRef<Mesh>(null);
  const glassHeight = 1.6;
  const fillMax = 1.3;

  useFrame(() => {
    const p = clamp01(progressRef.current?.value ?? 0);
    if (streamRef.current) {
      const streamOpacity = p < 0.7 ? 0.85 : Math.max(0, 0.85 * (1 - (p - 0.7) / 0.3));
      (streamRef.current.material as { opacity: number }).opacity = streamOpacity;
      streamRef.current.scale.y = Math.max(0.001, Math.min(p, 0.7) * 2.2);
    }
    if (fillRef.current) {
      const fillHeight = p * fillMax;
      fillRef.current.scale.y = Math.max(0.001, fillHeight);
      fillRef.current.position.y = -glassHeight / 2 + fillHeight / 2 + 0.05;
    }
  });

  return (
    <>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 1, 12]} />
        <meshStandardMaterial color="#fdfaf3" transparent opacity={0} />
      </mesh>
      <mesh ref={streamRef} position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.05, 0.04, 1, 16]} />
        <meshStandardMaterial color="#fdfaf3" emissive="#f7ede1" emissiveIntensity={0.3} transparent roughness={0.15} metalness={0.05} />
      </mesh>
      <mesh position={[0, -glassHeight / 2 + 0.02, 0]}>
        <cylinderGeometry args={[0.62, 0.55, glassHeight, 32, 1, true]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.12} roughness={0.05} metalness={0} side={2} />
      </mesh>
      <mesh ref={fillRef} position={[0, -glassHeight / 2, 0]}>
        <cylinderGeometry args={[0.58, 0.52, 1, 32]} />
        <meshStandardMaterial color="#fdfaf3" emissive="#f0e6d2" emissiveIntensity={0.15} roughness={0.2} metalness={0.05} />
      </mesh>
      {!reducedMotion ? <Sparkles count={16} scale={[1.4, 2, 1.4]} position={[0, 0, 0]} size={1.6} speed={0.2} color="#ffffff" opacity={0.4} /> : null}
    </>
  );
}

// CREAM — a soft blob swirls and grows, two-tone sparkle orbits around it.
function SwirlScene({ progressRef, reducedMotion }: SceneProps) {
  const blobRef = useRef<Mesh>(null);

  useFrame((state) => {
    const p = clamp01(progressRef.current?.value ?? 0);
    if (blobRef.current) {
      const scale = 0.55 + p * 0.65;
      blobRef.current.scale.set(scale, scale, scale);
      if (!reducedMotion) blobRef.current.rotation.y = state.clock.elapsedTime * 0.2;
    }
  });

  return (
    <>
      <mesh ref={blobRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <MeshDistortMaterial color="#fdf8ef" emissive="#e8c158" emissiveIntensity={0.06} distort={reducedMotion ? 0.05 : 0.22} speed={reducedMotion ? 0 : 1.3} roughness={0.15} metalness={0.1} />
      </mesh>
      {!reducedMotion ? (
        <>
          <Sparkles count={30} scale={[2.4, 2.4, 2.4]} size={2} speed={0.35} color="#fff8e7" opacity={0.6} />
          <Sparkles count={16} scale={[1.8, 1.8, 1.8]} size={1.8} speed={0.5} color="#c62828" opacity={0.35} />
        </>
      ) : null}
    </>
  );
}

// CURD — a still surface ripples as a droplet settles into it.
function RippleScene({ progressRef, reducedMotion }: SceneProps) {
  const discRef = useRef<Mesh>(null);
  const dropRef = useRef<Mesh>(null);

  useFrame((state) => {
    const p = clamp01(progressRef.current?.value ?? 0);
    if (discRef.current) {
      const material = discRef.current.material as unknown as { distort: number };
      material.distort = reducedMotion ? 0.03 : 0.04 + p * 0.14 + Math.sin(state.clock.elapsedTime * 1.5) * 0.01;
    }
    if (dropRef.current) {
      dropRef.current.position.y = 1.8 - p * 1.62;
      const s = 0.35 + p * 0.15;
      dropRef.current.scale.set(s, s, s);
    }
  });

  return (
    <>
      <mesh ref={discRef} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.15, 1.15, 0.16, 64]} />
        <MeshDistortMaterial color="#f7f0dd" emissive="#e8dcc0" emissiveIntensity={0.05} distort={0.05} speed={reducedMotion ? 0 : 0.8} roughness={0.25} metalness={0.05} />
      </mesh>
      <mesh ref={dropRef} position={[0, 1.8, 0]}>
        <sphereGeometry args={[0.4, 32, 32]} />
        <meshStandardMaterial color="#f9eddf" emissive="#d4a017" emissiveIntensity={0.08} roughness={0.2} />
      </mesh>
      {!reducedMotion ? <Sparkles count={14} scale={[1.8, 0.4, 1.8]} position={[0, 0.15, 0]} size={1.4} speed={0.3} color="#e8dcc0" opacity={0.4} /> : null}
    </>
  );
}

// KHOYA — a pale, larger blob reduces: shrinking and deepening in color.
function ReduceScene({ progressRef, reducedMotion }: SceneProps) {
  const blobRef = useRef<Mesh>(null);
  const paleColor = useMemo(() => new Color("#e8c158"), []);
  const deepColor = useMemo(() => new Color("#7a3d0d"), []);
  const currentColor = useMemo(() => new Color(), []);

  useFrame((state) => {
    const p = clamp01(progressRef.current?.value ?? 0);
    if (blobRef.current) {
      const scale = 1.3 - p * 0.55;
      blobRef.current.scale.set(scale, scale, scale);
      currentColor.copy(paleColor).lerp(deepColor, p);
      const material = blobRef.current.material as unknown as { color: Color };
      material.color.copy(currentColor);
      if (!reducedMotion) blobRef.current.rotation.y = state.clock.elapsedTime * 0.15;
    }
  });

  return (
    <>
      <mesh ref={blobRef}>
        <sphereGeometry args={[0.9, 64, 64]} />
        <MeshDistortMaterial color="#e8c158" emissive="#3d2408" emissiveIntensity={0.1} distort={reducedMotion ? 0.04 : 0.16} speed={reducedMotion ? 0 : 1} roughness={0.3} metalness={0.15} />
      </mesh>
      {!reducedMotion ? <Sparkles count={18} scale={[2, 1.6, 1.6]} position={[0, 0.6, 0]} size={1.6} speed={0.6} color="#f7ede1" opacity={0.35} /> : null}
    </>
  );
}

const scenes: Record<ProductSceneKind, (props: SceneProps) => React.ReactElement> = {
  pour: PourScene,
  sizzle: SizzleScene,
  churn: ChurnScene,
  splash: SplashScene,
  swirl: SwirlScene,
  ripple: RippleScene,
  reduce: ReduceScene,
};

export function ProductSceneCanvas({ kind }: { kind: ProductSceneKind }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<Progress>({ value: 0 });
  const reducedMotion = useReducedMotion();
  const supported = useWebglSupported();
  const SceneComponent = scenes[kind];

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
      <Canvas camera={{ position: [0, 0, 5], fov: 42 }} dpr={dpr} gl={{ antialias: true, alpha: true }} frameloop={reducedMotion ? "demand" : "always"}>
        <Lighting />
        <SceneComponent progressRef={progressRef} reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
