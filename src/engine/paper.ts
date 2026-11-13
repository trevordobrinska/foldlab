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
  cross,
  crossingParameter,
  determinant,
  EPSILON,
  IDENTITY,
  invert,
  lerp,
  mirrorAbout,
  overlapArea,
  rotationAbout,
  side,
  signedArea,
  sub,
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

/** An inside reverse, described as he sees the Paper. */
export interface InsideReverseSpec {
  /** The line the tip reverses along, in the coordinates he sees. */
  line: Line;
  /** A point on the tip: the part beyond the line that goes in between its two layers. */
  tip: Point;
}

/** A squash, described as he sees the Paper. */
export interface SquashSpec {
  /**
   * The line the flap's spine is pressed down onto, in the coordinates he
   * sees: the line the flap is hinged along, which it then spreads evenly across.
   */
  line: Line;
  /** A point on the flap: the two layers under it nearest him, joined by a folded edge (the spine), open and press flat. */
  flap: Point;
}

/**
 * A flap lifted to stand up before a Fold is pressed, the way diagrams draw
 * a squash: the faces of the Paper before that stand, and the line (as he
 * sees it) they turn about, toward him.
 */
export interface Lift {
  faces: number[];
  line: Line;
}

/**
 * Why a Fold can't be made:
 * - `no-flap`: there is no paper at `flap` (or it lies on the line); for an
 *   inside reverse or a squash, no two-layer point or flap under the finger.
 * - `misses-flap`: the line doesn't cross the flap, so nothing would hinge;
 *   for a squash, the flap isn't hinged on the line.
 * - `blocked`: paper that isn't moving lies in the flap's path.
 */
export type Refusal = "no-flap" | "misses-flap" | "blocked";

export type FoldResult =
  | {
      ok: true;
      paper: Paper;
      /** For a Fold the hand lifts a flap for first (a squash): that lift, so a recording can start from it. */
      lift?: Lift;
    }
  | { ok: false; refusal: Refusal };

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

/** The Paper laid out in its folded frame, cut by a line: everything a Fold along it needs to know. */
interface Cut {
  graph: FoldGraph;
  folded: Point[];
  winding: number[];
  /** 1 when face a lies above face b along the folded frame's +z, -1 below, undefined when they don't overlap. */
  height: (a: number, b: number) => number | undefined;
  edges: ReturnType<typeof edgeLookup>;
  line: Line;
  /** The side of the line the moving part is on, as `side` reports it. */
  flapSide: 1 | -1;
  /** 1 on the moving side, -1 across the line, 0 on it. */
  vertexSide: number[];
  /** Each face's part on the moving side of the line. */
  pieces: Point[][];
  hasPiece: boolean[];
  /** The union-find root of the group of faces joined on the moving side. */
  find: (f: number) => number;
  /** The point he touched, in the folded frame. */
  touch: Point;
  /** +1 when his side of the Paper is the folded frame's +z. */
  facing: number;
}

function cut(paper: Paper, seenLine: Line, seenTouch: Point): Cut | "no-flap" {
  // Work in the folded frame, where +z is the root face's front.
  const toFolded = invert(paper.view);
  const line: Line = { origin: apply(toFolded, seenLine.origin), vector: applyLinear(toFolded, seenLine.vector) };
  return cutFolded(paper, line, apply(toFolded, seenTouch));
}

/** `cut` with the line and the touch already in the folded frame. */
function cutFolded(paper: Paper, line: Line, touch: Point): Cut | "no-flap" {
  const { graph } = paper;
  const folded = foldedCoords(paper);
  const polygons = graph.faces_vertices.map((vertices) => vertices.map((v) => folded[v]));
  const winding = polygons.map((polygon) => Math.sign(signedArea(polygon)));
  const height = heightOrder(graph, winding);
  const flapSide = side(line, touch);
  if (flapSide === 0) return "no-flap";

  const vertexSide = folded.map((p) => side(line, p) * flapSide);
  const pieces = polygons.map((polygon) => clipToSide(polygon, line, flapSide));
  const hasPiece = pieces.map((piece) => piece.length > 2 && Math.abs(signedArea(piece)) > AREA_EPSILON);

  // Faces joined on the moving side of the line move together.
  const edges = edgeLookup(graph);
  const group = graph.faces_vertices.map((_, f) => f);
  const find = (f: number): number => (group[f] === f ? f : (group[f] = find(group[f])));
  edges.faces.forEach((faces, e) => {
    const [u, v] = graph.edges_vertices[e];
    if (faces.length === 2 && faces.every((f) => hasPiece[f]) && Math.max(vertexSide[u], vertexSide[v]) > 0) {
      group[find(faces[0])] = find(faces[1]);
    }
  });

  const facing = Math.sign(determinant(paper.view));
  return { graph, folded, winding, height, edges, line, flapSide, vertexSide, pieces, hasPiece, find, touch, facing };
}

