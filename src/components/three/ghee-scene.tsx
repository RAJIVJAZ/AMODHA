"use client";

import dynamic from "next/dynamic";

const GheeSceneCanvas = dynamic(
  () => import("./ghee-scene-canvas").then((mod) => mod.GheeSceneCanvas),
  { ssr: false }
);

export function GheeScene() {
  return <GheeSceneCanvas />;
}
