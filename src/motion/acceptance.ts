// The acceptance tests every recorded Fold must pass (ticket 10), shared by
// the inside reverse and the squash: run on what his finger plays, not on
// the live physics. The Recording is made once (record.ts, the physics run
// forward) and sampled through playback.ts at twice the snapshot rate, so
// every other sample lies halfway between two snapshots, where the blend is
// furthest from anything the solver produced. Test-only: imported by the
// *.test.ts files, never by the page.

import { expect, it } from "vitest";
import { signedArea } from "../engine/geometry";
import type { Lift, Paper } from "../engine/paper";
import { dihedral } from "./hinge";
import { buildMesh, type Mesh } from "./mesh";
import { playbackOf, type Playback } from "./playback";
import { FRAMES, record } from "./record";
import { PRECISION } from "./recording";
import { cross, dot, length, sub, type V3 } from "./vec3";

export interface RecordedCase {
  before: Paper;
  after: Paper;
  lift?: Lift;
}

/** Twice the snapshot rate: samples 0, 2, 4, ... are snapshots; 1, 3, 5, ... lie halfway between two. */
export const SAMPLES = 2 * (FRAMES - 1);
export const samples = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);

export interface Sampled {
  mesh: Mesh;
  play: Playback;
  /** The paper at every sample. */
  frames: V3[][];
}

/** The Fold recorded once and played back at every sample; made on first use and shared by the tests. */
export function sampled(step: RecordedCase): () => Sampled {
  let shared: Sampled | undefined;
  return () => {
    if (!shared) {
      const mesh = buildMesh(step.before, step.after, step.lift);
      const play = playbackOf(record(step.before, step.after, step.lift));
      expect(play.frameCount).toBe(FRAMES);
      shared = { mesh, play, frames: samples.map((p) => toV3s(play.at(p))) };
    }
    return shared;
  };
}

export function toV3s(flat: ArrayLike<number>): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]]);
  return out;
}

export const r = (n: number) => Math.round(n * 1e6) / 1e6 + 0;

/** Rounded to PRECISION, a coordinate is at most half of it from the engine's; the Float32 blend adds a little. */
export const EXACT = PRECISION / 2 + 1e-7;

/** The largest difference between two positions, coordinate by coordinate. */
export const apart = (a: V3, b: V3) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

/** The three corners of a mesh triangle. */
export const corners = (mesh: Mesh, positions: V3[], t: number) => mesh.triangles[t].map((v) => positions[v]) as [V3, V3, V3];

export const normalOf = ([a, b, c]: [V3, V3, V3]) => cross(sub(b, a), sub(c, a));