/** The faces whose moving-side piece lies under his finger, nearest `toward` first. */
function facesUnder(c: Cut, toward: number): number[] {
  return c.graph.faces_vertices
    .map((_, f) => f)
    .filter((f) => c.hasPiece[f] && contains(c.pieces[f], c.touch))
    .sort((a, b) => -toward * (c.height(a, b) ?? 0));
}

/** Is paper that stays, on the moving side and further toward where face m moves, in its way? */
function blocked(c: Cut, inFlap: boolean[], towardOf: (f: number) => number): boolean {
  for (let m = 0; m < inFlap.length; m++) {
    if (!inFlap[m]) continue;
    for (let s = 0; s < inFlap.length; s++) {
      if (inFlap[s] || !c.hasPiece[s]) continue;
      if ((c.height(s, m) ?? 0) * towardOf(m) > 0 && overlapArea(c.pieces[s], c.pieces[m]) > AREA_EPSILON) {
        return true;
      }
    }
  }
  return false;
}

function makeFold(paper: Paper, spec: FoldSpec, moves: boolean): FoldResult {
  const c = cut(paper, spec.line, spec.flap);
  if (c === "no-flap") return { ok: false, refusal: "no-flap" };
  const toward = (spec.assignment === "V" ? 1 : -1) * c.facing;

  // The layers under his finger, nearest the side the flap moves toward first.
  const under = facesUnder(c, toward);
  if (under.length === 0) return { ok: false, refusal: "no-flap" };
  const count = spec.layers === "all" ? under.length : Math.min(Math.max(spec.layers ?? 1, 1), under.length);
  const flapGroups = new Set(under.slice(0, count).map(c.find));
  const inFlap = c.graph.faces_vertices.map((_, f) => c.hasPiece[f] && flapGroups.has(c.find(f)));
  if (blocked(c, inFlap, () => toward)) return { ok: false, refusal: "blocked" };

  // The flap turns over as one piece: its own order reverses and it lands beyond every face that stayed.
  return perform(paper, c, inFlap, () => toward, moves, {
    bothMoved: (before) => -before,
    oneMoved: () => toward,
    invertInside: false,
  });
}

/**
 * Inside reverse: the tip of a two-layer point (beyond the line, under his
 * finger) goes in between the point's own layers. Each layer's tip turns
 * toward the other layer, and the creases inside the tip turn inside out.
 */
export function insideReverse(paper: Paper, spec: InsideReverseSpec): FoldResult {
  const c = cut(paper, spec.line, spec.tip);
  if (c === "no-flap") return { ok: false, refusal: "no-flap" };

  // The point: the two layers nearest him under his finger, joined by a folded edge on the tip's side.
  const pair = twoLayers(c);
  if (!pair) return { ok: false, refusal: "no-flap" };
  const [a, b] = pair;

  // Each layer's tip and whatever is joined to it on that side, apart from the other layer.
  const sideOf = (f: number) => (c.find(f) !== c.find(a) ? 0 : c.height(f, b) === c.height(a, b) ? 1 : -1);
  const inFlap = c.graph.faces_vertices.map((_, f) => c.hasPiece[f] && sideOf(f) !== 0);
  const towardOf = (f: number) => (c.height(a, b) ?? 0) * -sideOf(f);
  if (blocked(c, inFlap, towardOf)) return { ok: false, refusal: "blocked" };

  // Each layer's tip stays on its own side of the point, mirrored within it.
  return perform(paper, c, inFlap, towardOf, true, {
    bothMoved: (before, i, j) => (sideOf(i) === sideOf(j) ? -before : before),
    oneMoved: (moved, stayed) => c.height(moved, stayed) ?? c.height(sideOf(moved) === 1 ? b : a, stayed),
    invertInside: true,
  });
}

