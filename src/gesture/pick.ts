// What one finger picks up when it touches the paper: the nearest corner,
// or else the nearest point of an edge. Pure geometry on the paper as it
// lies at rest (flat or flat-folded) on the table, seen from above: x to his
// right, z toward him. No engine and no camera: the page has the paper only
// as a Recording's drawn shape (src/view/shape.ts).

import type { TablePoint } from "../view/pointer";

/** The paper lying at rest, as the view draws it: the parts of a PaperShape that picking reads. */
export interface RestingPaper {
  /** x y z for each of three corners per triangle. */
  triangles: ArrayLike<number>;
  /** The outline and the folded creases: x y z, x y z per segment. */
  edges: ArrayLike<number>;
}

/** A point of the paper's edges he has hold of. */
export interface Pick {
  /** The segment of `edges` it lies on, and how far along it (0..1). */
  segment: number;
  t: number;
  /** A corner of the paper as it lies, rather than a point along an edge. */
  corner: boolean;
  at: TablePoint;
}

/** A finger this close to a corner picks the corner up, in paper units (the paper is about one unit across). */
export const CORNER_REACH = 0.12;
/** A finger this far off the paper's edge still touches the paper. */
export const EDGE_REACH = 0.06;

const SAME = 1e-6;

/**
 * The edge point a touch picks up: one Pick for every edge segment that
 * passes through it (layers lying on each other each have one), the highest
 * first. Empty when the touch is on the background.
 */
export function pick(paper: RestingPaper, touch: TablePoint): Pick[] {
  const { edges, triangles } = paper;
  const count = Math.floor(edges.length / 6);
  if (!count) return [];

  // The nearest point of any edge.
  let nearest: TablePoint | undefined;
  let nearestDistance = Infinity;
  for (let s = 0; s < count; s++) {
    const point = along(edges, s, parameter(edges, s, touch));
    const d = distance(point, touch);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = point;
    }
  }
  if (!nearest) return [];
  if (nearestDistance > EDGE_REACH && !covers(triangles, touch)) return [];

  // A corner within reach wins over a nearer point along an edge.
  let target = nearest;
  let corner = false;
  let cornerDistance = CORNER_REACH;
  for (const c of corners(edges, count)) {
    const d = distance(c, touch);
    if (d <= cornerDistance) {
      cornerDistance = d;
      target = c;
      corner = true;
    }
  }

  const picks: (Pick & { height: number })[] = [];
  for (let s = 0; s < count; s++) {
    const t = parameter(edges, s, target);
    if (distance(along(edges, s, t), target) > SAME) continue;
    const o = s * 6;
    picks.push({ segment: s, t, corner, at: target, height: edges[o + 1] + (edges[o + 4] - edges[o + 1]) * t });
  }
  picks.sort((a, b) => b.height - a.height);
  return picks.map(({ segment, t, corner, at }) => ({ segment, t, corner, at }));
}

const distance = (a: TablePoint, b: TablePoint) => Math.hypot(a.x - b.x, a.z - b.z);

/** How far along segment `s` (0..1) its nearest point to `p` lies. */
function parameter(edges: ArrayLike<number>, s: number, p: TablePoint): number {
  const o = s * 6;
  const dx = edges[o + 3] - edges[o];
  const dz = edges[o + 5] - edges[o + 2];
  const squared = dx * dx + dz * dz;
  if (squared < SAME * SAME) return 0;
  return Math.min(1, Math.max(0, ((p.x - edges[o]) * dx + (p.z - edges[o + 2]) * dz) / squared));
}

function along(edges: ArrayLike<number>, s: number, t: number): TablePoint {
  const o = s * 6;
  return { x: edges[o] + (edges[o + 3] - edges[o]) * t, z: edges[o + 2] + (edges[o + 5] - edges[o + 2]) * t };
}

/** Whether the touch is over any triangle of the paper, seen from above. */
function covers(triangles: ArrayLike<number>, p: TablePoint): boolean {
  for (let o = 0; o + 8 < triangles.length; o += 9) {
    const turn = (i: number, j: number) =>
      (triangles[o + j] - triangles[o + i]) * (p.z - triangles[o + i + 2]) - (triangles[o + j + 2] - triangles[o + i + 2]) * (p.x - triangles[o + i]);
    const a = turn(0, 3);
    const b = turn(3, 6);
    const c = turn(6, 0);
    if ((a >= -SAME && b >= -SAME && c >= -SAME) || (a <= SAME && b <= SAME && c <= SAME)) return true;
  }
  return false;
}

/**
 * The corners of the paper as it lies: the segment ends where the edges
 * there do not all run along one line (a joint along a straight edge is not
 * a corner; the free end of an edge is).
 */
function corners(edges: ArrayLike<number>, count: number): TablePoint[] {
  const ends = new Map<string, { at: TablePoint; directions: [number, number][] }>();
  const key = (p: TablePoint) => `${Math.round(p.x * 1e5)} ${Math.round(p.z * 1e5)}`;
  for (let s = 0; s < count; s++) {
    const a = along(edges, s, 0);
    const b = along(edges, s, 1);
    const length = distance(a, b);
    if (length < SAME) continue;
    const direction: [number, number] = [(b.x - a.x) / length, (b.z - a.z) / length];
    for (const end of [a, b]) {
      const entry = ends.get(key(end)) ?? { at: end, directions: [] };
      entry.directions.push(direction);
      ends.set(key(end), entry);
    }
  }
  const found: TablePoint[] = [];
  for (const { at, directions } of ends.values()) {
    const [first] = directions;
    const straight = directions.length > 1 && directions.every(([x, z]) => Math.abs(first[0] * z - first[1] * x) < 1e-4);
    if (!straight) found.push(at);
  }
  return found;
}
