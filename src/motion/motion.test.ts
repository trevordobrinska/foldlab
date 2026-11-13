import { describe, expect, it } from "vitest";
import { fold, insideReverse, newPaper, type FoldResult, type Paper } from "../engine/paper";
import { signedArea } from "../engine/geometry";
import { dihedral, motionOf, type Mesh, type Motion } from "./motion";
import { cross, dot, length, sub, type V3 } from "./vec3";

type Point = [number, number];

function folded(result: FoldResult): Paper {
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return result.paper;
}

// A square folded in half along its diagonal (an earlier Step), then the
// corner at (1, 1) reversed in between the two layers along a line from the
// spine at (0.6, 0.6) to the top edge at (0.7, 1): the tip swings through
// the middle and its head comes out across the top edge.
const across = { origin: [0.6, 0.6] as Point, vector: [0.1, 0.4] as Point };
const point = () =>
  folded(fold(newPaper(), { line: { origin: [0, 0], vector: [1, 1] }, flap: [0.9, 0.1], assignment: "V" }));
const before = point();
const after = folded(insideReverse(before, { line: across, tip: [0.95, 0.95] }));

const SAMPLES = 50;
const samples = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);

/** The Fold sampled from start to finish, once, shared by the tests below. */
let motion: Motion;
let frames: V3[][];
function run() {
  if (!motion) {
    motion = motionOf(before, after);
    frames = samples.map((p) => motion.at(p));
  }
  return { motion, frames, mesh: motion.mesh };
}

const r = (n: number) => Math.round(n * 1e6) / 1e6 + 0;

/** The three corners of a mesh triangle. */
const corners = (mesh: Mesh, positions: V3[], t: number) => mesh.triangles[t].map((v) => positions[v]) as [V3, V3, V3];

const normalOf = ([a, b, c]: [V3, V3, V3]) => cross(sub(b, a), sub(c, a));

/** Do two triangles that share no vertex cut through each other? Lying flat together doesn't count. */
function trianglesCross(a: [V3, V3, V3], b: [V3, V3, V3]): boolean {
  const skin = 1e-4;
  const cuts = (tri: [V3, V3, V3], p: V3, q: V3) => {
    const n = normalOf(tri);
    const nl = length(n);
    if (nl < 1e-12) return false;
    const dp = dot(sub(p, tri[0]), n) / nl;
    const dq = dot(sub(q, tri[0]), n) / nl;
    if (Math.abs(dp) < skin || Math.abs(dq) < skin || dp * dq > 0) return false;
    const t = dp / (dp - dq);
    const x: V3 = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    // Strictly inside the triangle: same side of every edge, by more than the skin.
    return tri.every((u, i) => {
      const v = tri[(i + 1) % 3];
      const edge = sub(v, u);
      const inward = cross(n, edge);
      return dot(sub(x, u), inward) / length(inward) > skin;
    });
  };
  for (let i = 0; i < 3; i++) {
    if (cuts(b, a[i], a[(i + 1) % 3]) || cuts(a, b[i], b[(i + 1) % 3])) return true;
  }
  return false;
}

/** The mean of a face's triangle corners, and the mean front normal. */
function faceFrame(mesh: Mesh, positions: V3[], face: number) {
  const centre: V3 = [0, 0, 0];
  const normal: V3 = [0, 0, 0];
  let count = 0;
  mesh.triangles.forEach((_, t) => {
    if (mesh.triangleFace[t] !== face) return;
    const tri = corners(mesh, positions, t);
    const n = normalOf(tri);
    for (const c of tri) for (let k = 0; k < 3; k++) centre[k] += c[k] / 3;
    for (let k = 0; k < 3; k++) normal[k] += n[k];
    count++;
  });
  return { centre: centre.map((c) => c / count) as V3, normal };
}

/** Does every recorded layer order of `paper` hold in these positions? `faceOf` maps mesh faces to the paper's. */
function layerOrderHolds(mesh: Mesh, positions: V3[], paper: Paper, faceOf: (meshFace: number) => number) {
  const meshFaces = mesh.triangleFace.filter((f, i, all) => all.indexOf(f) === i);
  const frameOf = (paperFace: number) => {
    const parts = meshFaces.filter((f) => faceOf(f) === paperFace).map((f) => faceFrame(mesh, positions, f));
    const centre: V3 = [0, 0, 0];
    const normal: V3 = [0, 0, 0];
    for (const part of parts) {
      for (let k = 0; k < 3; k++) {
        centre[k] += part.centre[k] / parts.length;
        normal[k] += part.normal[k];
      }
    }
    return { centre, normal };
  };
  return paper.graph.faceOrders.every(([f, g, s]) => {
    const F = frameOf(f);
    const G = frameOf(g);
    return Math.sign(dot(sub(F.centre, G.centre), G.normal)) === s;
  });
}