/** The folded edges (a spine) joining faces a and b, with an end on the moving side of the line. */
function spineBetween(c: Cut, a: number, b: number): number[] {
  return c.edges.faces.flatMap((faces, e) => {
    const [u, v] = c.graph.edges_vertices[e];
    const shared = faces.length === 2 && faces.includes(a) && faces.includes(b);
    const folded = Math.abs(c.graph.edges_foldAngle[e]) === 180 && Math.max(c.vertexSide[u], c.vertexSide[v]) > 0;
    return shared && folded ? [e] : [];
  });
}

/** The two layers nearest him under his finger that a spine joins: [nearer, further], or undefined. */
function twoLayers(c: Cut): [number, number] | undefined {
  const under = facesUnder(c, c.facing);
  const top = under.findIndex((a, i) => i + 1 < under.length && spineBetween(c, a, under[i + 1]).length > 0);
  return top < 0 ? undefined : [under[top], under[top + 1]];
}

/**
 * Squash: a two-layer flap hinged along the line, under his finger, is
 * lifted to stand, opened at its spine and pressed flat so the spine lies
 * along the line (toward the hinge) and the two layers spread evenly on
 * either side of it. Each layer creases along the bisector of its spine
 * and the line; the outer layer turns over its hinge onto the far side,
 * the inner one keeps its hinge and folds onto itself.
 */
