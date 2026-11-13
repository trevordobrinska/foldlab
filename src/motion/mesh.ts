// The bar-and-hinge mesh of one Fold (Ghassaei, Demaine, Gershenfeld 2018):
// the Paper after the Fold, triangulated, with every triangle edge a stiff
// bar and every shared edge a hinge. Hinges on crease edges are driven from
// the angle before the Fold to the angle after; hinges inside a face (its
// facets) want to stay flat, but softly, so faces can bend the way real
// paper does. Each face is fanned from its centre and then subdivided, so it
// has enough facets to bend: a bare fan is a single vertex of degree n, which
// bends in n - 3 ways only (a triangle not at all). Pure: Papers in, a mesh out.

import { makeVerticesCoordsFlatFolded } from "rabbit-ear/graph/vertices/folded.js";
import { apply, applyLinear, contains, determinant, EPSILON, invert, type Line, type Point } from "../engine/geometry";
import { seenFaces, type Assignment, type FoldGraph, type Lift, type Paper } from "../engine/paper";
import { dihedral, type Hinge } from "./hinge";
import type { V3 } from "./vec3";

export type { Hinge } from "./hinge";

/** How far apart two layers lie, in paper units (the Paper is about one unit across). */
export const LAYER_GAP = 0.004;

/** Times each fan triangle is split in four. */
const SUBDIVISIONS = 1;

/** How a rigid Fold's creases are driven (see `rigidPath`). */
export const rigidTuning = {
  /**
   * The progress from which the creases leave the ideal path for the layered
   * rest angles measured at the end: 1 means only once the hinges have
   * arrived and the paper is being pressed flat. Earlier, the stiff hinge
   * springs turn a layer before its faces can take on the rest's bends, and
   * the two layers part company for a moment.
   */
  settleFrom: 1,
};

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
  /**
   * Positions at the start and the end: the Paper flat-folded, with its
   * layers set apart by LAYER_GAP. With a Lift, the start has the lifted
   * flap standing up on its line, its layers either side of the line's plane.
   */
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
  /**
   * True when the Fold folds rigidly, its faces staying flat throughout (a
   * squash: the hand drives the hinge and the paper's other creases follow),
   * so the faces are kept stiff all the way, not only when pressed at the ends.
   */
  rigid: boolean;
  /** The Paper's edges, for drawing. */
  edges: PaperEdge[];
  /** What `settleStack` needs to keep the layers in order while a Fold is made. */
  stack: {
    /** 1 when toward him is +z, -1 when it is -z. */
    facing: number;
    /** Each face's layer before the Fold: the faces that lie still keep this order among themselves. */
    layers: number[];
    /** Vertices whose height the layers meeting there settle, at the start or at the end. */
    held: boolean[];
  };
}

/**
 * The mesh of the Fold that takes `before` to `after` (`after` must come
 * from one engine Fold on `before`). With a `lift`, the Fold starts with
 * that flap already lifted to stand, the way the hand (and the diagram)
 * holds a flap before squashing it.
 */
