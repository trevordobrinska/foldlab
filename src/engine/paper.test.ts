import { describe, expect, it } from "vitest";
import { contains } from "./geometry";
import { fold, foldAndUnfold, newPaper, rotate, seenFaces, turnOver, type FoldResult, type Paper } from "./paper";

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
    // Seen from his side a valley; on the back of the sheet it is a mountain crease.
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
