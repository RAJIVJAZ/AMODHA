function catmullRomToPath(points: [number, number][]): string {
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n];
  const first = at(0);
  const segments: string[] = [`M ${first[0].toFixed(2)},${first[1].toFixed(2)}`];

  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    segments.push(
      `C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
    );
  }
  segments.push("Z");
  return segments.join(" ");
}

/**
 * Generates a puffy, scalloped "plaque" outline (like a traditional mithai-box
 * badge) by perturbing an ellipse with a sine wave, then smoothing through the
 * sampled peaks/valleys with Catmull-Rom curves.
 */
export function scallopedBadgePath(
  width: number,
  height: number,
  { bumps = 12, amplitude = 7 }: { bumps?: number; amplitude?: number } = {}
): string {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2 - amplitude;
  const ry = height / 2 - amplitude;
  const samples = bumps * 2;
  const points: [number, number][] = [];

  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    const bump = Math.sin(theta * bumps) * amplitude;
    points.push([cx + (rx + bump) * Math.cos(theta), cy + (ry + bump) * Math.sin(theta)]);
  }

  return catmullRomToPath(points);
}