export function buildMesh(before: Paper, after: Paper, lift?: Lift): Mesh {
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
    layeredLayout(graph, after.rootFace, angles, parents, facesOf, onEdge.map((edges) => edges.size > 0), triangles, triangleFace, layerOf, facing);
  const layersStart = faceBefore.map((f) => layersBefore[f]);
  const { positions: lying, held: heldStart } = layout(startAngles, layersStart);
  const liftLine = lift ? lineInFoldedFrame(lift.line, before) : undefined;
  const stood = liftLine ? standing(lying, lift!, liftLine, facesOf, faceBefore, layersBefore, facing) : undefined;
  const start = stood ? stood.positions : lying;
  /** Is this Paper edge the lifted flap's hinge: lying on the lift's line? */
  const onLiftLine = (e: number) =>
    liftLine !== undefined && graph.edges_vertices[e].every((v) => Math.abs(liftLine.distance(lying[v])) < EPSILON);
  const { positions: end, held: heldEnd } = layout(graph.edges_foldAngle, seenFaces(after).map((face) => face.layer));
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
    if (stood && e !== undefined) {
      // A lifted flap's hinge turns even where the engine's angle is the same at both ends.
      if (Math.abs(hinge.start - hinge.end) > 1e-3) {
        hinge.driven = true;
        movingEdges.add(e);
      }
      // The flap's layers stand half a gap either side of the line's plane, but share their hinge
      // vertices with the paper they stand on, so the triangles along the hinge are tilted by that
      // half gap. The hinge and the new creases are driven from the angles the flat faces have
      // (measured with the gap removed), or the springs would turn the two layers apart as the
      // faces flatten. The spine's gap is real: its two layers do lie a gap apart.
      if (hinge.driven && (onLiftLine(e) || Math.abs(startAngles[e]) !== 180)) hinge.start = dihedral(stood.flat, hinge);
    }
    return [hinge];
  });
  if (liftLine) rigidPath(hinges, graph, startAngles, lying, liftLine, onLiftLine);

  // The hand holds the corners of the paper that doesn't move, away from the creases that do.
  const moved = graph.faces_vertices.map((_, f) => {
    const centre = n + f;
    return Math.hypot(start[centre][0] - end[centre][0], start[centre][1] - end[centre][1]) > EPSILON;
  });
  const still = (v: number) => facesOf[v].every((f) => !moved[f]) && [...onEdge[v]].every((e) => !movingEdges.has(e));
  // With a flap lifted, the hand also holds the paper it stands on down along the hinge: every
  // vertex of a face that doesn't move which stays where it is (the hinge's ends and the points along it).
  const held = (v: number) =>
    lift !== undefined &&
    facesOf[v].some((f) => !moved[f]) &&
    Math.hypot(start[v][0] - end[v][0], start[v][1] - end[v][1]) < EPSILON;
  const pinned = flat.map((_, v) => (v < n && still(v)) || held(v));

  const edges: PaperEdge[] = graph.edges_vertices.map(([u, v], e) => ({
    chain: chainAlong(u, v, parents, onEdge, e),
    assignment: graph.edges_assignment[e],
    folded: Math.abs(startAngles[e]) === 180 || Math.abs(graph.edges_foldAngle[e]) === 180,
  }));

  const stack = { facing: facing || 1, layers: layersStart, held: heldStart.map((held, v) => held || heldEnd[v]) };
  return { paperVertexCount: n, start, end, triangles, triangleFace, faceBefore, bars, hinges, pinned, rigid: lift !== undefined, edges, stack };
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
 * centred on z = 0. Also given: the vertices `held`, whose height is settled
 * by the layers meeting there.
 *
 * A vertex inside a face lies at its face's layer. A vertex on a face's edge
 * (`onBoundary`) is where layers meet, and a crease has no width: at one
 * folded point, everything a crease wraps must come to the crease's own
 * height, or the layers cut through each other there. So the edge vertices
 * lying at one folded point are taken together. Each spans the layers of the
 * faces around it (one layer, for a raw edge; the two a folded crease joins,
 * and all those between). Spans that overlap are one bundle: a crease, the
 * creases nested inside it, and the raw edges and corners lying in the fold.
 * Every vertex of a bundle takes the bundle's middle height. Bundles at one
 * point that do not overlap keep their own heights, one above the other.
 *
 * The height depends on which layers meet at the point and not on how many
 * faces do, so cutting a face along a new crease (the mesh of the Fold about
 * to be made) leaves the layout as it was.
 *
 * Away from the point each face slopes back to its own layer over its own
 * triangles; `settleLayers` keeps those slopes gentle and out of each
 * other's way.
 */
