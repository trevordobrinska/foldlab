// Plane geometry for flat-folded paper. Every face of paper folded along
// straight lines from convex Paper is itself convex, so convex-only
// algorithms are enough here.

export type Point = [number, number];

/** A line through `origin` in the direction `vector` (Rabbit Ear's VecLine2). */
export interface Line {
  origin: Point;
  vector: Point;
}

/** 2D affine map [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine = [number, number, number, number, number, number];

export const EPSILON = 1e-8;

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

export const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
export const cross = (a: Point, b: Point): number => a[0] * b[1] - a[1] * b[0];
export const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Which side of `line` a point is on: 1 (left), -1 (right) or 0 (on it). */
export function side(line: Line, point: Point): -1 | 0 | 1 {
  const length = Math.hypot(line.vector[0], line.vector[1]);
  const distance = cross(line.vector, sub(point, line.origin)) / length;
  return distance > EPSILON ? 1 : distance < -EPSILON ? -1 : 0;
}

/** Where segment a→b crosses `line`, as a parameter t along the segment. */
export function crossingParameter(line: Line, a: Point, b: Point): number {
  const da = cross(line.vector, sub(a, line.origin));
  const db = cross(line.vector, sub(b, line.origin));
  return da / (da - db);
}

export function signedArea(polygon: Point[]): number {
  let sum = 0;
  polygon.forEach((p, i) => {
    sum += cross(p, polygon[(i + 1) % polygon.length]);
  });
  return sum / 2;
}

/** The part of a convex polygon on side `keep` (1 or -1) of `line`, edges on the line included. */
export function clipToSide(polygon: Point[], line: Line, keep: 1 | -1): Point[] {
  const out: Point[] = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const sa = side(line, a) * keep;
    const sb = side(line, b) * keep;
    if (sa >= 0) out.push(a);
    if ((sa > 0 && sb < 0) || (sa < 0 && sb > 0)) out.push(lerp(a, b, crossingParameter(line, a, b)));
  });
  return out;
}

/** Area shared by two convex polygons. */
export function overlapArea(a: Point[], b: Point[]): number {
  const ccw = signedArea(b) >= 0 ? b : [...b].reverse();
  let clipped = signedArea(a) >= 0 ? a : [...a].reverse();
  for (let i = 0; i < ccw.length && clipped.length > 2; i++) {
    const p = ccw[i];
    const q = ccw[(i + 1) % ccw.length];
    clipped = clipToSide(clipped, { origin: p, vector: sub(q, p) }, 1);
  }
  return clipped.length > 2 ? Math.abs(signedArea(clipped)) : 0;
}

/** True when `point` is inside a convex polygon or on its boundary. */
export function contains(polygon: Point[], point: Point): boolean {
  const orientation = signedArea(polygon) >= 0 ? 1 : -1;
  return polygon.every((p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    return side({ origin: p, vector: sub(q, p) }, point) * orientation >= 0;
  });
}

export function apply(m: Affine, [x, y]: Point): Point {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Apply `m` to a direction (no translation). */
export function applyLinear(m: Affine, [x, y]: Point): Point {
  return [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
}

/** m then n: the map x ↦ n(m(x)). */
export function compose(n: Affine, m: Affine): Affine {
  return [
    n[0] * m[0] + n[2] * m[1],
    n[1] * m[0] + n[3] * m[1],
    n[0] * m[2] + n[2] * m[3],
    n[1] * m[2] + n[3] * m[3],
    n[0] * m[4] + n[2] * m[5] + n[4],
    n[1] * m[4] + n[3] * m[5] + n[5],
  ];
}

export function determinant(m: Affine): number {
  return m[0] * m[3] - m[1] * m[2];
}

export function invert(m: Affine): Affine {
  const det = determinant(m);
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

/** The affine map taking each `from` point to its `to` point (uses the best-spread triple). */
export function affineFromPoints(from: Point[], to: Point[]): Affine {
  let best = [0, 1, 2];
  let bestArea = 0;
  for (let j = 1; j < from.length; j++) {
    for (let k = j + 1; k < from.length; k++) {
      const area = Math.abs(cross(sub(from[j], from[0]), sub(from[k], from[0])));
      if (area > bestArea) {
        bestArea = area;
        best = [0, j, k];
      }
    }
  }
  const [i, j, k] = best;
  const e1 = sub(from[j], from[i]);
  const e2 = sub(from[k], from[i]);
  const f1 = sub(to[j], to[i]);
  const f2 = sub(to[k], to[i]);
  // Linear part L with L·e1 = f1, L·e2 = f2, i.e. L = F · E⁻¹.
  const linear = compose([f1[0], f1[1], f2[0], f2[1], 0, 0], invert([e1[0], e1[1], e2[0], e2[1], 0, 0]));
  const moved = applyLinear(linear, from[i]);
  return [linear[0], linear[1], linear[2], linear[3], to[i][0] - moved[0], to[i][1] - moved[1]];
}

/** Rotation by `degrees` counterclockwise about `centre`. */
export function rotationAbout(centre: Point, degrees: number): Affine {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return compose(translation(centre), compose([cos, sin, -sin, cos, 0, 0], translation([-centre[0], -centre[1]])));
}

/** Mirror left-to-right about the vertical line through `centre`. */
export function mirrorAbout(centre: Point): Affine {
  return [-1, 0, 0, 1, 2 * centre[0], 0];
}

function translation([x, y]: Point): Affine {
  return [1, 0, 0, 1, x, y];
}