describe("the inside reverse as paper in motion", { timeout: 120000 }, () => {
  it("starts as the current Paper, in its layer order", () => {
    const { mesh, frames } = run();
    for (let v = 0; v < mesh.paperVertexCount; v++) {
      expect(r(frames[0][v][0])).toBe(r(mesh.start[v][0]));
      expect(r(frames[0][v][1])).toBe(r(mesh.start[v][1]));
    }
    expect(layerOrderHolds(mesh, frames[0], before, (f) => mesh.faceBefore[f])).toBe(true);
  });

  it("finishes as the engine's finished Paper, in its layer order", () => {
    const { mesh, frames } = run();
    const end = frames[SAMPLES];
    for (let v = 0; v < mesh.paperVertexCount; v++) {
      expect(Math.hypot(end[v][0] - mesh.end[v][0], end[v][1] - mesh.end[v][1])).toBeLessThan(0.01);
    }
    expect(layerOrderHolds(mesh, end, after, (f) => f)).toBe(true);
  });

  it("never stretches: every edge length and face area stays within 1% of the flat paper's", () => {
    const { mesh, frames } = run();
    const flatArea = after.graph.faces_vertices.map((loop) =>
      Math.abs(signedArea(loop.map((v) => after.graph.vertices_coords[v]))),
    );
    for (const positions of frames) {
      for (const [u, v, rest] of mesh.bars) {
        expect(Math.abs(length(sub(positions[u], positions[v])) / rest - 1)).toBeLessThan(0.01);
      }
      const area = flatArea.map(() => 0);
      mesh.triangles.forEach((_, t) => {
        area[mesh.triangleFace[t]] += length(normalOf(corners(mesh, positions, t))) / 2;
      });
      area.forEach((a, f) => expect(Math.abs(a / flatArea[f] - 1)).toBeLessThan(0.01));
    }
  });

  it("never passes through itself: no two faces intersect at any sample", () => {
    const { mesh, frames } = run();
    const shareVertex = (a: number, b: number) => mesh.triangles[a].some((v) => mesh.triangles[b].includes(v));
    frames.forEach((positions, k) => {
      for (let a = 0; a < mesh.triangles.length; a++) {
        for (let b = a + 1; b < mesh.triangles.length; b++) {
          if (shareVertex(a, b)) continue;
          const crossing = trianglesCross(corners(mesh, positions, a), corners(mesh, positions, b));
          expect(crossing, `triangles ${a} and ${b} cross at progress ${samples[k]}`).toBe(false);
        }
      }
    });
  });

  it("goes down into the middle: the tip stays between the two layers, which stay mirror images", () => {
    const { mesh, frames } = run();
    const start = mesh.start;
    // The tip is the corner at (1, 1); the point's two layers meet there, at the middle plane z = 0.
    const tip = start.findIndex(([x, y]) => r(x) === 1 && r(y) === 1);
    expect(tip).toBeGreaterThanOrEqual(0);
    expect(Math.abs(start[tip][2])).toBe(0);
    // Every vertex has its mirror image across the middle plane in the other layer.
    const mirrorOf = start.map(([x, y, z]) => start.findIndex(([x2, y2, z2]) => r(x2) === r(x) && r(y2) === r(y) && r(z2) === r(-z)));
    expect(mirrorOf.every((m) => m >= 0)).toBe(true);
    for (const positions of frames) {
      // Between the layers: never beyond the upper layer, never beneath the lower one.
      const above = positions.filter((_, v) => start[v][2] > 0).map((p) => p[2]);
      const below = positions.filter((_, v) => start[v][2] < 0).map((p) => p[2]);
      expect(positions[tip][2]).toBeLessThanOrEqual(Math.max(...above) + 1e-6);
      expect(positions[tip][2]).toBeGreaterThanOrEqual(Math.min(...below) - 1e-6);
      expect(Math.abs(positions[tip][2])).toBeLessThan(1e-3);
      // Mirror images: the two layers of the tip (and the whole point) stay symmetric.
      positions.forEach(([x, y, z], v) => {
        const [mx, my, mz] = positions[mirrorOf[v]];
        expect(Math.hypot(x - mx, y - my, z + mz)).toBeLessThan(1e-3);
      });
    }
    // And it really travels: the tip ends far from where it began.
    expect(length(sub(frames[SAMPLES][tip], start[tip]))).toBeGreaterThan(0.3);
  });

  it("moves smoothly: no face jumps between neighbouring samples", () => {
    const { frames } = run();
    for (let k = 1; k < frames.length; k++) {
      frames[k].forEach((p, v) => {
        expect(length(sub(p, frames[k - 1][v]))).toBeLessThan(0.06);
      });
    }
  });

  it("holds every earlier Fold: creases from earlier Steps keep their angles throughout", () => {
    const { mesh, frames } = run();
    const earlier = mesh.hinges.filter((h) => h.kind === "crease" && !h.driven);
    expect(earlier.length).toBeGreaterThan(0);
    for (const positions of frames) {
      for (const h of earlier) {
        const angle = dihedral(positions, h);
        expect(Math.abs(angle - h.start)).toBeLessThan((10 * Math.PI) / 180);
      }
    }
  });

  // A spring-back follows a miss: the finger let go part way (past halfway at
  // most; a push past that is a match and the Fold finishes). From there the
  // paper is run back to 0, the way it came.
  it.each([0.3, 0.55, 0.8])("springs back: progress run back to 0 from %f returns the starting state", (turn) => {
    const motion = motionOf(before, after);
    const { mesh } = motion;
    const steps = Math.round(turn * SAMPLES);
    for (let k = 1; k <= steps; k++) motion.at(samples[k]);
    for (let k = steps - 1; k > 0; k--) motion.at(samples[k]);
    const back = motion.at(0);
    // Back where it began, to within half a percent of the paper's width.
    back.forEach((p, v) => expect(length(sub(p, mesh.start[v]))).toBeLessThan(5e-3));
  });
});