function layeredLayout(
  graph: FoldGraph,
  rootFace: number,
  angles: number[],
  parents: number[][],
  facesOf: number[][],
  onBoundary: boolean[],
  triangles: [number, number, number][],
  triangleFace: number[],
  layerOf: number[],
  facing: number,
): { positions: V3[]; held: boolean[] } {
  const assignments = graph.edges_assignment.map((a, e) =>
    a === "B" ? "B" : angles[e] > 0 ? "V" : angles[e] < 0 ? "M" : "F",
  );
  const laid = { ...graph, edges_foldAngle: angles, edges_assignment: assignments };
  const folded = makeVerticesCoordsFlatFolded(laid, [rootFace]) as Point[];
  const xy: Point[] = [];
  parents.forEach((from, v) => {
    xy.push(
      from.length === 0
        ? folded[v]
        : [from.reduce((s, p) => s + xy[p][0], 0) / from.length, from.reduce((s, p) => s + xy[p][1], 0) / from.length],
    );
  });

  // Each vertex's span of layers, and its height on its own: the middle of the span.
  const span = facesOf.map((faces): [number, number] => {
    const layers = faces.map((f) => layerOf[f]);
    return [Math.min(...layers), Math.max(...layers)];
  });
  const layer = span.map(([low, high]) => (low + high) / 2);
  const held = span.map(([low, high]) => high > low);

  // The edge vertices at each folded point, bundled where their spans overlap.
  const places = new Map<string, number[]>();
  xy.forEach((p, v) => {
    if (!onBoundary[v]) return;
    const key = placeOf(p);
    places.set(key, [...(places.get(key) ?? []), v]);
  });
  for (const together of places.values()) {
    const byLow = [...together].sort((a, b) => span[a][0] - span[b][0]);
    let bundle: number[] = [];
    let [low, high] = [0, -Infinity];
    const settle = () => {
      if (high > low) bundle.forEach((v) => ((layer[v] = (low + high) / 2), (held[v] = true)));
    };
    for (const v of byLow) {
      if (span[v][0] > high) {
        settle();
        bundle = [];
        [low, high] = span[v];
      }
      bundle.push(v);
      high = Math.max(high, span[v][1]);
    }
    settle();
  }

  settleLayers(xy, layer, held, triangles, triangleFace, layerOf);

  const mean = layerOf.reduce((sum, l) => sum + l, 0) / layerOf.length;
  return { positions: xy.map((p, v) => [p[0], p[1], facing * LAYER_GAP * (layer[v] - mean)]), held };
}

/** Folded points nearer than this are one place (the Paper is about one unit across). */
const SAME_PLACE = 1e-6;

/** A name for the place a folded point lies at: the same for every point within SAME_PLACE or so. */
export function placeOf(p: ArrayLike<number>): string {
  return `${Math.round(p[0] / SAME_PLACE)} ${Math.round(p[1] / SAME_PLACE)}`;
}

/**
 * The most layers a face may climb or drop over one row of its triangles, to
 * a vertex held away from its own layer. A steeper slope stretches the bars
 * along it (by half the slope squared: at 3.5 layers over the cup's shorter
 * bars, about 0.5%); what is over is passed on to the next row.
 */
const STEEPEST = 3.5;

/**
 * The least room, in layers, a face is given over the face beneath it where
 * it has had to give way. Surfaces left exactly touching along a ridge read
 * as cutting through each other once a Recording's heights are rounded.
 */
const CLEARANCE = 0.02;

/**
 * The part of the stack that lies still while a Fold is made, kept in order
 * with some of its vertices moved: `positions` (changed in place) has the
 * `fixed` vertices where the Fold's motion puts them, and the others of the
 * still faces (those with no vertex in `moving`) give way as in a layout:
 * no slope too steep, no layer through another.
 */
export function settleStack(mesh: Mesh, positions: V3[], fixed: boolean[], moving: boolean[]): void {
  const { facing, layers } = mesh.stack;
  const still = layers.map((_, f) => mesh.triangles.every((triangle, t) => mesh.triangleFace[t] !== f || triangle.every((v) => !moving[v])));
  const triangles = mesh.triangles.filter((_, t) => still[mesh.triangleFace[t]]);
  const triangleFace = mesh.triangleFace.filter((f) => still[f]);
  const height = positions.map((p) => (facing * p[2]) / LAYER_GAP);
  const before = [...height];
  settleLayers(positions, height, fixed, triangles, triangleFace, layers);
  height.forEach((h, v) => {
    if (h !== before[v]) positions[v][2] = facing * LAYER_GAP * h;
  });
}

/**
 * Makes the faces' slopes gentle and keeps every layer on its own side of
 * the layers it overlaps: `height` (per vertex, in layers) is changed in
 * place, at the vertices not `held`. `rank` orders the faces: a higher rank
 * lies above wherever two overlap.
 *
 * First, a vertex next to a held one more than STEEPEST away comes that much
 * nearer to it. Then, two faces' surfaces being flat over each triangle, one
 * lies above the other everywhere exactly when it does at each vertex of
 * either that lies over the other, and wherever an edge of one crosses an
 * edge of the other. Where it does not, the upper face rises there by what
 * is missing (its vertices there that are not held); or, where it is held,
 * the lower face sinks.
 */
