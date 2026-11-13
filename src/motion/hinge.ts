// A hinge of the bar-and-hinge mesh: two triangles on a shared edge, and the
// signed angle between them (FOLD's sign: valley positive, the faces folding
// toward their front sides). The gradient follows Bridson, Marino and Fedkiw
// (2003), "Simulation of clothing with folds and wrinkles".

import { cross, dot, length, sub, type V3 } from "./vec3";

export interface Hinge {
  /** The ends of the shared edge. */
  edge: [number, number];
  /** The apex of the triangle on each side: (u, v, apex[0]) and (v, u, apex[1]), both wound front side up. */
  apex: [number, number];
  /** A crease of the Paper, or a facet inside a face. */
  kind: "crease" | "facet";
  /** The angle (radians) at the start and the end of the Fold, as the layered Paper lies. */
  start: number;
  end: number;
  /** True for a crease this Fold makes or turns; false for one from an earlier Step, which holds. */
  driven: boolean;
  /** The shared edge's length on the flat paper. */
  restLength: number;
  /** For a crease: the Paper edge it is part of. */
  paperEdge?: number;
}

/** The signed dihedral angle at a hinge: positive when the faces fold toward their front sides (a valley). */
export function dihedral(positions: V3[], hinge: Hinge): number {
  const [u, v] = hinge.edge;
  const [a, b] = hinge.apex;
  const e = sub(positions[v], positions[u]);
  const n1 = cross(e, sub(positions[a], positions[u]));
  const n2 = cross(sub(positions[u], positions[v]), sub(positions[b], positions[v]));
  const l1 = length(n1);
  const l2 = length(n2);
  if (l1 < 1e-18 || l2 < 1e-18) return 0;
  const sin = dot(cross(n2, n1), e) / (l1 * l2 * (length(e) || 1));
  const cos = dot(n1, n2) / (l1 * l2);
  return Math.atan2(sin, cos);
}

/** The gradient of the dihedral angle with respect to the hinge's four vertices: [u, v, apex0, apex1]. */
export function dihedralGradient(positions: V3[], hinge: Hinge): [V3, V3, V3, V3] {
  const [u, v] = hinge.edge;
  const [a, b] = hinge.apex;
  const x3 = positions[u];
  const x4 = positions[v];
  const x1 = positions[a];
  const x2 = positions[b];
  const e = sub(x4, x3);
  const el = length(e);
  const n1 = cross(e, sub(x1, x3));
  const n2 = cross(sub(x3, x4), sub(x2, x4));
  const n1sq = dot(n1, n1);
  const n2sq = dot(n2, n2);
  const g1: V3 = [(el * n1[0]) / n1sq, (el * n1[1]) / n1sq, (el * n1[2]) / n1sq];
  const g2: V3 = [(el * n2[0]) / n2sq, (el * n2[1]) / n2sq, (el * n2[2]) / n2sq];
  const k14 = dot(sub(x1, x4), e) / el;
  const k24 = dot(sub(x2, x4), e) / el;
  const k13 = dot(sub(x1, x3), e) / el;
  const k23 = dot(sub(x2, x3), e) / el;
  const g3: V3 = [0, 1, 2].map((i) => (k14 * n1[i]) / n1sq + (k24 * n2[i]) / n2sq) as V3;
  const g4: V3 = [0, 1, 2].map((i) => (-k13 * n1[i]) / n1sq - (k23 * n2[i]) / n2sq) as V3;
  return [g3, g4, g1, g2];
}
