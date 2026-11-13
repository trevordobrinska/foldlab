// The bar-and-hinge mesh of one Fold (Ghassaei, Demaine, Gershenfeld 2018):
// the Paper after the Fold, triangulated, with every triangle edge a stiff
// bar and every shared edge a hinge. Hinges on crease edges are driven from
// the angle before the Fold to the angle after; hinges inside a face (its
// facets) want to stay flat, but softly, so faces can bend the way real
// paper does. Each face is fanned from its centre and then subdivided, so it
// has enough facets to bend: a bare fan is a single vertex of degree n, which
// bends in n - 3 ways only (a triangle not at all). Pure: Papers in, a mesh out.

import { makeVerticesCoordsFlatFolded } from "rabbit-ear/graph/vertices/folded.js";
import { contains, determinant, EPSILON, type Point } from "../engine/geometry";
import { seenFaces, type Assignment, type FoldGraph, type Paper } from "../engine/paper";
import { dihedral, type Hinge } from "./hinge";
import type { V3 } from "./vec3";

export type { Hinge } from "./hinge";

/** How far apart two layers lie, in paper units (the Paper is about one unit across). */
export const LAYER_GAP = 0.004;

/** Times each fan triangle is split in four. */
const SUBDIVISIONS = 1;

export interface PaperEdge {
  /** The mesh vertices along the edge, end to end. */
  chain: number[];
  assignment: Assignment;
  /** True when the edge is folded flat (a layer's folded edge) at the start or the end of the Fold. */
  folded: boolean;
}

export interface Mesh {
  /** Mesh vertices 0..paperVertexCount-1 are the Paper's own; the rest are face centres and subdivision points. */
  paperVertexCount: number;
  /** Positions at the start and the end: the Paper flat-folded, with its layers set apart by LAYER_GAP. */
  start: V3[];
  end: V3[];
  /** Three vertex indices each, wound with the paper's front side counter-clockwise. */
  triangles: [number, number, number][];
  /** The Paper face (after the Fold) each triangle belongs to. */
  triangleFace: number[];
  /** For each face after the Fold, the face before it was part of. */
  faceBefore: number[];
  /** Every triangle edge once: [u, v, length on the flat paper]. */
  bars: [number, number, number][];
  hinges: Hinge[];
  /** Vertices the hand holds still: corners of paper that doesn't move, away from this Fold's creases. */
  pinned: boolean[];
  /** The Paper's edges, for drawing. */
  edges: PaperEdge[];
}