function settleLayers(
  xy: ArrayLike<number>[],
  height: number[],
  held: boolean[],
  triangles: [number, number, number][],
  triangleFace: number[],
  rank: number[],
): void {
  // Gentle slopes: toward the held neighbour that is furthest out of reach.
  const pulls = new Map<number, number>();
  for (const triangle of triangles) {
    for (const u of triangle) {
      if (held[u]) continue;
      for (const v of triangle) {
        if (!held[v]) continue;
        const drop = height[v] - height[u];
        const over = Math.sign(drop) * Math.max(0, Math.abs(drop) - STEEPEST);
        if (Math.abs(over) > Math.abs(pulls.get(u) ?? 0)) pulls.set(u, over);
      }
    }
  }
  for (const [u, over] of pulls) height[u] += over;

  const faces = rank.map((_, f) => {
    const own = triangles.filter((_, t) => triangleFace[t] === f);
    const edges = new Map<string, [number, number]>();
    for (const [a, b, c] of own) {
      for (const [u, v] of [[a, b], [b, c], [c, a]]) edges.set(u < v ? `${u} ${v}` : `${v} ${u}`, [u, v]);
    }
    return { triangles: own, edges: [...edges.values()], vertices: [...new Set(own.flat())] };
  });
  /** A point of a face's surface: the vertices it hangs from and their shares. */
  type Hold = [vertex: number, share: number][];
  const at = (hold: Hold) => hold.reduce((sum, [v, share]) => sum + share * height[v], 0);
  const EDGE = 1e-9;
  /** Where vertex `u` lies in a triangle, if it does. */
  const within = (u: number, [a, b, c]: [number, number, number]): Hold | undefined => {
    const [p, A, B, C] = [xy[u], xy[a], xy[b], xy[c]];
    const area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    if (Math.abs(area) < 1e-14) return undefined;
    const wb = ((p[0] - A[0]) * (C[1] - A[1]) - (p[1] - A[1]) * (C[0] - A[0])) / area;
    const wc = ((B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0])) / area;
    const wa = 1 - wb - wc;
    if (wa < -EDGE || wb < -EDGE || wc < -EDGE) return undefined;
    return [[a, wa], [b, wb], [c, wc]];
  };
  /** Where two edges cross, if they do, short of their ends: as a point of each. */
  const crossing = ([a, b]: [number, number], [c, d]: [number, number]): [Hold, Hold] | undefined => {
    const [A, B, C, D] = [xy[a], xy[b], xy[c], xy[d]];
    const r = [B[0] - A[0], B[1] - A[1]];
    const s = [D[0] - C[0], D[1] - C[1]];
    const denominator = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(denominator) < 1e-14) return undefined;
    const t = ((C[0] - A[0]) * s[1] - (C[1] - A[1]) * s[0]) / denominator;
    const u = ((C[0] - A[0]) * r[1] - (C[1] - A[1]) * r[0]) / denominator;
    if (t <= EDGE || t >= 1 - EDGE || u <= EDGE || u >= 1 - EDGE) return undefined;
    return [[[a, 1 - t], [b, t]], [[c, 1 - u], [d, u]]];
  };
  /** Move the free vertices of `hold` so that its point moves by `by`; false when none is free. */
  const give = (hold: Hold, by: number): boolean => {
    const free = hold.filter(([v, share]) => !held[v] && share > 1e-6);
    const share = free.reduce((sum, [, s]) => sum + s, 0);
    if (share < 1e-6) return false;
    for (const [v] of free) height[v] += by / share;
    return true;
  };

  const TOUCHING = 1e-9;
  /** How free a point of a face is to move: the share of it hanging from vertices that are not held. */
  const freedom = (hold: Hold) => hold.reduce((sum, [v, share]) => sum + (held[v] ? 0 : share), 0);
  /** Every point at which a lower face and a higher one must be in order: the same point as a hold of each. */
  const meetings = (f: number, g: number): [lower: Hold, upper: Hold][] => {
    const [low, high] = [faces[f], faces[g]];
    const out: [Hold, Hold][] = [];
    for (const u of low.vertices) for (const t of high.triangles) {
      const over = within(u, t);
      if (over) out.push([[[u, 1]], over]);
    }
    for (const u of high.vertices) for (const t of low.triangles) {
      const under = within(u, t);
      if (under) out.push([under, [[u, 1]]]);
    }
    for (const e of low.edges) for (const d of high.edges) {
      const cross = crossing(e, d);
      if (cross) out.push(cross);
    }
    return out;
  };
  const byRank = rank.map((_, f) => f).sort((a, b) => rank[a] - rank[b]);
  // From the bottom up, each face rises clear of every face beneath it: those are done with, and rising cannot undo it.
  for (const g of byRank) {
    for (const f of byRank) {
      if (rank[f] >= rank[g]) continue;
      for (const [lower, upper] of meetings(f, g)) {
        const missing = at(lower) - at(upper) + CLEARANCE * freedom(upper);
        if (missing > TOUCHING) give(upper, missing);
      }
    }
  }
  // Where a face could not rise (held there), from the top down the face beneath sinks clear of it instead.
  for (const f of [...byRank].reverse()) {
    for (const g of byRank) {
      if (rank[f] >= rank[g]) continue;
      for (const [lower, upper] of meetings(f, g)) {
        const missing = at(lower) - at(upper) + CLEARANCE * freedom(lower) * (1 - freedom(upper));
        if (missing > TOUCHING) give(lower, -missing);
      }
    }
  }
}

