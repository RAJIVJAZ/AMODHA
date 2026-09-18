"use client";

import dynamic from "next/dynamic";

const CinematicHeroCanvas = dynamic(
  () => import("./cinematic-hero-canvas").then((mod) => mod.CinematicHeroCanvas),
  { ssr: false }
);

export function CinematicHero() {
  return <CinematicHeroCanvas />;
}
