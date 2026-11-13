// The fold engine core (ADR 0001, ADR 0004): Paper state as FOLD, and the Folds
// that change it. Pure: every operation returns a new state or a refusal and
// never changes the state it was given.
//
// Rabbit Ear lays out the folded form; the flap logic is ours, because Rabbit
// Ear's own folds crease every layer the line crosses, while folding one flap
// must crease only that flap.

import { makeVerticesCoordsFlatFolded } from "rabbit-ear/graph/vertices/folded.js";
import {
  affineFromPoints,
  apply,
  applyLinear,
  clipToSide,
  compose,
  contains,
  crossingParameter,
  determinant,
  IDENTITY,
  invert,
  lerp,
  mirrorAbout,
  overlapArea,
  rotationAbout,
  side,
  signedArea,
  type Affine,
  type Line,
  type Point,
} from "./geometry";

export type { Point, Line } from "./geometry";

/** FOLD edge assignment: Boundary, Valley, Mountain, or Flat (a crease lying open). */
export type Assignment = "B" | "V" | "M" | "F";

/** The crease pattern, as a FOLD object. Coordinates are on the unfolded Paper. */
export interface FoldGraph {
  vertices_coords: Point[];
  edges_vertices: [number, number][];
  edges_assignment: Assignment[];
  edges_foldAngle: number[];
  faces_vertices: number[][];
  /** FOLD faceOrders [f, g, s]: s = 1 when f lies on the side g's front faces, -1 behind. Kept for every overlapping pair. */
  faceOrders: [number, number, 1 | -1][];
}

export interface Paper {
  readonly graph: FoldGraph;
  /** The face Rabbit Ear's flat folding is rooted at: it sits at its crease-pattern coordinates. */
  readonly rootFace: number;
  /** Maps those folded coordinates to what he sees (x right, y up). Turn over and rotate change only this. */
  readonly view: Affine;
}

/** One face as he sees it. */
export interface SeenFace {
  polygon: Point[];
  /** True when the Paper's front side faces him. */
  front: boolean;
  /** Stacking position: 0 is furthest from him; a higher layer lies on top of any lower one it overlaps. */
  layer: number;
}

/** One Fold, described as he sees the Paper. */
export interface FoldSpec {
  /** The fold line, in the coordinates he sees (x right, y up). */
  line: Line;
  /** A point on the flap to fold; the flap is on this side of the line. */
  flap: Point;
  /** Valley brings the flap toward him and lands it on top; mountain takes it behind. */
  assignment: "V" | "M";
  /**
   * How many layers under `flap` to take, counted from the side the flap moves
   * toward (from the top for a valley, from the bottom for a mountain). Default 1.
   * Layers joined to them on the flap's side of the line always come too.
   */
  layers?: number | "all";
}

/**
 * Why a Fold can't be made:
 * - `no-flap`: there is no paper at `flap` (or it lies on the line).
 * - `misses-flap`: the line doesn't cross the flap, so nothing would hinge.
 * - `blocked`: paper that isn't moving lies in the flap's path.
 */
export type Refusal = "no-flap" | "misses-flap" | "blocked";

export type FoldResult = { ok: true; paper: Paper } | { ok: false; refusal: Refusal };

const AREA_EPSILON = 1e-10;

export function newPaper({ width = 1, height = 1 }: { width?: number; height?: number } = {}): Paper {
  return {
    graph: {
      vertices_coords: [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ],
      edges_vertices: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ],
      edges_assignment: ["B", "B", "B", "B"],
      edges_foldAngle: [0, 0, 0, 0],
      faces_vertices: [[0, 1, 2, 3]],
      faceOrders: [],
    },
    rootFace: 0,
    view: IDENTITY,
  };
}

/** Valley or mountain Fold of one flap along an exact line. */
export function fold(paper: Paper, spec: FoldSpec): FoldResult {
  return makeFold(paper, spec, true);
}

