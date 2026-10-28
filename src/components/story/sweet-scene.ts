import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// The homepage's 3D story, built entirely in code (no model files to download): a clay matki pours milk,
// Mithai Wallah's own sweets float in, two favourites are compared, three box sizes line up, and a sweet box
// opens as the visitor scrolls. `update(progress)` is driven by the page's scroll position.
//
// progress: 0..1 hero · 1..2 two favourites · 2..3 pick your box · 3..4 boxed with care · 4+ the kitchen.

type Vec3 = [number, number, number];
type Pose = { p: Vec3; r: Vec3; s: number };

const HIDDEN = 0.0001;

// ---------------------------------------------------------------------------------------------- helpers

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** A soft, grainy bump texture so milk sweets look cooked rather than plastic. */
function grainTexture(seed: number, scale = 1) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rand = seeded(seed);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600 * scale; i++) {
    const v = Math.floor(90 + rand() * 120);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    const r = 0.6 + rand() * 2.2;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Radial shadow used under every object instead of real-time shadows (cheap on phones). */
function shadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(22,50,63,0.42)");
  g.addColorStop(1, "rgba(22,50,63,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function sweetMaterial(color: string, bump: THREE.Texture, roughness = 0.72) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, bumpMap: bump, bumpScale: 0.6 });
}

/** Small pieces (pistachio slivers, nuts) scattered on a top surface. */
function sprinkles(count: number, w: number, d: number, y: number, color: string, seed: number, size = 0.06) {
  const rand = seeded(seed);
  const geo = new THREE.BoxGeometry(size * 1.8, size * 0.5, size);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    e.set((rand() - 0.5) * 0.6, rand() * Math.PI, (rand() - 0.5) * 0.6);
    q.setFromEuler(e);
    const s = 0.6 + rand() * 0.8;
    m.compose(new THREE.Vector3((rand() - 0.5) * w, y, (rand() - 0.5) * d), q, new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
  }
  return mesh;
}

// ---------------------------------------------------------------------------------------------- the sweets

type Kit = { grainA: THREE.Texture; grainB: THREE.Texture };

let caramel: THREE.Texture | null = null;
function caramelTexture() {
  if (caramel) return caramel;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 150);
  g.addColorStop(0, "#6b3410");
  g.addColorStop(0.35, "#9a5a24");
  g.addColorStop(0.7, "#d9a86a");
  g.addColorStop(1, "#f1d6a4");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const rand = seeded(5);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(${rand() > 0.5 ? "255,240,210" : "70,30,8"},${0.08 + rand() * 0.18})`;
    ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 3, 1 + rand() * 2);
  }
  caramel = new THREE.CanvasTexture(canvas);
  caramel.colorSpace = THREE.SRGBColorSpace;
  return caramel;
}

function milkCake(kit: Kit) {
  const g = new THREE.Group();
  const geo = new RoundedBoxGeometry(1.15, 0.55, 0.85, 4, 0.12);
  const mat = new THREE.MeshStandardMaterial({ map: caramelTexture(), roughness: 0.78, bumpMap: kit.grainA, bumpScale: 1.2 });
  g.add(new THREE.Mesh(geo, mat));
  return g;
}

function kalakand(kit: Kit) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.45, 1.0, 4, 0.1), sweetMaterial("#f4e6c2", kit.grainB, 0.85)));
  g.add(sprinkles(26, 0.8, 0.8, 0.235, "#86b84a", 11));
  return g;
}

function chocolateBarfi(kit: Kit) {
  const g = new THREE.Group();
  const bottom = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.28, 0.75, 3, 0.07), sweetMaterial("#f2e3c4", kit.grainB));
  bottom.position.y = -0.14;
  const top = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.28, 0.75, 3, 0.07), sweetMaterial("#5b321b", kit.grainA, 0.55));
  top.position.y = 0.14;
  g.add(bottom, top);
  return g;
}

function dodaBarfi(kit: Kit) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.42, 0.95, 4, 0.1), sweetMaterial("#6a3a1d", kit.grainA, 0.8)));
  g.add(sprinkles(14, 0.7, 0.7, 0.215, "#e9d2a6", 23, 0.08));
  return g;
}

function malaiBarfi(kit: Kit) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.38, 0.95, 4, 0.1), sweetMaterial("#fbf1dc", kit.grainB, 0.85)));
  // Silver varak on top.
  const varak = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.8, 1, 1),
    new THREE.MeshStandardMaterial({ color: "#e8e8ea", metalness: 1, roughness: 0.32, bumpMap: kit.grainB, bumpScale: 2 }),
  );
  varak.rotation.x = -Math.PI / 2;
  varak.position.y = 0.192;
  g.add(varak);
  return g;
}

function peda(kit: Kit) {
  const g = new THREE.Group();
  // Lathe profile: a round disc with a thumb-pressed dip in the middle.
  const pts = [
    [0, 0.13], [0.1, 0.12], [0.2, 0.17], [0.32, 0.2], [0.44, 0.17], [0.52, 0.08], [0.54, -0.02], [0.5, -0.12], [0.38, -0.17], [0, -0.17],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 48);
  g.add(new THREE.Mesh(geo, sweetMaterial("#d6a15e", kit.grainA, 0.7)));
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: "#8cbf4f", roughness: 0.5 }));
  nut.scale.set(1.6, 0.5, 1);
  nut.position.y = 0.15;
  g.add(nut);
  return g;
}

// ---------------------------------------------------------------------------------------------- props

function matki() {
  const g = new THREE.Group();
  const profile = [
    [0, -0.9], [0.45, -0.88], [0.8, -0.6], [0.95, -0.15], [0.88, 0.3], [0.6, 0.62], [0.42, 0.72], [0.4, 0.82], [0.5, 0.92], [0.52, 0.98], [0.44, 0.98], [0.36, 0.86],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const curve = new THREE.SplineCurve(profile);
  const geo = new THREE.LatheGeometry(curve.getPoints(80), 72);
  // Terracotta with a painted white band.
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#b6552d";
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = "#f6e7d3";
  ctx.fillRect(0, 118, 512, 10);
  ctx.fillRect(0, 150, 512, 4);
  for (let x = 8; x < 512; x += 32) {
    ctx.beginPath();
    ctx.arc(x, 138, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(geo, mat));
  // Milk inside the mouth.
  const milk = new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), new THREE.MeshPhysicalMaterial({ color: "#fffdf7", roughness: 0.15, clearcoat: 1 }));
  milk.rotation.x = -Math.PI / 2;
  milk.position.y = 0.9;
  g.add(milk);
  return g;
}

function logoTexture() {
  const tex = new THREE.TextureLoader().load("/logos/mithaiwallah.png");
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A Mithai Wallah sweet box: blush walls, gold band, logo on the lid. Returns the lid separately so it can open. */
function sweetBox(logo: THREE.Texture, w = 2.4, h = 0.62, d = 1.7) {
  const box = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: "#ffe1e1", roughness: 0.55 });
  const liner = new THREE.MeshStandardMaterial({ color: "#fff8ee", roughness: 0.9 });
  const t = 0.05;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), liner);
  floor.position.y = -h / 2;
  box.add(floor);
  for (const [x, z, sw, sd] of [
    [0, d / 2, w, t],
    [0, -d / 2, w, t],
    [w / 2, 0, t, d],
    [-w / 2, 0, t, d],
  ] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sw, h, sd), wall);
    m.position.set(x, 0, z);
    box.add(m);
  }
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.02, 0.08, d + 0.02),
    new THREE.MeshStandardMaterial({ color: "#e6b84f", metalness: 0.7, roughness: 0.3 }),
  );
  band.position.y = -h / 2 + 0.16;
  box.add(band);

  const lid = new THREE.Group();
  const lidBody = new THREE.Mesh(new RoundedBoxGeometry(w + 0.1, 0.2, d + 0.1, 3, 0.05), new THREE.MeshStandardMaterial({ color: "#fff0f0", roughness: 0.5 }));
  lid.add(lidBody);
  const ribbon = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.205, d + 0.12),
    new THREE.MeshStandardMaterial({ color: "#ff6b4a", roughness: 0.45 }),
  );
  ribbon.position.x = -w * 0.32;
  lid.add(ribbon);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.52, w * 0.52 * (507 / 900)),
    new THREE.MeshStandardMaterial({ map: logo, transparent: true, roughness: 0.6 }),
  );
  label.rotation.x = -Math.PI / 2;
  label.position.set(w * 0.08, 0.102, 0);
  lid.add(label);
  lid.position.y = h / 2 + 0.06;
  box.add(lid);
  return { box, lid };
}

// ---------------------------------------------------------------------------------------------- poses

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const k = smooth(clamp01(t));
  return {
    p: [mix(a.p[0], b.p[0], k), mix(a.p[1], b.p[1], k), mix(a.p[2], b.p[2], k)],
    r: [mix(a.r[0], b.r[0], k), mix(a.r[1], b.r[1], k), mix(a.r[2], b.r[2], k)],
    s: mix(a.s, b.s, k),
  };
}

/** Pose at story progress p from one keyframe per chapter (at chapter centres 0.5, 1.5, …). */
function poseAt(keys: Pose[], p: number): Pose {
  const x = p - 0.5;
  if (x <= 0) return keys[0];
  const i = Math.floor(x);
  if (i >= keys.length - 1) return keys[keys.length - 1];
  // Hold for 30% after a chapter's middle and 30% before the next one; travel in between.
  return lerpPose(keys[i], keys[i + 1], (x - i - 0.3) / 0.4);
}

const P = (p: Vec3, s = 1, r: Vec3 = [0, 0, 0]): Pose => ({ p, r, s });
const OFF = (p: Vec3): Pose => ({ p, r: [0, 0, 0], s: HIDDEN });

// ---------------------------------------------------------------------------------------------- scene

export type SweetScene = {
  update: (progress: number, chapterLocal: number) => void;
  resize: (width: number, height: number) => void;
  render: (timeMs: number) => void;
  dispose: () => void;
};

export function createSweetScene(canvas: HTMLCanvasElement): SweetScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.6, 11);
  camera.lookAt(0, 0, 0);

  const key = new THREE.DirectionalLight("#fff3e0", 1.6);
  key.position.set(4, 6, 5);
  scene.add(key, new THREE.HemisphereLight("#ffffff", "#f3d9c4", 0.6));

  const kit: Kit = { grainA: grainTexture(7), grainB: grainTexture(13, 1.6) };
  const shadowTex = shadowTexture();
  const logo = logoTexture();

  // The whole story sits in a rig that is shifted right on wide screens and down on phones.
  const rig = new THREE.Group();
  scene.add(rig);

  type Actor = { obj: THREE.Object3D; keys: Pose[]; spin?: number; bob?: number; phase: number; shadow?: THREE.Mesh };
  const actors: Actor[] = [];
  const addActor = (obj: THREE.Object3D, keys: Pose[], opts: { spin?: number; bob?: number; shadow?: number } = {}) => {
    const a: Actor = { obj, keys, spin: opts.spin, bob: opts.bob, phase: actors.length * 1.7 };
    if (opts.shadow) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(opts.shadow, opts.shadow * 0.55), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
      s.rotation.x = -Math.PI / 2;
      a.shadow = s;
      rig.add(s);
    }
    rig.add(obj);
    actors.push(a);
    return a;
  };

  // Chapter 0: matki pours milk; sweets float around it. Chapter 1: milk cake & kalakand side by side.
  // Chapter 2: three box sizes. Chapter 3: the sweet box opens. Chapter 4: everything leaves.
  const pot = matki();
  addActor(pot, [P([0.9, 1.55, -0.5], 0.9, [0, 0, 0.75]), OFF([2.5, 4, -2]), OFF([2.5, 4, -2]), OFF([2.5, 4, -2]), OFF([2.5, 4, -2])]);

  const stream = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 1, 20, 1, true),
    new THREE.MeshPhysicalMaterial({ color: "#fffdf8", roughness: 0.12, clearcoat: 1 }),
  );
  stream.geometry.translate(0, -0.5, 0);
  rig.add(stream);
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 24), new THREE.MeshPhysicalMaterial({ color: "#fffdf8", roughness: 0.08, clearcoat: 1 }));
  rig.add(drop);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshPhysicalMaterial({ color: "#fffdf7", roughness: 0.1, clearcoat: 1, transparent: true }));
  pool.rotation.x = -Math.PI / 2;
  rig.add(pool);

  addActor(milkCake(kit), [
    P([-0.9, -0.15, 0.6], 1, [0.35, -0.5, 0.08]),
    P([-1.15, -0.2, 0.8], 1.35, [0.3, 0.5, 0]),
    OFF([-1.5, -3, 0]),
    OFF([0, -3, 0]),
    OFF([0, -3, 0]),
  ], { spin: 0.1, bob: 0.06, shadow: 1.8 });
  addActor(kalakand(kit), [
    P([0.75, -0.75, 1.2], 0.85, [0.4, 0.6, -0.1]),
    P([1.25, -0.2, 0.8], 1.35, [0.3, -0.5, 0]),
    OFF([1.5, -3, 0]),
    OFF([0, -3, 0]),
    OFF([0, -3, 0]),
  ], { spin: -0.1, bob: 0.06, shadow: 1.7 });
  addActor(chocolateBarfi(kit), [P([-1.6, 1.0, -0.6], 0.8, [0.5, 0.8, -0.3]), OFF([-3, -3, -1]), OFF([-3, -3, -1]), OFF([0, -4, 0]), OFF([0, -4, 0])], { spin: 0.18, bob: 0.1 });
  addActor(dodaBarfi(kit), [P([1.95, 0.1, -0.2], 0.75, [0.6, -0.4, 0.3]), OFF([3, -3, -1]), OFF([3, -3, -1]), OFF([0, -4, 0]), OFF([0, -4, 0])], { spin: -0.16, bob: 0.1 });
  addActor(peda(kit), [P([-0.35, -1.45, 0.9], 0.8, [0.9, 0, 0.15]), OFF([0, -3, 1]), OFF([0, -3, 1]), OFF([0, -3, 0]), OFF([0, -3, 0])], { spin: 0.25, bob: 0.08 });
  addActor(malaiBarfi(kit), [P([-1.85, -0.9, 0.3], 0.7, [0.55, 0.5, 0.2]), OFF([-3, -2, 0]), OFF([-3, -2, 0]), OFF([0, -3, 0]), OFF([0, -3, 0])], { spin: 0.14, bob: 0.09 });

  // Chapter 2: the three sizes (1 kg, 500 g, 250 g) stacked into a little tower.
  const stack = [
    { s: 1.0, y: -1.35, ry: -0.35 },
    { s: 0.78, y: -0.5, ry: -0.12 },
    { s: 0.58, y: 0.16, ry: -0.5 },
  ];
  stack.forEach(({ s, y, ry }, i) => {
    const { box } = sweetBox(logo);
    addActor(box, [
      OFF([0.2, -4, 0]),
      OFF([0.2, -4, 0]),
      P([0.2, y, 0], s, [0.32, ry, 0]),
      OFF([0.2, -4.5 - i * 0.4, 0]),
      OFF([0, -4.5, 0]),
    ], { bob: 0.015, shadow: i === 0 ? 3.4 : undefined });
  });

  // Chapter 3: the open box with sweets inside.
  const hero = sweetBox(logo);
  const inside = new THREE.Group();
  const minis = [milkCake(kit), kalakand(kit), chocolateBarfi(kit), dodaBarfi(kit), malaiBarfi(kit), peda(kit)];
  minis.forEach((m, i) => {
    m.scale.setScalar(0.62);
    m.position.set(-0.75 + (i % 3) * 0.75, -0.12, i < 3 ? -0.4 : 0.4);
    if (i === 5) m.position.y = -0.18;
    inside.add(m);
  });
  hero.box.add(inside);
  addActor(hero.box, [OFF([0, -3, 0]), OFF([0, -3, 0]), OFF([0, -3, 0]), P([0.1, -0.75, 0.2], 1.12, [0.62, -0.42, 0]), OFF([0, -4.5, 0])], { bob: 0.03, shadow: 4 });
  const lidClosedY = hero.lid.position.y;

  // ---------------------------------------------------------------------------------- state & frame loop

  let progress = 0;
  let local = 0;
  const start = performance.now();

  function layout(width: number, height: number) {
    const wide = width >= 900;
    const aspect = width / height;
    camera.aspect = aspect;
    if (wide) {
      rig.position.set(2.0, 0, 0);
      rig.scale.setScalar(1);
    } else {
      // Phones: text on top, the 3D in the lower half, a little smaller.
      rig.position.set(0, -2.05, 0);
      rig.scale.setScalar(Math.min(0.66, 0.45 + aspect * 0.35));
    }
    camera.updateProjectionMatrix();
  }

  return {
    update(p, l) {
      progress = p;
      local = l;
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      layout(width, height);
    },
    render(timeMs) {
      const t = (timeMs - start) / 1000;
      // Intro: everything pops in over the first second and a half.
      const intro = clamp01(t / 1.4);
      for (const a of actors) {
        const pose = poseAt(a.keys, progress);
        const delay = clamp01((t - a.phase * 0.08) / 0.9);
        const pop = progress < 1 ? 1 - Math.pow(1 - delay, 3) * Math.cos(delay * 4.2) * (1 - delay) : 1;
        const bob = a.bob ? Math.sin(t * 1.3 + a.phase) * a.bob : 0;
        a.obj.position.set(pose.p[0], pose.p[1] + bob, pose.p[2]);
        a.obj.rotation.set(pose.r[0], pose.r[1] + (a.spin ? t * a.spin : 0), pose.r[2]);
        const s = pose.s * (progress < 1 ? Math.max(HIDDEN, pop) : 1);
        a.obj.scale.setScalar(Math.max(HIDDEN, s));
        a.obj.visible = s > 0.01;
        if (a.shadow) {
          a.shadow.position.set(pose.p[0], pose.p[1] - 0.75 * pose.s, pose.p[2]);
          a.shadow.scale.setScalar(Math.max(HIDDEN, pose.s));
          a.shadow.visible = a.obj.visible;
          (a.shadow.material as THREE.MeshBasicMaterial).opacity = clamp01(pose.s) * (1 - bob * 2);
        }
      }

      // Milk pour (hero only): the stream grows, a drop falls and lands in a spreading pool.
      const potActor = actors[0];
      const heroVis = clamp01(1 - progress * 1.6) * intro;
      const spout = new THREE.Vector3(-0.42, 0.98, 0).applyEuler(potActor.obj.rotation).multiplyScalar(potActor.obj.scale.x).add(potActor.obj.position);
      const fall = 2.2;
      const cycle = (t % 2.6) / 2.6;
      stream.visible = drop.visible = heroVis > 0.02;
      stream.position.copy(spout);
      stream.scale.set(heroVis, fall * clamp01(t / 1.2) * heroVis + HIDDEN, heroVis);
      drop.position.set(spout.x, spout.y - fall * smooth(cycle), spout.z);
      drop.scale.set(0.9 * heroVis, (1.1 + cycle * 0.5) * heroVis, 0.9 * heroVis);
      pool.position.set(spout.x, spout.y - fall - 0.05, spout.z);
      pool.scale.setScalar(Math.max(HIDDEN, heroVis * (0.55 + 0.1 * Math.sin(t * 2))));
      (pool.material as THREE.MeshPhysicalMaterial).opacity = heroVis * 0.9;
      pool.visible = heroVis > 0.02;

      // Chapter 3: the lid lifts and tips back as the visitor scrolls through it.
      const open = progress >= 3 && progress < 4 ? smooth(clamp01((local - 0.05) / 0.35)) : progress >= 4 ? 1 : 0;
      hero.lid.position.y = lidClosedY + open * 0.7;
      hero.lid.position.z = -open * 1.25;
      hero.lid.rotation.x = -open * 1.35;
      inside.position.y = open * 0.12;

      // A slow drift of the camera keeps the scene alive even when nobody scrolls.
      camera.position.x = Math.sin(t * 0.25) * 0.15;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    },
    dispose() {
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        mats.forEach((m) => m.dispose());
      });
      [kit.grainA, kit.grainB, shadowTex, logo, envTex].forEach((t) => t.dispose());
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