/** The mesh of the Fold that takes `before` to `after` (`after` must come from one engine Fold on `before`). */
export function buildMesh(before: Paper, after: Paper): Mesh {
  const graph = after.graph;
  const n = graph.vertices_coords.length;

  // Vertices: the Paper's, then each face's centre, then subdivision points.
  // Each made vertex is the mean of its parents, on the flat paper and folded alike.
  const parents: number[][] = graph.vertices_coords.map(() => []);
  const flat: Point[] = [...graph.vertices_coords];
  /** The Paper edges a vertex lies on. */
  const onEdge: Set<number>[] = graph.vertices_coords.map(() => new Set());
  graph.edges_vertices.forEach(([u, v], e) => {
    onEdge[u].add(e);
    onEdge[v].add(e);
  });
  const mean = (ids: number[]): Point => [
    ids.reduce((sum, v) => sum + flat[v][0], 0) / ids.length,
    ids.reduce((sum, v) => sum + flat[v][1], 0) / ids.length,
  ];
  const make = (from: number[], edges: Set<number>): number => {
    parents.push(from);
    flat.push(mean(from));
    onEdge.push(edges);
    return flat.length - 1;
  };

  let triangles: [number, number, number][] = [];
  let triangleFace: number[] = [];
  graph.faces_vertices.forEach((loop, f) => {
    const centre = make(loop, new Set());
    loop.forEach((u, i) => {
      triangles.push([u, loop[(i + 1) % loop.length], centre]);
      triangleFace.push(f);
    });
  });
  const midpoints = new Map<string, number>();
  const midpoint = (u: number, v: number): number => {
    const key = u < v ? `${u} ${v}` : `${v} ${u}`;
    let m = midpoints.get(key);
    if (m === undefined) {
      const shared = new Set([...onEdge[u]].filter((e) => onEdge[v].has(e)));
      m = make([u, v], shared);
      midpoints.set(key, m);
    }
    return m;
  };
  for (let s = 0; s < SUBDIVISIONS; s++) {
    const finer: [number, number, number][] = [];
    const finerFace: number[] = [];
    triangles.forEach(([a, b, c], t) => {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      finer.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      finerFace.push(triangleFace[t], triangleFace[t], triangleFace[t], triangleFace[t]);
    });
    triangles = finer;
    triangleFace = finerFace;
  }

  const flatDistance = (u: number, v: number) => Math.hypot(flat[u][0] - flat[v][0], flat[u][1] - flat[v][1]);
  const key = (u: number, v: number) => (u < v ? `${u} ${v}` : `${v} ${u}`);

  // Bars: every triangle edge once. Hinges: every edge two triangles share.
  const bars: [number, number, number][] = [];
  const traversal = new Map<string, number>();
  const seen = new Set<string>();
  triangles.forEach(([a, b, c], t) => {
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      traversal.set(`${u} ${v}`, t);
      if (seen.has(key(u, v))) continue;
      seen.add(key(u, v));
      bars.push([u, v, flatDistance(u, v)]);
    }
  });
  const startAngles = graph.edges_vertices.map((edge, e) => angleBefore(before.graph, graph, e, edge));
  const paperEdgeOf = (u: number, v: number): number | undefined => {
    for (const e of onEdge[u]) if (onEdge[v].has(e)) return e;
    return undefined;
  };
  const faceBefore = graph.faces_vertices.map((loop) => {
    const centre = mean(loop);
    return before.graph.faces_vertices.findIndex((old) => contains(old.map((v) => before.graph.vertices_coords[v]), centre));
  });
  const facesOf: number[][] = flat.map(() => []);
  triangles.forEach((tri, t) => tri.forEach((v) => facesOf[v].push(triangleFace[t])));

  const facing = Math.sign(determinant(after.view));
  const layersBefore = seenFaces(before).map((face) => face.layer);
  const layout = (angles: number[], layerOf: number[]) =>
    layeredLayout(graph, after.rootFace, angles, parents, facesOf, layerOf, facing);
  const start = layout(startAngles, faceBefore.map((f) => layersBefore[f]));
  const end = layout(graph.edges_foldAngle, seenFaces(after).map((face) => face.layer));
  const movingEdges = new Set(graph.edges_vertices.flatMap((_, e) => (startAngles[e] !== graph.edges_foldAngle[e] ? [e] : [])));

  // Hinges take their start and end angles from the layered Paper as it
  // lies, so both ends of the Fold are places the mesh can rest exactly.
  const hinges: Hinge[] = bars.flatMap(([u, v, restLength]) => {
    const t1 = traversal.get(`${u} ${v}`);
    const t2 = traversal.get(`${v} ${u}`);
    if (t1 === undefined || t2 === undefined) return [];
    const apex = (t: number, a: number, b: number) => triangles[t].find((w) => w !== a && w !== b)!;
    const e = paperEdgeOf(u, v);
    const hinge: Hinge = {
      edge: [u, v],
      apex: [apex(t1, u, v), apex(t2, u, v)],
      kind: e === undefined ? "facet" : "crease",
      start: 0,
      end: 0,
      driven: e !== undefined && movingEdges.has(e),
      restLength,
    };
    if (e !== undefined) hinge.paperEdge = e;
    hinge.start = dihedral(start, hinge);
    hinge.end = dihedral(end, hinge);
    return [hinge];
  });

  // The hand holds the corners of the paper that doesn't move, away from the creases that do.
  const moved = graph.faces_vertices.map((_, f) => {
    const centre = n + f;
    return Math.hypot(start[centre][0] - end[centre][0], start[centre][1] - end[centre][1]) > EPSILON;
  });
  const still = (v: number) => facesOf[v].every((f) => !moved[f]) && [...onEdge[v]].every((e) => !movingEdges.has(e));
  const pinned = flat.map((_, v) => v < n && still(v));

  const edges: PaperEdge[] = graph.edges_vertices.map(([u, v], e) => ({
    chain: chainAlong(u, v, parents, onEdge, e),
    assignment: graph.edges_assignment[e],
    folded: Math.abs(startAngles[e]) === 180 || Math.abs(graph.edges_foldAngle[e]) === 180,
  }));

  return { paperVertexCount: n, start, end, triangles, triangleFace, faceBefore, bars, hinges, pinned, edges };
}