export function squash(paper: Paper, spec: SquashSpec): FoldResult {
  const c = cut(paper, spec.line, spec.flap);
  if (c === "no-flap") return { ok: false, refusal: "no-flap" };
  const pair = twoLayers(c);
  if (!pair) return { ok: false, refusal: "no-flap" };
  const [a, b] = pair;
  const { graph, folded, line, vertexSide } = c;
  /** The side a faces, away from b: where the opened flap's parts land. */
  const toward = c.height(a, b) ?? c.facing;

  // The spine's ends: the one on the line is where the creases start, the far one is the tip.
  const spine = spineBetween(c, a, b);
  const ends = [...new Set(spine.flatMap((e) => graph.edges_vertices[e]))];
  const unit = (v: Point): Point => {
    const len = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / len, v[1] / len];
  };
  const along = unit(line.vector);
  const away = (v: number) => Math.abs(cross(along, sub(folded[v], line.origin)));
  const root = ends.find((v) => vertexSide[v] === 0);
  if (root === undefined) return { ok: false, refusal: "misses-flap" };
  const tip = ends.reduce((far, v) => (away(v) > away(far) ? v : far));

  // The hinge: the flap's edges lying on the line, shared with paper that stays. The spine lands toward it.
  const isFlap = (f: number) => f === a || f === b;
  const hinges = c.edges.faces.flatMap((faces, e) => {
    const [u, v] = graph.edges_vertices[e];
    const onLine = vertexSide[u] === 0 && vertexSide[v] === 0;
    return onLine && faces.length === 2 && faces.some(isFlap) && !faces.every(isFlap) ? [e] : [];
  });
  const reach = hinges
    .flatMap((e) => graph.edges_vertices[e])
    .reduce((sum, v) => sum + along[0] * (folded[v][0] - folded[root][0]) + along[1] * (folded[v][1] - folded[root][1]), 0);
  if (hinges.length === 0 || Math.abs(reach) < EPSILON) return { ok: false, refusal: "misses-flap" };
  const landing: Point = [along[0] * Math.sign(reach), along[1] * Math.sign(reach)];
  const up = unit(sub(folded[tip], folded[root]));
  const bisector: Point = [up[0] + landing[0], up[1] + landing[1]];
  if (Math.hypot(...bisector) < EPSILON) return { ok: false, refusal: "misses-flap" };

  // Lifting the flap: nothing may lie on it.
  if (blocked(c, graph.faces_vertices.map((_, f) => f === a), () => toward)) return { ok: false, refusal: "blocked" };

  // Pressing: each layer's part beyond the bisector folds over; nothing else may be joined to it there.
  const m = cutFolded(paper, { origin: folded[root], vector: bisector }, folded[tip]);
  if (m === "no-flap") return { ok: false, refusal: "misses-flap" };
  const inFlap = graph.faces_vertices.map((_, f) => isFlap(f) && m.hasPiece[f]);
  if (!inFlap[a] || !inFlap[b]) return { ok: false, refusal: "misses-flap" };
  if (graph.faces_vertices.some((_, f) => !isFlap(f) && m.hasPiece[f] && m.find(f) === m.find(a))) {
    return { ok: false, refusal: "blocked" };
  }
  if (blocked(m, inFlap, () => toward)) return { ok: false, refusal: "blocked" };

  // The outer layer's tip folds onto the layer once it has turned over, so its crease sign is read from the turned layer.
  const result = perform(paper, m, inFlap, (f) => (f === a ? -toward : toward), true, {
    invertInside: false,
    opens: spine,
    turnsOver: { faces: [a], edges: hinges.filter((e) => c.edges.faces[e].includes(a)), toward },
    above: (i, j, origin, moved) => {
      type Part = "stays" | "aBase" | "aTip" | "bBase" | "bTip";
      const part = (f: number): Part =>
        origin[f] === a ? (moved[f] ? "aTip" : "aBase") : origin[f] === b ? (moved[f] ? "bTip" : "bBase") : "stays";
      const [pi, pj] = [part(i), part(j)];
      const ofA = (p: Part) => p === "aBase" || p === "aTip";
      const ofB = (p: Part) => p === "bBase" || p === "bTip";
      // The two layers lie on either side of the line and never overlap.
      if ((ofA(pi) && ofB(pj)) || (ofB(pi) && ofA(pj))) return undefined;
      if (pi === "stays" && pj === "stays") return c.height(origin[i], origin[j]);
      // The outer layer lands on the far side on top of whatever lies there, its tip on top of its base.
      if (ofA(pi) || ofA(pj)) {
        if (pi === pj) return undefined;
        const rank = (p: Part) => (p === "stays" ? -1 : p === "aBase" ? 0 : 1);
        return toward * Math.sign(rank(pi) - rank(pj));
      }
      // The inner layer's base stays put; its tip folds onto it, toward where the outer layer was.
      if (pi === pj) return undefined;
      if (pi === "stays") return c.height(origin[i], b);
      if (pj === "stays") return c.height(b, origin[j]);
      return pi === "bTip" ? toward : -toward;
    },
  });
  return result.ok ? { ...result, lift: { faces: [a, b], line: spec.line } } : result;
}

interface Landing {
  /** Order after the Fold of two moved faces from different faces before, given their order before. */
  bothMoved?: (before: number, i: number, j: number) => number;
  /** Order after of a moved face above (1) or below (-1) a face that stayed, from their faces before. */
  oneMoved?: (moved: number, stayed: number) => number | undefined;
  /**
   * Instead of the two rules above: the order of any two faces after the Fold
   * (1 when i lies above j along the folded frame's +z), given each face's
   * face before and whether it is a moved piece; undefined leaves the pair unordered.
   */
  above?: (i: number, j: number, origin: number[], moved: boolean[]) => number | undefined;
  /** Turn the creases inside the moving part inside out (an inside reverse). */
  invertInside: boolean;
  /** Creases (edges before the Fold) this Fold lays open: their angle becomes 0 (a squash opens its spine). */
  opens?: number[];
  /**
   * Faces before the Fold whose part off the moving side turns over too, about
   * the creases in `turnsOver.edges` (a squash turns its outer layer over its
   * hinge), each toward `toward`: those creases turn by 180° and no such part
   * becomes the root.
   */
  turnsOver?: { faces: number[]; edges: number[]; toward: number };
}

