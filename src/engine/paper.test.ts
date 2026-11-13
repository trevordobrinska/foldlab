import { makeVerticesEdges } from "rabbit-ear/graph/make/verticesEdges.js";
import { makeVerticesVertices } from "rabbit-ear/graph/make/verticesVertices.js";
import { makeVerticesCoordsFlatFolded } from "rabbit-ear/graph/vertices/folded.js";
import { solveFaceOrders } from "rabbit-ear/layer/solve.js";
import { verticesFlatFoldabilityKawasaki, verticesFlatFoldabilityMaekawa } from "rabbit-ear/singleVertex/flatFoldable.js";
import { describe, expect, it } from "vitest";
import { contains } from "./geometry";
import {
  closedSink,
  fold,
  foldAndUnfold,
  insideReverse,
  newPaper,
  rotate,
  seenFaces,
  squash,
  turnOver,
  type FoldResult,
  type Paper,
  type SeenFace,
} from "./paper";

type Point = [number, number];

/** Polygon vertices rounded and sorted, so tests compare shapes, not vertex order. */
function shape(polygon: Point[]): Point[] {
  const r = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
  return polygon.map(([x, y]) => [r(x), r(y)] as Point).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** The vertical line x = c, as he sees it. */
const vertical = (c: number) => ({ origin: [c, 0] as Point, vector: [0, 1] as Point });
/** The horizontal line y = c, as he sees it. */
const horizontal = (c: number) => ({ origin: [0, c] as Point, vector: [1, 0] as Point });

function folded(result: FoldResult): Paper {
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return result.paper;
}

/** Faces from the bottom layer up (side by side faces left to right), as { shape, front }. */
function stack(paper: Paper) {
  return seenFaces(paper)
    .map((f) => ({ layer: f.layer, shape: shape(f.polygon), front: f.front }))
    .sort((a, b) => a.layer - b.layer || a.shape[0][0] - b.shape[0][0] || a.shape[0][1] - b.shape[0][1])
    .map(({ shape, front }) => ({ shape, front }));
}

const leftHalf: Point[] = [
  [0, 0],
  [0, 1],
  [0.5, 0],
  [0.5, 1],
];

const creases = (paper: Paper) => paper.graph.edges_assignment.filter((a) => a !== "B");

describe("a new Paper", () => {
  it("is one flat face, front side up, covering the unit square", () => {
    const faces = seenFaces(newPaper());
    expect(faces).toHaveLength(1);
    expect(faces[0].front).toBe(true);
    expect(shape(faces[0].polygon)).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });

  it("can be a rectangle", () => {
    const [face] = seenFaces(newPaper({ width: 2, height: 1 }));
    expect(shape(face.polygon)).toEqual([
      [0, 0],
      [0, 1],
      [2, 0],
      [2, 1],
    ]);
  });
});

describe("valley and mountain Folds", () => {
  it("a valley Fold in half brings the right half over on top, back side up", () => {
    const paper = folded(fold(newPaper(), { line: vertical(0.5), flap: [0.75, 0.5], assignment: "V" }));
    expect(stack(paper)).toEqual([
      { shape: leftHalf, front: true },
      { shape: leftHalf, front: false },
    ]);
    expect(creases(paper)).toEqual(["V"]);
  });

  it("a mountain Fold in half tucks the right half underneath", () => {
    const paper = folded(fold(newPaper(), { line: vertical(0.5), flap: [0.75, 0.5], assignment: "M" }));
    expect(stack(paper)).toEqual([
      { shape: leftHalf, front: false },
      { shape: leftHalf, front: true },
    ]);
    expect(creases(paper)).toEqual(["M"]);
  });

  it("folding the left half over keeps the right half where it lies", () => {
    const paper = folded(fold(newPaper(), { line: vertical(0.5), flap: [0.25, 0.5], assignment: "V" }));
    const rightHalf = leftHalf.map(([x, y]) => [x + 0.5, y] as Point);
    expect(stack(paper)).toEqual([
      { shape: rightHalf, front: true },
      { shape: rightHalf, front: false },
    ]);
  });

  it("records layer order in FOLD's faceOrders convention, as Rabbit Ear's own valley fold does", () => {
    // Rabbit Ear's simple valley fold writes [moved, stayed, 1]: the moved face lies on the side the stayed face's front faces.
    const paper = folded(fold(newPaper(), { line: vertical(0.5), flap: [0.75, 0.5], assignment: "V" }));
    const faces = seenFaces(paper);
    const moved = faces.findIndex((f) => !f.front);
    const stayed = faces.findIndex((f) => f.front);
    const [[f, g, s]] = paper.graph.faceOrders;
    expect(paper.graph.faceOrders).toHaveLength(1);
    expect(f === moved ? [f, g, s] : [g, f, s]).toEqual([moved, stayed, 1]);
  });

  it("does not change the Paper it was given", () => {
    const paper = newPaper();
    const before = JSON.stringify(paper);
    fold(paper, { line: vertical(0.5), flap: [0.75, 0.5], assignment: "V" });
    expect(JSON.stringify(paper)).toBe(before);
  });
});

describe("folding one flap of layered paper", () => {
  // Right half folded over the left: two layers on [0, 0.5], joined at x = 0.5.
  const book = () => folded(fold(newPaper(), { line: vertical(0.5), flap: [0.75, 0.5], assignment: "V" }));
  const quarter = (x0: number): Point[] => [
    [x0, 0],
    [x0, 1],
    [x0 + 0.25, 0],
    [x0 + 0.25, 1],
  ];

  it("a valley Fold of the top layer moves and creases only that layer", () => {
    const paper = folded(fold(book(), { line: vertical(0.25), flap: [0.1, 0.5], assignment: "V" }));
    expect(stack(paper)).toEqual([
      { shape: leftHalf, front: true },
      { shape: quarter(0.25), front: false },
      { shape: quarter(0.25), front: true },
    ]);
    // Seen from his side a valley; on the back of the Paper it is a mountain crease.
    expect(creases(paper).sort()).toEqual(["M", "V"]);
  });

  it("can take every layer under his finger", () => {
    const paper = folded(fold(book(), { line: vertical(0.25), flap: [0.1, 0.5], assignment: "V", layers: "all" }));
    expect(stack(paper).map((f) => f.shape)).toEqual([quarter(0.25), quarter(0.25), quarter(0.25), quarter(0.25)]);
    expect(creases(paper).sort()).toEqual(["M", "V", "V"]);
  });

  it("a mountain Fold takes the bottom layer behind", () => {
    const paper = folded(fold(book(), { line: vertical(0.25), flap: [0.1, 0.5], assignment: "M" }));
    expect(stack(paper)).toEqual([
      { shape: quarter(0.25), front: false },
      { shape: quarter(0.25), front: true },
      { shape: leftHalf, front: false },
    ]);
  });

  // The right strip folded over: a separate flap on [0.4, 0.7], hinged at x = 0.7.
  const strip = () => folded(fold(newPaper(), { line: vertical(0.7), flap: [0.9, 0.5], assignment: "V" }));

  it("refuses a valley Fold when a flap that stays lies on top of it", () => {
    expect(fold(strip(), { line: vertical(0.5), flap: [0.2, 0.5], assignment: "V" })).toEqual({
      ok: false,
      refusal: "blocked",
    });
  });

  it("the same Fold as a mountain goes underneath and is fine", () => {
    expect(fold(strip(), { line: vertical(0.5), flap: [0.2, 0.5], assignment: "M" }).ok).toBe(true);
  });

  it("the same valley Fold works when it takes the flap on top along", () => {
    const result = fold(strip(), { line: vertical(0.5), flap: [0.45, 0.5], assignment: "V", layers: "all" });
    expect(result.ok).toBe(true);
  });
});

describe("fold-and-unfold and unfolding", () => {
  const rightHalf = leftHalf.map(([x, y]) => [x + 0.5, y] as Point);

  it("fold-and-unfold leaves a flat crease and the paper lying open", () => {
    const paper = folded(foldAndUnfold(newPaper(), { line: vertical(0.5), flap: [0.75, 0.5], assignment: "V" }));
    expect(stack(paper)).toEqual([
      { shape: leftHalf, front: true },
      { shape: rightHalf, front: true },
    ]);
    expect(creases(paper)).toEqual(["F"]);
  });

  it("folding the top flap back along its crease opens the paper again", () => {
    const book = folded(fold(newPaper(), { line: vertical(0.5), flap: [0.75, 0.5], assignment: "V" }));
    const paper = folded(fold(book, { line: vertical(0.5), flap: [0.25, 0.5], assignment: "V" }));
    expect(stack(paper)).toEqual([
      { shape: leftHalf, front: true },
      { shape: rightHalf, front: true },
    ]);
    expect(creases(paper)).toEqual(["F"]);
  });
});

describe("turn over and rotate", () => {
  it("turning over shows the other side, with the layers reversed", () => {
    const book = folded(fold(newPaper(), { line: vertical(0.5), flap: [0.75, 0.5], assignment: "V" }));
    expect(stack(turnOver(book))).toEqual([
      { shape: leftHalf, front: true },
      { shape: leftHalf, front: false },
    ]);
  });

  it("turns over in place, mirrored left to right", () => {
    const [face] = seenFaces(turnOver(newPaper({ width: 2, height: 1 })));
    expect(face.front).toBe(false);
    expect(shape(face.polygon)).toEqual([
      [0, 0],
      [0, 1],
      [2, 0],
      [2, 1],
    ]);
  });

  it("a valley Fold made after turning over is a mountain crease on the front", () => {
    const paper = folded(fold(turnOver(newPaper()), { line: vertical(0.5), flap: [0.75, 0.5], assignment: "V" }));
    expect(creases(paper)).toEqual(["M"]);
    expect(stack(paper).map((f) => f.front)).toEqual([false, true]);
  });

  it("rotates a quarter turn counterclockwise about the Paper's centre", () => {
    const [face] = seenFaces(rotate(newPaper({ width: 2, height: 1 }), 90));
    expect(shape(face.polygon)).toEqual([
      [0.5, -0.5],
      [0.5, 1.5],
      [1.5, -0.5],
      [1.5, 1.5],
    ]);
  });

  it("Folds are described as he sees the rotated Paper", () => {
    const paper = folded(fold(rotate(newPaper(), 90), { line: horizontal(0.5), flap: [0.5, 0.75], assignment: "V" }));
    const crease = paper.graph.edges_assignment.indexOf("V");
    const ends = paper.graph.edges_vertices[crease].map((v) => paper.graph.vertices_coords[v]);
    expect(ends.map(([x]) => Math.round(x * 1e6) / 1e6)).toEqual([0.5, 0.5]);
  });
});

describe("the cup, Fold by Fold", () => {
  const through = (a: Point, b: Point) => ({ origin: a, vector: [b[0] - a[0], b[1] - a[1]] as Point });
  /** The line that folds point a onto point b. */
  const landing = (a: Point, b: Point) => ({
    origin: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point,
    vector: [a[1] - b[1], b[0] - a[0]] as Point,
  });
  // Corners land where the flap's top edge runs parallel to the cup's bottom.
  const k = Math.SQRT2 - 1;

  function cup() {
    let paper = newPaper();
    // Triangle: top-right corner down to bottom-left. Closed edge x + y = 1 is the cup's bottom, (0, 0) its top.
    paper = folded(fold(paper, { line: through([0, 1], [1, 0]), flap: [0.9, 0.9], assignment: "V" }));
    paper = folded(fold(paper, { line: landing([1, 0], [0, k]), flap: [0.9, 0.05], assignment: "V" }));
    paper = folded(fold(paper, { line: landing([0, 1], [k, 0]), flap: [0.05, 0.9], assignment: "V" }));
    // Front flap down over the corners, back flap behind.
    paper = folded(fold(paper, { line: through([0, k], [k, 0]), flap: [0.05, 0.05], assignment: "V" }));
    return folded(fold(paper, { line: through([0, k], [k, 0]), flap: [0.05, 0.05], assignment: "M" }));
  }

  it("ends as the cup: a band between the rim and the bottom", () => {
    for (const face of seenFaces(cup())) {
      for (const [x, y] of face.polygon) {
        expect(x + y).toBeGreaterThan(k - 1e-9);
        expect(x + y).toBeLessThan(1 + 1e-9);
      }
    }
  });

  it("has the front flap on top and the back flap behind, both turned down", () => {
    const here = seenFaces(cup())
      .filter((f) => f.polygon.length > 2 && contains(f.polygon, [0.3, 0.3]))
      .sort((a, b) => a.layer - b.layer);
    expect(here.at(-1)!.front).toBe(true);
    expect(here[0].front).toBe(false);
  });
});

describe("refusals", () => {
  it("no paper under his finger", () => {
    expect(fold(newPaper(), { line: vertical(0.5), flap: [2, 2], assignment: "V" })).toEqual({
      ok: false,
      refusal: "no-flap",
    });
  });

  it("his finger on the line itself", () => {
    expect(fold(newPaper(), { line: horizontal(0.5), flap: [0.3, 0.5], assignment: "V" })).toEqual({
      ok: false,
      refusal: "no-flap",
    });
  });

  it("a line that misses the paper", () => {
    expect(fold(newPaper(), { line: vertical(3), flap: [0.5, 0.5], assignment: "V" })).toEqual({
      ok: false,
      refusal: "misses-flap",
    });
  });
});

describe("inside reverse", () => {
  // A square folded in half along its diagonal: a two-layer triangle whose
  // spine runs from (0, 0) to (1, 1). The corner at (1, 1) is a two-layer point.
  const point = () =>
    folded(fold(newPaper(), { line: { origin: [0, 0], vector: [1, 1] }, flap: [0.9, 0.1], assignment: "V" }));
  // The line across the point: from the spine at (0.6, 0.6) to the top edge at (0.7, 1).
  const across = { origin: [0.6, 0.6] as Point, vector: [0.1, 0.4] as Point };
  const tip: Point = [0.95, 0.95];
  const near = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;
  /** The body of each layer is what's left of its triangle: a quadrilateral. The tips are triangles. */
  const isBody = (f: SeenFace) => f.polygon.length === 4;

  /** The mirror image of a point across the line. */
  function reflected([x, y]: Point): Point {
    const [ox, oy] = across.origin;
    const len = Math.hypot(...across.vector);
    const ux = across.vector[0] / len;
    const uy = across.vector[1] / len;
    const dx = x - ox;
    const dy = y - oy;
    const along = dx * ux + dy * uy;
    return [ox + 2 * along * ux - dx, oy + 2 * along * uy - dy];
  }

  it("reverses the tip between its own two layers: a four-layer stack", () => {
    const paper = folded(insideReverse(point(), { line: across, tip }));
    const faces = seenFaces(paper);
    expect(faces).toHaveLength(4);
    const bodies = faces.filter(isBody).sort((a, b) => a.layer - b.layer);
    const tips = faces.filter((f) => !isBody(f)).sort((a, b) => a.layer - b.layer);
    expect(bodies).toHaveLength(2);
    expect(tips).toHaveLength(2);
    // The tip part lies mirrored across the line, over the body.
    const tipShape = shape(([[0.6, 0.6], [0.7, 1], [1, 1]] as Point[]).map(reflected));
    expect(shape(tips[0].polygon)).toEqual(tipShape);
    expect(shape(tips[1].polygon)).toEqual(tipShape);
    // From the bottom: body, tip, tip, body. Each tip is between its own body and the middle.
    expect(bodies[0].layer).toBeLessThan(tips[0].layer);
    expect(tips[1].layer).toBeLessThan(bodies[1].layer);
    // Each tip now shows its other side.
    expect(tips[0].front).toBe(!bodies[0].front);
    expect(tips[1].front).toBe(!bodies[1].front);
  });

  it("inverts the tip's spine and creases both layers toward the middle", () => {
    const { graph } = folded(insideReverse(point(), { line: across, tip }));
    const edgeBetween = (from: Point, to: Point) =>
      graph.edges_vertices.findIndex(([u, v]) => {
        const a = graph.vertices_coords[u];
        const b = graph.vertices_coords[v];
        return (near(a, from) && near(b, to)) || (near(a, to) && near(b, from));
      });
    // Beyond the line the spine has turned the other way; up to the line it holds its valley.
    expect(graph.edges_foldAngle[edgeBetween([0.6, 0.6], [1, 1])]).toBe(-180);
    expect(graph.edges_foldAngle[edgeBetween([0, 0], [0.6, 0.6])]).toBe(180);
    // Both layers' fronts face the middle, so both new creases are valleys.
    expect(creases({ graph } as Paper).sort()).toEqual(["M", "V", "V", "V"]);
  });

  it("refuses when there is no two-layer point under his finger", () => {
    expect(insideReverse(newPaper(), { line: across, tip })).toEqual({ ok: false, refusal: "no-flap" });
  });

  it("refuses when the line misses the point", () => {
    expect(insideReverse(point(), { line: vertical(3), tip })).toEqual({ ok: false, refusal: "misses-flap" });
  });

  it("does not change the Paper it was given", () => {
    const paper = point();
    const before = JSON.stringify(paper);
    insideReverse(paper, { line: across, tip });
    expect(JSON.stringify(paper)).toBe(before);
  });
});

// Checked against origami itself, not by eye: every vertex of the crease
// pattern is flat-foldable (Maekawa, Kawasaki), and Rabbit Ear's layer
// solver, given only the folded form, finds the engine's layer order.
function expectFlatFoldable(paper: Paper) {
  const { faceOrders: _orders, ...graph } = paper.graph;
  // Rabbit Ear reads the two vertex arrays side by side, so both must be in the same (sorted) order.
  const vertices_vertices = makeVerticesVertices({ vertices_coords: graph.vertices_coords, edges_vertices: graph.edges_vertices });
  const vertices_edges = makeVerticesEdges({ edges_vertices: graph.edges_vertices, vertices_vertices });
  const sorted = { ...graph, vertices_vertices, vertices_edges };
  expect(verticesFlatFoldabilityMaekawa(sorted)).toEqual(graph.vertices_coords.map(() => 0));
  verticesFlatFoldabilityKawasaki(sorted).forEach((deviation) => expect(Math.abs(deviation)).toBeLessThan(1e-9));
}

function expectRabbitEarAgrees(paper: Paper) {
  const { faceOrders, ...graph } = paper.graph;
  const vertices_coords = makeVerticesCoordsFlatFolded(paper.graph, [paper.rootFace]);
  const solved = solveFaceOrders({ ...graph, vertices_coords });
  expect(solved.branches ?? []).toHaveLength(0);
  const ours = new Map(faceOrders.map(([f, g, s]) => [`${f} ${g}`, s]));
  const theirs = (solved.orders ?? []) as [number, number, number][];
  expect(theirs).toHaveLength(faceOrders.length);
  for (const [f, g, s] of theirs) {
    expect(ours.get(`${f} ${g}`) ?? ours.get(`${g} ${f}`), `faces ${f} and ${g}`).toBe(s);
  }
}

const diagonal = { origin: [0, 0] as Point, vector: [1, 1] as Point };
/** The line from the triangle's right-angle corner (0, 1) to the paper's centre: the hinge of the top flap. */
const hinge = { origin: [0, 1] as Point, vector: [1, -1] as Point };
/** A square folded in half on its diagonal, then the triangle folded in half: four layers on (0,0),(0,1),(0.5,0.5). */
const halved = () => {
  const triangle = folded(fold(newPaper(), { line: diagonal, flap: [0.9, 0.1], assignment: "V" }));
  return folded(fold(triangle, { line: hinge, flap: [0.9, 0.9], assignment: "V", layers: "all" }));
};
const near = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;
/** The fold angle of the crease between two points of the crease pattern. */
const angleBetween = (paper: Paper, from: Point, to: Point) => {
  const { graph } = paper;
  const e = graph.edges_vertices.findIndex(([u, v]) => {
    const a = graph.vertices_coords[u];
    const b = graph.vertices_coords[v];
    return (near(a, from) && near(b, to)) || (near(a, to) && near(b, from));
  });
  expect(e, `edge ${from} to ${to}`).toBeGreaterThanOrEqual(0);
  return graph.edges_foldAngle[e];
};
// Squashing the back flap too makes the preliminary base without a collapse.
// Turned over, the Paper is seen mirrored, so the hinge now runs from (0.5, 1) to (0, 0.5).
const mirrored = { origin: [0.5, 1] as Point, vector: [-1, -1] as Point };
/** The preliminary base: closed point B = (0, 0.5), open corners at A = (0.5, 1), side corners (0.5, 0.5) and (0, 1). */
const preliminary = () => {
  const front = folded(squash(halved(), { line: hinge, flap: [0.2, 0.6] }));
  return folded(squash(turnOver(front), { line: mirrored, flap: [0.3, 0.6] }));
};

describe("squash", () => {
  const base: Point[] = [[0, 0], [0, 1], [0.5, 0.5]];
  const nearHalf: Point[] = [[0, 0.5], [0, 1], [0.5, 0.5]];
  const farHalf: Point[] = [[0, 1], [0.5, 0.5], [0.5, 1]];

  it("the classic: the top flap of the halved triangle becomes a square on the hinge line", () => {
    const paper = folded(squash(halved(), { line: hinge, flap: [0.2, 0.6] }));
    // The square [0, 0.5] × [0.5, 1], symmetric about the hinge: half over the base, half beyond it.
    expect(stack(paper)).toEqual([
      { shape: shape(base), front: true },
      { shape: shape(farHalf), front: true },
      { shape: shape(base), front: false },
      { shape: shape(farHalf), front: false },
      { shape: shape(nearHalf), front: true },
      { shape: shape(nearHalf), front: false },
    ]);
  });

  it("the classic's crease pattern: the midlines fold, the spine and the outer hinge open", () => {
    const paper = folded(squash(halved(), { line: hinge, flap: [0.2, 0.6] }));
    expect(angleBetween(paper, [0.5, 0.5], [0.5, 1])).toBe(180);
    expect(angleBetween(paper, [0.5, 0.5], [1, 0.5])).toBe(180);
    expect(angleBetween(paper, [0.5, 0.5], [1, 1])).toBe(0);
    expect(angleBetween(paper, [0.5, 0.5], [0, 1])).toBe(0);
    expect(angleBetween(paper, [0.5, 0.5], [1, 0])).toBe(-180);
    expect(angleBetween(paper, [0, 0], [0.5, 0.5])).toBe(180);
    expect(creases(paper).sort().join("")).toBe("FFMVVV");
  });

  it("the classic is flat-foldable at every vertex, and Rabbit Ear agrees with its layer order", () => {
    const paper = folded(squash(halved(), { line: hinge, flap: [0.2, 0.6] }));
    expectFlatFoldable(paper);
    expectRabbitEarAgrees(paper);
  });

  it("tells the recorder which flap is lifted first, and about which line", () => {
    const result = squash(halved(), { line: hinge, flap: [0.2, 0.6] });
    expect(result.ok && result.lift).toEqual({ faces: expect.arrayContaining([0, 1]), line: hinge });
  });

  // Squashing one flap of the preliminary base gives the known kite.
  it("squashing the back flap as well gives the preliminary base: eight triangles, four on each side", () => {
    const paper = preliminary();
    const faces = seenFaces(paper);
    expect(faces).toHaveLength(8);
    const nearSide = shape([[0, 0.5], [0.5, 1], [0.5, 0.5]]).join();
    const farSide = shape([[0, 0.5], [0.5, 1], [0, 1]]).join();
    expect(faces.filter((f) => shape(f.polygon).join() === nearSide)).toHaveLength(4);
    expect(faces.filter((f) => shape(f.polygon).join() === farSide)).toHaveLength(4);
    expect(creases(paper).sort().join("")).toBe("FFMMVVVV");
    expectFlatFoldable(paper);
    expectRabbitEarAgrees(paper);
  });

  it("squashing one flap of the preliminary base gives the known kite", () => {
    const paper = folded(squash(preliminary(), { line: mirrored, flap: [0.3, 0.6] }));
    // The flap's spine (length 1/2) lands on the centre line BA at E'; its creases from the closed point B
    // (at 22.5° to the centre line) meet the open edges at P and P', 1/√2 up them: the kite B, P, A, P'.
    const k = Math.SQRT1_2;
    const B: Point = [0, 0.5];
    const A: Point = [0.5, 1];
    const P: Point = [0.5, k];
    const P2: Point = [k - 0.5, 1];
    const E: Point = [k / 2, 0.5 + k / 2];
    const kite = seenFaces(paper).filter((f) => f.polygon.some((p) => near(p, P) || near(p, P2)));
    const sorted = (shapes: Point[][]) => shapes.map((s) => JSON.stringify(shape(s))).sort();
    expect(sorted(kite.map((f) => f.polygon))).toEqual(sorted([[B, P, A], [B, E, P], [B, A, P2], [B, E, P2]]));
    // Its two halves lie on top of the base, each a tip folded onto its own half.
    expect(kite.map((f) => f.layer).sort()).toEqual([2, 3, 4, 5]);
    expectFlatFoldable(paper);
    expectRabbitEarAgrees(paper);
  });

  it("refuses when there is no two-layer flap under his finger", () => {
    expect(squash(newPaper(), { line: hinge, flap: [0.2, 0.6] })).toEqual({ ok: false, refusal: "no-flap" });
  });

  it("refuses when the flap is not hinged on the line", () => {
    expect(squash(halved(), { line: vertical(0.25), flap: [0.2, 0.6] })).toEqual({ ok: false, refusal: "misses-flap" });
  });

  it("does not change the Paper it was given", () => {
    const paper = halved();
    const before = JSON.stringify(paper);
    squash(paper, { line: hinge, flap: [0.2, 0.6] });
    expect(JSON.stringify(paper)).toBe(before);
  });
});

describe("closed sink", () => {
  // The closed point B = (0, 0.5) of the preliminary base, sunk along the line
  // perpendicular to its centre line BA, through (0.2, 0.5) and (0, 0.7). The
  // expected result is standard origami geometry, worked out from the flat
  // fold: the point is cut off along the line and each layer's tip lands
  // mirrored across it, so the sunk tip reaches B' = (0.2, 0.7) inside the
  // model; a tip must lie flat against its own layer on the inside (every
  // layer at the point reaches the line, so nothing can come between them),
  // and the only flat-foldable order with every sunk crease swapped is the
  // closed sink: the model's interior pockets each hold two tips.
  const sink = { origin: [0.2, 0.5] as Point, vector: [-1, 1] as Point };
  const point: Point = [0.04, 0.54];
  const sunk = () => folded(closedSink(preliminary(), { line: sink, point }));
  const X: Point = [0.1, 0.6];
  const B2: Point = [0.2, 0.7];
  const rightBody = shape([X, [0.2, 0.5], [0.5, 0.5], [0.5, 1]]).join();
  const leftBody = shape([X, [0, 0.7], [0, 1], [0.5, 1]]).join();
  const rightTip = shape([X, [0.2, 0.5], B2]).join();
  const leftTip = shape([X, [0, 0.7], B2]).join();
  const C: Point = [0.5, 0.5];
  const hasVertex = (paper: Paper, f: number, p: Point) =>
    paper.graph.faces_vertices[f].some((v) => near(paper.graph.vertices_coords[v], p));
  /** One side of the model: its faces nearest him first, each a body or a tip, with the rank of the face a tip was cut from. */
  const side = (paper: Paper, body: string, tip: string) => {
    const faces = seenFaces(paper);
    const own = faces.map((_, f) => f).filter((f) => [body, tip].includes(shape(faces[f].polygon).join()));
    const sorted = own.sort((a, b) => faces[b].layer - faces[a].layer);
    const kind = (f: number) => (hasVertex(paper, f, C) ? "tip" : "body");
    // A tip and its body share the two vertices cut on the line.
    const bodyOf = (t: number) =>
      sorted.find(
        (f) => kind(f) === "body" && paper.graph.faces_vertices[t].filter((v) => paper.graph.faces_vertices[f].includes(v)).length === 2,
      )!;
    return sorted.map((f) => ({ kind: kind(f), bodyRank: sorted.indexOf(kind(f) === "tip" ? bodyOf(f) : f) }));
  };

  it("cuts the point off along the line and sinks it to its mirror image inside: eight bodies, eight tips", () => {
    const faces = seenFaces(sunk());
    expect(faces).toHaveLength(16);
    const count = (s: string) => faces.filter((f) => shape(f.polygon).join() === s).length;
    expect(count(rightBody)).toBe(4);
    expect(count(leftBody)).toBe(4);
    expect(count(rightTip)).toBe(4);
    expect(count(leftTip)).toBe(4);
  });

  it("the crease pattern: the sink line is a square round the centre, all one way; the creases inside it swap mountain and valley", () => {
    const paper = sunk();
    // The square's corners sit on the midlines 0.2 from the centre; its sides cross the diagonals 0.1 out.
    const ring: Point[] = [[0.7, 0.5], [0.6, 0.6], [0.5, 0.7], [0.4, 0.6], [0.3, 0.5], [0.4, 0.4], [0.5, 0.3], [0.6, 0.4]];
    ring.forEach((p, i) => expect(angleBetween(paper, p, ring[(i + 1) % ring.length]), `sink crease ${i}`).toBe(180));
    // Inside: the midline tips were valleys, now mountains; the folded diagonal tips were mountains, now valleys; the flat ones stay flat.
    for (const m of [[0.7, 0.5], [0.5, 0.7], [0.3, 0.5], [0.5, 0.3]] as Point[]) expect(angleBetween(paper, C, m)).toBe(-180);
    expect(angleBetween(paper, C, [0.6, 0.4])).toBe(180);
    expect(angleBetween(paper, C, [0.4, 0.6])).toBe(180);
    expect(angleBetween(paper, C, [0.6, 0.6])).toBe(0);
    expect(angleBetween(paper, C, [0.4, 0.4])).toBe(0);
    // Outside the square nothing changed.
    expect(angleBetween(paper, [0.7, 0.5], [1, 0.5])).toBe(180);
    expect(angleBetween(paper, [0.6, 0.4], [1, 0])).toBe(-180);
    expect(angleBetween(paper, [0.6, 0.6], [1, 1])).toBe(0);
    expect(creases(paper).sort().join("")).toBe("FFFF" + "MMMMMM" + "VVVVVVVVVVVVVV");
  });

  it("is flat-foldable at every vertex, and Rabbit Ear agrees with its layer order", () => {
    const paper = sunk();
    expectFlatFoldable(paper);
    expectRabbitEarAgrees(paper);
  });

  // The orders that make it a closed sink rather than an open one, on each
  // side of the centre line (four layers: the front sheet, the folded flap's
  // two layers, the back sheet).
  it("closed, not open: every sunk tip lies against the inside of its own layer, so the sink creases all turn the same way", () => {
    for (const [body, tip] of [[rightBody, rightTip], [leftBody, leftTip]]) {
      const faces = side(sunk(), body, tip);
      expect(faces.map((f) => f.kind)).toEqual(["body", "tip", "tip", "body", "body", "tip", "tip", "body"]);
      // The front sheet's tip is just behind it, the back sheet's just in front of it: both inside the model.
      expect(faces[1].bodyRank).toBe(0);
      expect(faces[6].bodyRank).toBe(7);
      // The folded flap's tips lie outside its two layers, wrapping them (an open sink would open the flap's tip out flat instead).
      expect(faces[2].bodyRank).toBe(3);
      expect(faces[5].bodyRank).toBe(4);
    }
  });

  it("closed, not open: the sunk point keeps its layers in the model's order, front to back, as one point turned inside out", () => {
    for (const [body, tip] of [[rightBody, rightTip], [leftBody, leftTip]]) {
      const tips = side(sunk(), body, tip).filter((f) => f.kind === "tip");
      expect(tips.map((f) => f.bodyRank)).toEqual([0, 3, 4, 7]);
    }
  });

  it("refuses when there is no closed point under his finger", () => {
    expect(closedSink(newPaper(), { line: sink, point })).toEqual({ ok: false, refusal: "no-flap" });
    // Two layers not joined beyond the line (a book's open edge) are not a closed point.
    const book = folded(fold(newPaper(), { line: vertical(0.5), flap: [0.75, 0.5], assignment: "V" }));
    expect(closedSink(book, { line: vertical(0.25), point: [0.1, 0.5] })).toEqual({ ok: false, refusal: "no-flap" });
  });

  it("refuses when the line misses the point", () => {
    expect(closedSink(preliminary(), { line: vertical(3), point })).toEqual({ ok: false, refusal: "misses-flap" });
  });

  it("does not change the Paper it was given", () => {
    const paper = preliminary();
    const before = JSON.stringify(paper);
    closedSink(paper, { line: sink, point });
    expect(JSON.stringify(paper)).toBe(before);
  });
});