/** Crease the flap along the line and open it again: a flat crease, nothing moves. */
export function foldAndUnfold(paper: Paper, spec: FoldSpec): FoldResult {
  return makeFold(paper, spec, false);
}

function makeFold(paper: Paper, spec: FoldSpec, moves: boolean): FoldResult {
  const { graph } = paper;
  const folded = foldedCoords(paper);
  const polygons = graph.faces_vertices.map((vertices) => vertices.map((v) => folded[v]));
  const winding = polygons.map((polygon) => Math.sign(signedArea(polygon)));
  const height = heightOrder(graph, winding);

  // Work in the folded frame, where +z is the root face's front.
  const toFolded = invert(paper.view);
  const line: Line = { origin: apply(toFolded, spec.line.origin), vector: applyLinear(toFolded, spec.line.vector) };
  const flapPoint = apply(toFolded, spec.flap);
  const toward = (spec.assignment === "V" ? 1 : -1) * Math.sign(determinant(paper.view));
  const flapSide = side(line, flapPoint);
  if (flapSide === 0) return { ok: false, refusal: "no-flap" };

  // 1 on the flap's side, -1 across the line, 0 on it.
  const vertexSide = folded.map((p) => side(line, p) * flapSide);
  const pieces = polygons.map((polygon) => clipToSide(polygon, line, flapSide));
  const hasPiece = pieces.map((piece) => piece.length > 2 && Math.abs(signedArea(piece)) > AREA_EPSILON);

  // Faces joined on the flap's side of the line move together.
  const edges = edgeLookup(graph);
  const group = graph.faces_vertices.map((_, f) => f);
  const find = (f: number): number => (group[f] === f ? f : (group[f] = find(group[f])));
  edges.faces.forEach((faces, e) => {
    const [u, v] = graph.edges_vertices[e];
    if (faces.length === 2 && faces.every((f) => hasPiece[f]) && Math.max(vertexSide[u], vertexSide[v]) > 0) {
      group[find(faces[0])] = find(faces[1]);
    }
  });

  // The layers under his finger, nearest the side the flap moves toward first.
  const under = graph.faces_vertices
    .map((_, f) => f)
    .filter((f) => hasPiece[f] && contains(pieces[f], flapPoint))
    .sort((a, b) => -toward * (height(a, b) ?? 0));
  if (under.length === 0) return { ok: false, refusal: "no-flap" };
  const count = spec.layers === "all" ? under.length : Math.min(Math.max(spec.layers ?? 1, 1), under.length);
  const flapGroups = new Set(under.slice(0, count).map(find));
  const inFlap = graph.faces_vertices.map((_, f) => hasPiece[f] && flapGroups.has(find(f)));

  // Paper that stays, on the flap's side and further toward where the flap moves, is in the way.
  for (let m = 0; m < inFlap.length; m++) {
    if (!inFlap[m]) continue;
    for (let s = 0; s < inFlap.length; s++) {
      if (inFlap[s] || !hasPiece[s]) continue;
      if ((height(s, m) ?? 0) * toward > 0 && overlapArea(pieces[s], pieces[m]) > AREA_EPSILON) {
        return { ok: false, refusal: "blocked" };
      }
    }
  }

  const crossed = (f: number) => graph.faces_vertices[f].some((v) => vertexSide[v] < 0);
  const splitFaces = inFlap.flatMap((flap, f) => (flap && crossed(f) ? [f] : []));
  const hingeEdges = edges.faces.flatMap((faces, e) => {
    const [u, v] = graph.edges_vertices[e];
    const isHinge =
      vertexSide[u] === 0 && vertexSide[v] === 0 && faces.length === 2 && inFlap[faces[0]] !== inFlap[faces[1]];
    return isHinge ? [e] : [];
  });
  if (splitFaces.length === 0 && hingeEdges.length === 0) return { ok: false, refusal: "misses-flap" };

  // A face turning toward its front side makes a valley crease, away a mountain.
  const turn = (f: number) => (moves ? (winding[f] === toward ? 180 : -180) : 0);
  const next: FoldGraph = structuredClone(graph);
  if (moves) {
    for (const e of hingeEdges) {
      const angle = next.edges_foldAngle[e] + turn(edges.faces[e].find((f) => inFlap[f])!);
      if (Math.abs(angle) > 180) return { ok: false, refusal: "blocked" };
      next.edges_foldAngle[e] = angle;
      next.edges_assignment[e] = assignmentOf(angle);
    }
  }

  // Cut each crossed edge of the flap's faces once, then split those faces in two.
  const newSide = [...vertexSide];
  const cuts = new Map<number, number>();
  for (const f of splitFaces) {
    const loop = graph.faces_vertices[f];
    loop.forEach((u, i) => {
      const v = loop[(i + 1) % loop.length];
      if (vertexSide[u] * vertexSide[v] >= 0) return;
      const e = edges.index(u, v);
      if (cuts.has(e)) return;
      const [a, b] = graph.edges_vertices[e];
      const t = crossingParameter(line, folded[a], folded[b]);
      const x = next.vertices_coords.push(lerp(graph.vertices_coords[a], graph.vertices_coords[b], t)) - 1;
      newSide[x] = 0;
      cuts.set(e, x);
      next.edges_vertices[e] = [a, x];
      next.edges_vertices.push([x, b]);
      next.edges_assignment.push(next.edges_assignment[e]);
      next.edges_foldAngle.push(next.edges_foldAngle[e]);
      for (const g of edges.faces[e]) {
        const face = next.faces_vertices[g];
        const at = face.findIndex((w, j) => {
          const w2 = face[(j + 1) % face.length];
          return (w === a && w2 === b) || (w === b && w2 === a);
        });
        face.splice(at + 1, 0, x);
      }
    });
  }
  const origin = next.faces_vertices.map((_, f) => f);
  const nextInFlap = [...inFlap];
  for (const f of splitFaces) {
    // The loop crosses the line at exactly two vertices: [x1, flap side…, x2, other side…].
    const loop = next.faces_vertices[f];
    const start = loop.findIndex((v, i) => newSide[v] === 0 && newSide[loop[(i + 1) % loop.length]] > 0);
    const turned = [...loop.slice(start), ...loop.slice(0, start)];
    const end = turned.findIndex((v, i) => i > 0 && newSide[v] === 0);
    next.faces_vertices[f] = turned.slice(0, end + 1);
    next.faces_vertices.push([...turned.slice(end), turned[0]]);
    origin.push(f);
    nextInFlap.push(false);
    const angle = turn(f);
    next.edges_vertices.push([turned[0], turned[end]]);
    next.edges_foldAngle.push(angle);
    next.edges_assignment.push(assignmentOf(angle));
  }

  // Keep a face that didn't move as the root, so the Paper stays where he sees it.
  let { rootFace, view } = paper;
  if (moves && nextInFlap[rootFace]) {
    rootFace = nextInFlap.findIndex((flap) => !flap);
    const vertices = graph.faces_vertices[origin[rootFace]];
    const placed = affineFromPoints(
      vertices.map((v) => graph.vertices_coords[v]),
      vertices.map((v) => folded[v]),
    );
    view = compose(view, placed);
  }

  // Layer order for every pair of faces that now overlap, worked out in the old
  // folded frame after the move: the flap turned over as one piece, so its own
  // order reverses and its faces' fronts flip; it lands further toward where it
  // moved than any face that stayed.
  const moved = (f: number) => moves && nextInFlap[f];
  const windingAfter = (f: number) => (moved(f) ? -winding[origin[f]] : winding[origin[f]]);
  const aboveAfter = (i: number, j: number): number | undefined => {
    if (moved(i) !== moved(j)) return moved(i) ? toward : -toward;
    if (origin[i] === origin[j]) return undefined;
    const before = height(origin[i], origin[j]);
    return before === undefined ? undefined : moved(i) ? -before : before;
  };
  const nextFolded = makeVerticesCoordsFlatFolded(next, [rootFace]);
  const nextPolygons = next.faces_vertices.map((vertices) => vertices.map((v) => nextFolded[v]));
  next.faceOrders = [];
  for (let i = 0; i < nextPolygons.length; i++) {
    for (let j = i + 1; j < nextPolygons.length; j++) {
      if (overlapArea(nextPolygons[i], nextPolygons[j]) <= AREA_EPSILON) continue;
      const above = aboveAfter(i, j);
      if (above !== undefined) next.faceOrders.push([i, j, above * windingAfter(j) > 0 ? 1 : -1]);
    }
  }

  return { ok: true, paper: { graph: next, rootFace, view } };
}