/** The mesh vertices along Paper edge `e` from u to v, in order along the flat paper. */
function chainAlong(u: number, v: number, parents: number[][], onEdge: Set<number>[], e: number): number[] {
  const along = onEdge.flatMap((edges, w) => (edges.has(e) ? [w] : []));
  const order = new Map<number, number>([[u, 0], [v, 1]]);
  const at = (w: number): number => {
    if (!order.has(w)) order.set(w, parents[w].reduce((sum, p) => sum + at(p), 0) / parents[w].length);
    return order.get(w)!;
  };
  return along.sort((a, b) => at(a) - at(b));
}

/**
 * The fold angle an edge of the Paper after the Fold had before it: its own
 * if it already existed, the angle of the edge it was cut from, else flat.
 */
function angleBefore(old: FoldGraph, graph: FoldGraph, e: number, [u, v]: [number, number]): number {
  if (e < old.edges_vertices.length) return old.edges_foldAngle[e];
  const a = graph.vertices_coords[u];
  const b = graph.vertices_coords[v];
  const within = old.edges_vertices.findIndex(([p, q]) => {
    const P = old.vertices_coords[p];
    const Q = old.vertices_coords[q];
    return onSegment(P, Q, a) && onSegment(P, Q, b);
  });
  return within < 0 ? 0 : old.edges_foldAngle[within];
}

function onSegment(p: Point, q: Point, x: Point): boolean {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = Math.hypot(dx, dy);
  const t = ((x[0] - p[0]) * dx + (x[1] - p[1]) * dy) / (len * len);
  const off = Math.abs((x[0] - p[0]) * dy - (x[1] - p[1]) * dx) / len;
  return off < EPSILON && t > -EPSILON && t < 1 + EPSILON;
}

/**
 * The Paper flat-folded with the given angles, lifted into 3D: each layer
 * LAYER_GAP from the next (toward him is +z when `facing` is 1), the stack
 * centred on z = 0, and a vertex shared by layers in between them.
 */
function layeredLayout(
  graph: FoldGraph,
  rootFace: number,
  angles: number[],
  parents: number[][],
  facesOf: number[][],
  layerOf: number[],
  facing: number,
): V3[] {
  const assignments = graph.edges_assignment.map((a, e) =>
    a === "B" ? "B" : angles[e] > 0 ? "V" : angles[e] < 0 ? "M" : "F",
  );
  const laid = { ...graph, edges_foldAngle: angles, edges_assignment: assignments };
  const folded = makeVerticesCoordsFlatFolded(laid, [rootFace]) as Point[];
  const mean = layerOf.reduce((sum, layer) => sum + layer, 0) / layerOf.length;
  const out: V3[] = [];
  parents.forEach((from, v) => {
    const xy =
      from.length === 0
        ? folded[v]
        : [from.reduce((s, p) => s + out[p][0], 0) / from.length, from.reduce((s, p) => s + out[p][1], 0) / from.length];
    const layer = facesOf[v].reduce((sum, f) => sum + layerOf[f], 0) / facesOf[v].length;
    out.push([xy[0], xy[1], facing * LAYER_GAP * (layer - mean)]);
  });
  return out;
}