interface FoldedLine {
  origin: Point;
  /** Unit vector along the line. */
  along: Point;
  /** Unit normal of the line. */
  normal: Point;
  /** Signed distance from the line, along the normal. */
  distance: (p: V3 | Point) => number;
}

/** A line he sees, in the Paper's folded frame. */
function lineInFoldedFrame(line: Line, paper: Paper): FoldedLine {
  const toFolded = invert(paper.view);
  const origin = apply(toFolded, line.origin);
  const vector = applyLinear(toFolded, line.vector);
  const len = Math.hypot(vector[0], vector[1]);
  const along: Point = [vector[0] / len, vector[1] / len];
  const normal: Point = [-along[1], along[0]];
  return { origin, along, normal, distance: (p) => (p[0] - origin[0]) * normal[0] + (p[1] - origin[1]) * normal[1] };
}

/**
 * The rigid path of a lifted flap pressed flat (a squash), given to its
 * driven creases as the angle each is at when the flap's hinge has come
 * down to elevation φ = 90°·(1 - p). With β the angle at the hinge between
 * the line (toward the hinge) and the spine, the spine stays in the plane of
 * the line only if the new creases (at β/2) have folded to μ with
 * tan(μ/2) = cos(β/2)·cot φ; the spine's own angle σ follows from the tip's
 * normal. Driving every crease along this path (rather than straight from
 * start to end, which no rigid paper can follow) keeps the faces flat and
 * the two layers moving as mirror images. The layered rest angles measured
 * at either end are a few layer gaps off these ideals, so each crease starts
 * from its measured angle, moves by the ideal amount, and takes on its
 * measured end over the last stretch, when the flap is nearly flat.
 */