/** Do two triangles that share no vertex cut through each other? Lying flat together doesn't count. */
export function trianglesCross(a: [V3, V3, V3], b: [V3, V3, V3]): boolean {
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
export function layerOrderHolds(mesh: Mesh, positions: V3[], paper: Paper, faceOf: (meshFace: number) => number) {
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

/** The acceptance tests a Recording may be known to fail, by name. */
export type AcceptanceTest = "finish" | "stretch" | "crossing" | "smooth" | "earlier";

/**
 * Ticket 10's acceptance tests on a Recording, registered inside the
 * caller's `describe`: right start and finish with layer order, no
 * stretching (1%), no passing through, smooth, earlier Folds hold, and
 * spring-back. `largestStep` is the most a vertex may move between two
 * neighbouring samples. `knownFailures` names the tests a Recording is
 * known to fail, each with the reason: those are registered as expected
 * failures (they must still fail; their limits are never loosened), so the
 * suite stays green while the failure stays on record.
 */
export function recordedFoldTests(
  step: RecordedCase,
  run: () => Sampled,
  { largestStep = 0.015, knownFailures = {} as Partial<Record<AcceptanceTest, string>> } = {},
) {
  const { before, after, lift } = step;
  // A first Step (the Paper still uncreased) has no earlier Folds to hold.
  const firstStep = before.graph.edges_assignment.every((a) => a === "B");
  const test = (key: AcceptanceTest, name: string, body: () => void) => {
    const reason = knownFailures[key];
    if (reason) it.fails(`${name} (known failure: ${reason})`, body);
    else if (key === "earlier" && firstStep) it.skip(`${name} (a first Step: none to hold)`, body);
    else it(name, body);
  };

  it("records the mesh it was made from", () => {
    const { mesh, play } = run();
    expect(play.vertexCount).toBe(mesh.start.length);
    expect(play.recording.paperVertexCount).toBe(mesh.paperVertexCount);
    expect(play.recording.triangles).toEqual(mesh.triangles.flat());
    expect(play.recording.triangleFace).toEqual(mesh.triangleFace);
    expect(play.recording.edges).toEqual(mesh.edges);
    expect(play.recording.view).toEqual(after.view);
  });

  it(lift ? "starts as the current Paper with the flap standing, in its layer order" : "starts as the current Paper, in its layer order", () => {
    const { mesh, play, frames } = run();
    const first = toV3s(play.frame(0));
    mesh.start.forEach((p, v) => {
      expect(apart(first[v], p)).toBeLessThanOrEqual(PRECISION / 2);
      expect(apart(frames[0][v], p)).toBeLessThanOrEqual(EXACT);
    });
    expect(layerOrderHolds(mesh, frames[0], before, (f) => mesh.faceBefore[f])).toBe(true);
  });

  test("finish", "finishes as the engine's finished Paper, in its layer order", () => {
    const { mesh, play, frames } = run();
    const last = toV3s(play.frame(play.frameCount - 1));
    mesh.end.forEach((p, v) => {
      expect(apart(last[v], p)).toBeLessThanOrEqual(PRECISION / 2);
      expect(apart(frames[SAMPLES][v], p)).toBeLessThanOrEqual(EXACT);
    });
    expect(layerOrderHolds(mesh, frames[SAMPLES], after, (f) => f)).toBe(true);
    // The physics really arrived there: the snapshot before the last is already close.
    toV3s(play.frame(play.frameCount - 2)).forEach((p, v) => {
      expect(Math.hypot(p[0] - mesh.end[v][0], p[1] - mesh.end[v][1])).toBeLessThan(0.02);
    });
  });

  test("stretch", "never stretches: every edge length and face area stays within 1% of the flat paper's", () => {
    const { mesh, frames } = run();
    const flatArea = after.graph.faces_vertices.map((loop) =>
      Math.abs(signedArea(loop.map((v) => after.graph.vertices_coords[v]))),
    );
    let worstBar = 0;
    let worstArea = 0;
    for (const positions of frames) {
      for (const [u, v, rest] of mesh.bars) {
        worstBar = Math.max(worstBar, Math.abs(length(sub(positions[u], positions[v])) / rest - 1));
      }
      const area = flatArea.map(() => 0);
      mesh.triangles.forEach((_, t) => {
        area[mesh.triangleFace[t]] += length(normalOf(corners(mesh, positions, t))) / 2;
      });
      area.forEach((a, f) => (worstArea = Math.max(worstArea, Math.abs(a / flatArea[f] - 1))));
    }
    console.log(`stretch: bars within ${(worstBar * 100).toFixed(2)}%, face areas within ${(worstArea * 100).toFixed(2)}%`);
    expect(worstBar).toBeLessThan(0.01);
    expect(worstArea).toBeLessThan(0.01);
  });

  test("crossing", "never passes through itself: no two faces intersect at any sample", () => {
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

  test("smooth", "moves smoothly: no face jumps between neighbouring samples", () => {
    const { frames } = run();
    let largest = 0;
    for (let k = 1; k < frames.length; k++) {
      frames[k].forEach((p, v) => (largest = Math.max(largest, length(sub(p, frames[k - 1][v])))));
    }
    console.log(`smooth: largest move between samples ${largest.toFixed(4)}`);
    expect(largest).toBeLessThan(largestStep);
  });

  test("earlier", "holds every earlier Fold: creases from earlier Steps keep their angles throughout", () => {
    const { mesh, frames } = run();
    const earlier = mesh.hinges.filter((h) => h.kind === "crease" && !h.driven);
    expect(earlier.length).toBeGreaterThan(0);
    let worst = 0;
    for (const positions of frames) {
      for (const h of earlier) worst = Math.max(worst, Math.abs(dihedral(positions, h) - h.start));
    }
    console.log(`earlier creases within ${((worst * 180) / Math.PI).toFixed(1)}°`);
    expect(worst).toBeLessThan((10 * Math.PI) / 180);
  });

  // A spring-back follows a miss: the finger let go part way (past halfway at
  // most; a push past that is a match and the Fold finishes). From there the
  // Recording is played back to 0, the way it came.
  it.each([0.3, 0.55, 0.8])("springs back: played back to 0 from %f, the paper returns to the starting state the way it came", (turn) => {
    const { mesh, play, frames } = run();
    const steps = Math.round(turn * SAMPLES);
    for (let k = steps - 1; k > 0; k--) {
      // The same shape going back as coming, at every sample.
      toV3s(play.at(samples[k])).forEach((p, v) => expect(length(sub(p, frames[k][v]))).toBe(0));
    }
    const back = toV3s(play.at(0));
    back.forEach((p, v) => expect(apart(p, mesh.start[v])).toBeLessThanOrEqual(EXACT));
  });
}