/** Turn the Paper over in place, like a page: left and right swap. A Step, but not a Fold. */
export function turnOver(paper: Paper): Paper {
  return { ...paper, view: compose(mirrorAbout(seenCentre(paper)), paper.view) };
}

/** Rotate the Paper in place by `degrees`, counterclockwise as he sees it. */
export function rotate(paper: Paper, degrees: number): Paper {
  return { ...paper, view: compose(rotationAbout(seenCentre(paper), degrees), paper.view) };
}

/** Centre of the Paper's bounding box, as he sees it. */
function seenCentre(paper: Paper): Point {
  const points = seenFaces(paper).flatMap((face) => face.polygon);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

function assignmentOf(angle: number): Assignment {
  return angle > 0 ? "V" : angle < 0 ? "M" : "F";
}

/** Edge indices by vertex pair, and the faces on each edge. */
function edgeLookup(graph: FoldGraph) {
  const byVertices = new Map<string, number>();
  const key = (u: number, v: number) => (u < v ? `${u} ${v}` : `${v} ${u}`);
  graph.edges_vertices.forEach(([u, v], e) => byVertices.set(key(u, v), e));
  const index = (u: number, v: number) => byVertices.get(key(u, v))!;
  const faces: number[][] = graph.edges_vertices.map(() => []);
  graph.faces_vertices.forEach((loop, f) =>
    loop.forEach((u, i) => faces[index(u, loop[(i + 1) % loop.length])].push(f)),
  );
  return { index, faces };
}

/**
 * From faceOrders: 1 when face a lies above face b along the folded frame's +z,
 * -1 below, undefined when no order is recorded (they don't overlap).
 */
function heightOrder(graph: FoldGraph, winding: number[]) {
  const orders = new Map<string, number>();
  for (const [f, g, s] of graph.faceOrders) {
    const fAbove = s * winding[g] > 0 ? 1 : -1;
    orders.set(`${f} ${g}`, fAbove);
    orders.set(`${g} ${f}`, -fAbove);
  }
  return (a: number, b: number) => orders.get(`${a} ${b}`);
}

export function seenFaces(paper: Paper): SeenFace[] {
  const folded = foldedCoords(paper);
  const toward = Math.sign(determinant(paper.view));
  const polygons = paper.graph.faces_vertices.map((vertices) => vertices.map((v) => folded[v]));
  const winding = polygons.map((polygon) => Math.sign(signedArea(polygon)));
  const height = heightOrder(paper.graph, winding);

  // Layer = length of the longest chain of faces beneath, as he sees it.
  const layers: number[] = [];
  const layerOf = (f: number): number => {
    if (layers[f] !== undefined) return layers[f];
    let layer = 0;
    polygons.forEach((_, g) => {
      if ((height(g, f) ?? 0) * toward < 0) layer = Math.max(layer, layerOf(g) + 1);
    });
    return (layers[f] = layer);
  };

  return polygons.map((polygon, f) => ({
    polygon: polygon.map((p) => apply(paper.view, p)),
    front: winding[f] === toward,
    layer: layerOf(f),
  }));
}

function foldedCoords(paper: Paper): Point[] {
  return makeVerticesCoordsFlatFolded(paper.graph, [paper.rootFace]);
}