function rigidPath(
  hinges: Hinge[],
  graph: FoldGraph,
  startAngles: number[],
  lying: V3[],
  line: FoldedLine,
  onLine: (e: number) => boolean,
): void {
  const driven = hinges.filter((h) => h.driven && h.paperEdge !== undefined);
  const spines = driven.filter((h) => !onLine(h.paperEdge!) && Math.abs(startAngles[h.paperEdge!]) === 180);
  const hingeEnds = driven.filter((h) => onLine(h.paperEdge!)).flatMap((h) => graph.edges_vertices[h.paperEdge!]);
  if (spines.length === 0 || hingeEnds.length === 0) return;

  // β: from the spine's root on the line, the angle between the way to the hinge and the spine.
  const spineEnds = [...new Set(spines.flatMap((h) => graph.edges_vertices[h.paperEdge!]))];
  const root = spineEnds.reduce((a, b) => (Math.abs(line.distance(lying[a])) < Math.abs(line.distance(lying[b])) ? a : b));
  const tip = spineEnds.reduce((a, b) => (Math.abs(line.distance(lying[a])) > Math.abs(line.distance(lying[b])) ? a : b));
  const towardHinge = (v: number) => (lying[v][0] - lying[root][0]) * line.along[0] + (lying[v][1] - lying[root][1]) * line.along[1];
  const sign = Math.sign(hingeEnds.reduce((sum, v) => sum + towardHinge(v), 0)) || 1;
  const spine: Point = [lying[tip][0] - lying[root][0], lying[tip][1] - lying[root][1]];
  const spineLength = Math.hypot(spine[0], spine[1]);
  const cosBeta = (sign * (spine[0] * line.along[0] + spine[1] * line.along[1])) / spineLength;
  const halfCos = Math.cos(Math.acos(Math.max(-1, Math.min(1, cosBeta))) / 2);

  const phi = (p: number) => (Math.PI / 2) * (1 - p);
  const mu = (f: number) => 2 * Math.atan2(halfCos * Math.cos(f), Math.sin(f));
  const sigma = (f: number) => {
    const m = mu(f);
    const normalY = -Math.sin(f) * Math.cos(m) - Math.sin(m) * halfCos * Math.cos(f);
    return Math.PI - 2 * Math.acos(Math.min(1, Math.abs(normalY)));
  };
  /** How far along its ideal change a crease of each kind is at p. */
  const fraction = (h: Hinge): ((p: number) => number) => {
    if (onLine(h.paperEdge!)) return (p) => p;
    if (spines.includes(h)) return (p) => 1 - sigma(phi(p)) / Math.PI;
    return (p) => mu(phi(p)) / Math.PI;
  };
  /** The measured rest angles come in over the last stretch, smoothly. */
  const settle = (p: number) => {
    const from = rigidTuning.settleFrom;
    const w = from >= 1 ? (p >= 1 ? 1 : 0) : Math.max(0, Math.min(1, (p - from) / (1 - from)));
    return w * w * (3 - 2 * w);
  };
  const quarter = Math.PI / 2;
  for (const h of driven) {
    const ideal = Math.round(h.end / quarter) * quarter - Math.round(h.start / quarter) * quarter;
    const along = fraction(h);
    const { start, end } = h;
    h.path = (p) => start + ideal * along(p) + (end - start - ideal) * settle(p);
  }
  // The faces of a rigid Fold stay flat: a facet's measured rest angles are the layered
  // layouts' tilts at shared vertices (one-sided where a layer lies on the paper beneath),
  // which must not be driven through the motion, only taken on as the paper settles.
  for (const h of hinges) {
    if (h.kind !== "facet") continue;
    const { end } = h;
    h.path = (p) => end * settle(p);
  }
}

/**
 * The flat layered layout with the lifted flap turned up 90° about its line,
 * toward him, so it stands on the line: a vertex of the flap keeps its
 * distance from the line as its height above the hinge, and the flap's
 * layers sit either side of the line's plane, LAYER_GAP apart, the layer
 * that was nearest him now facing away from the flap's side. Vertices on
 * the line (the hinge) stay. Also given `flat`: the same with the layers'
 * gap left out, every layer in the line's plane.
 */
function standing(
  flat: V3[],
  lift: Lift,
  line: FoldedLine,
  facesOf: number[][],
  faceBefore: number[],
  layersBefore: number[],
  facing: number,
): { positions: V3[]; flat: V3[] } {
  const ofFlap = (v: number) => facesOf[v].some((f) => lift.faces.includes(faceBefore[f]));
  const lifted = flat.map((_, v) => facesOf[v].length > 0 && facesOf[v].every((f) => lift.faces.includes(faceBefore[f])));
  // The normal pointing to the flap's side.
  const side = flat.reduce((sum, p, v) => sum + (lifted[v] ? line.distance(p) : 0), 0);
  const normal: Point = side < 0 ? [-line.normal[0], -line.normal[1]] : line.normal;
  const distance = (p: V3) => Math.abs(line.distance(p));
  const layerOf = (v: number) => facesOf[v].reduce((sum, f) => sum + layersBefore[faceBefore[f]], 0) / facesOf[v].length;
  const middle = lift.faces.reduce((sum, f) => sum + layersBefore[f], 0) / lift.faces.length;
  // The flap stands from where its hinge lies: the height of the flap's vertices that stay.
  const hinge = flat.flatMap((_, v) => (ofFlap(v) && !lifted[v] ? [v] : []));
  const foot = hinge.reduce((sum, v) => sum + flat[v][2], 0) / (hinge.length || 1);
  const stand = (gap: number) =>
    flat.map((p, v): V3 => {
      if (!lifted[v]) return p;
      const d = distance(p);
      const across = -gap * (layerOf(v) - middle);
      return [p[0] - normal[0] * d + normal[0] * across, p[1] - normal[1] * d + normal[1] * across, foot + facing * d];
    });
  return { positions: stand(LAYER_GAP), flat: stand(0) };
}
