"use client";

import dynamic from "next/dynamic";
import type { ProductSceneKind } from "@/data/dairy-products";

const ProductSceneCanvas = dynamic(
  () => import("./product-scene-canvas").then((mod) => mod.ProductSceneCanvas),
  { ssr: false }
);

export function ProductScene({ kind }: { kind: ProductSceneKind }) {
  return <ProductSceneCanvas kind={kind} />;
}