/** Crease and move the faces in `inFlap` along the line, each toward `towardOf(f)` (+1 is the folded frame's +z). */
function perform(
  paper: Paper,
  c: Cut,
  inFlap: boolean[],
  towardOf: (f: number) => number,
  moves: boolean,
  landing: Landing,
): FoldResult {
  const { graph, folded, winding, height, edges, line, vertexSide } = c;
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
  const turn = (f: number) => (moves ? (winding[f] === towardOf(f) ? 180 : -180) : 0);
  const next: FoldGraph = structuredClone(graph);
  const setAngle = (e: number, angle: number): boolean => {
    if (Math.abs(angle) > 180) return false;
    next.edges_foldAngle[e] = angle;
    next.edges_assignment[e] = assignmentOf(angle);
    return true;
  };
  if (moves) {
    for (const e of hingeEdges) {
      if (!setAngle(e, next.edges_foldAngle[e] + turn(edges.faces[e].find((f) => inFlap[f])!))) {
        return { ok: false, refusal: "blocked" };
      }
    }
    for (const e of landing.opens ?? []) setAngle(e, 0);
    // A part turning over about its own hinge is a plain Fold of that part: valley toward its front.
    for (const e of landing.turnsOver?.edges ?? []) {
      const f = edges.faces[e].find((g) => landing.turnsOver!.faces.includes(g))!;
      const over = winding[f] === landing.turnsOver!.toward ? 180 : -180;
      if (!setAngle(e, next.edges_foldAngle[e] + over)) return { ok: false, refusal: "blocked" };
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

  // An inside reverse turns the moving part inside out: every crease within it
  // (both ends on the moving side or the line, both faces moving) reverses.
  if (landing.invertInside) {
    const nextEdges = edgeLookup(next);
    next.edges_vertices.forEach(([u, v], e) => {
      const faces = nextEdges.faces[e];
      const inside = faces.length === 2 && faces.every((f) => nextInFlap[f]);
      if (inside && newSide[u] >= 0 && newSide[v] >= 0 && Math.max(newSide[u], newSide[v]) > 0) {
        next.edges_foldAngle[e] = -next.edges_foldAngle[e];
        next.edges_assignment[e] = assignmentOf(next.edges_foldAngle[e]);
      }
    });
  }

  // Keep a face that didn't move as the root, so the Paper stays where he sees it.
  let { rootFace, view } = paper;
  const stays = (f: number) => !nextInFlap[f] && !landing.turnsOver?.faces.includes(origin[f]);
  /** +1 when the new root's layout has the old folded frame's orientation, -1 when it is mirrored. */
  let frame = 1;
  if (moves && !stays(rootFace)) {
    rootFace = next.faces_vertices.findIndex((_, f) => stays(f));
    const vertices = graph.faces_vertices[origin[rootFace]];
    const placed = affineFromPoints(
      vertices.map((v) => graph.vertices_coords[v]),
      vertices.map((v) => folded[v]),
    );
    view = compose(view, placed);
    frame = Math.sign(determinant(placed));
  }

  // Layer order for every pair of faces that now overlap, worked out in the old
  // folded frame after the move: a moved face's front flips, and where it lands
  // against the others is the Fold's own rule (`landing`). A moved piece lies
  // toward where it moved from the rest of its own face.
  const moved = (f: number) => moves && nextInFlap[f];
  const aboveByRules = (i: number, j: number): number | undefined => {
    if (moved(i) !== moved(j)) {
      const [m, s] = moved(i) ? [i, j] : [j, i];
      const above = origin[m] === origin[s] ? towardOf(origin[m]) : landing.oneMoved!(origin[m], origin[s]);
      return above === undefined ? undefined : moved(i) ? above : -above;
    }
    if (origin[i] === origin[j]) return undefined;
    const before = height(origin[i], origin[j]);
    return before === undefined ? undefined : moved(i) ? landing.bothMoved!(before, origin[i], origin[j]) : before;
  };
  const aboveAfter = (i: number, j: number) =>
    landing.above ? landing.above(i, j, origin, nextInFlap.map((_, f) => moved(f))) : aboveByRules(i, j);
  const nextFolded = makeVerticesCoordsFlatFolded(next, [rootFace]);
  const nextPolygons = next.faces_vertices.map((vertices) => vertices.map((v) => nextFolded[v]));
  // Each face's winding after, read in the old folded frame like `aboveAfter`.
  const windingAfter = (f: number) => frame * Math.sign(signedArea(nextPolygons[f]));
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
