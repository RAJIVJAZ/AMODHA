"use client";

import { useEffect, useRef } from "react";

// The sticky 3D layer behind the homepage story. three.js is loaded only after the page is idle, so the text
// (the largest paint) is never held up. Without WebGL, or when the visitor asks for reduced motion, the scene
// stays off and the story shows its photos instead (`data-story-3d="off"` on the wrapper).
export function StoryStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = canvas?.closest<HTMLElement>("[data-story]");
    if (!canvas || !root) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 3D only with a real graphics chip: software rendering (no GPU) would make the whole page sluggish.
    const gpu = (() => {
      try {
        const gl = document.createElement("canvas").getContext("webgl2");
        if (!gl) return false;
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
      } catch {
        return false;
      }
    })();
    const lowMemory = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) < 3;
    if (reduced || !gpu || lowMemory) {
      root.dataset.story3d = "off";
      return;
    }

    let disposed = false;
    let frame = 0;
    let visible = true;
    let cleanup = () => {};

    const start = async () => {
      const { createSweetScene } = await import("./sweet-scene");
      if (disposed) return;
      let scene: ReturnType<typeof createSweetScene>;
      try {
        scene = createSweetScene(canvas);
      } catch {
        root.dataset.story3d = "off";
        return;
      }
      root.dataset.story3d = "on";
      const chapters = Array.from(root.querySelectorAll<HTMLElement>("[data-story-chapter]"));

      const measure = () => {
        // Story progress: chapter index + how far the middle of the screen is through that chapter.
        const mid = window.innerHeight * 0.5;
        let progress = 0;
        let local = 0;
        for (let i = 0; i < chapters.length; i++) {
          const r = chapters[i].getBoundingClientRect();
          if (mid >= r.top) {
            local = Math.min(1, Math.max(0, (mid - r.top) / r.height));
            progress = i + local;
          }
        }
        scene.update(progress, local);
      };
      const resize = () => scene.resize(canvas.clientWidth, canvas.clientHeight);
      let last = 0;
      const tick = (time: number) => {
        frame = requestAnimationFrame(tick);
        // At most 30 frames a second, and none while the story is off screen or the tab is hidden.
        if (!visible || document.hidden || time - last < 32) return;
        last = time;
        measure();
        scene.render(time);
      };

      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
      });
      io.observe(root);
      frame = requestAnimationFrame(tick);
      cleanup = () => {
        cancelAnimationFrame(frame);
        ro.disconnect();
        io.disconnect();
        scene.dispose();
      };
    };

    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const handle = idle(() => void start());
    return () => {
      disposed = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(handle as number);
      cleanup();
    };
  }, []);

  return (
    // The layer spans the story exactly, so the pinned canvas can never spill into the next section.
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
      <div className="sticky top-0 h-[100svh] w-full">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
    </div>
  );
}
