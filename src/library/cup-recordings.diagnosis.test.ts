// Ticket 14's reproduction: why the cup's Recordings of Steps 2 to 4 failed
// ticket 10's acceptance tests. Two faults were found:
//
// A. FIXED under ticket 14. The plain Fold's turn (record.ts, `turn`) was
//    about a line at the flap's own mean height with the crease's vertices
//    left where they lay, so the turned flap came down inside the stack it
//    should land on, and its layers crossed at the fold line from just past
//    upright. The tests below that pinned it now hold it fixed.
// B. OPEN, ticket 15. The layered layout (mesh.ts, `layeredLayout`) puts a
//    vertex at the mean height of the faces around it, which lets vertices at
//    one folded point sit at different heights once a face there has been cut
//    by a new crease: Step 4's start and end layouts have faces crossing
//    before anything moves. Pinned here as expected failures, to be turned
//    into plain tests by whoever fixes it (library.test.ts keeps the
//    acceptance failures that follow from it on record).
//
// The report behind the ticket's numbers prints with:
//
//   T14_REPORT=1 npx vitest run src/library/cup-recordings.diagnosis.test.ts --disable-console-intercept
//
// (T14_ONLY=S2F1,S4F1 narrows it; T14_DETAIL=1 adds one crossing triangle
// pair per face pair in the layouts.) Test-only: never imported by the page.

import { describe, expect, it } from "vitest";
import { determinant } from "../engine/geometry";
import { newPaper, seenFaces, type Paper } from "../engine/paper";
import { replay } from "../model/build";
import type { FoldCall } from "../model/model";
import { corners, layerOrderHolds, toV3s, trianglesCross } from "../motion/acceptance";
import { buildMesh, LAYER_GAP, type Mesh } from "../motion/mesh";
import { playbackOf } from "../motion/playback";
import { FRAMES, record } from "../motion/record";
import { length, sub, type V3 } from "../motion/vec3";
import { cupRecipe } from "./recipes";

/** A snapshot a few degrees short of flat (before ticket 14's fix, the last of the turn, with the flap lying inside the stack). */
const NEARLY_DOWN = FRAMES - 1 - 4;

function folded(paper: Paper, call: FoldCall): Paper {
  const result = replay(paper, call);
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return result.paper;
}

const cases: { name: string; before: Paper; after: Paper }[] = [];
{
  let paper = newPaper();
  let beforeLastStep = paper;
  cupRecipe.steps.forEach((step, s) => {
    beforeLastStep = paper;
    step.folds.forEach((call, f) => {
      const after = folded(paper, call);
      cases.push({ name: `S${s + 1}F${f + 1}`, before: paper, after });
      paper = after;
    });
  });
  const [front, back] = cupRecipe.steps[3].folds;
  const backFirst = folded(beforeLastStep, back);
  cases.push({ name: "S4F2first", before: beforeLastStep, after: backFirst });
  cases.push({ name: "S4F1second", before: backFirst, after: folded(backFirst, front) });
}
const caseNamed = (name: string) => cases.find((c) => c.name === name)!;

/** The face pairs with triangles cutting through each other, as "f x g", each with its triangle pairs. */
function crossings(mesh: Mesh, positions: V3[]): Map<string, [number, number][]> {
  const share = (a: number, b: number) => mesh.triangles[a].some((v) => mesh.triangles[b].includes(v));
  const pairs = new Map<string, [number, number][]>();
  for (let a = 0; a < mesh.triangles.length; a++) {
    for (let b = a + 1; b < mesh.triangles.length; b++) {
      if (share(a, b)) continue;
      if (!trianglesCross(corners(mesh, positions, a), corners(mesh, positions, b))) continue;
      const key = `${mesh.triangleFace[a]}x${mesh.triangleFace[b]}`;
      pairs.set(key, [...(pairs.get(key) ?? []), [a, b]]);
    }
  }
  return pairs;
}

const snapshots = (c: { before: Paper; after: Paper }): V3[][] => {
  const play = playbackOf(record(c.before, c.after));
  return Array.from({ length: FRAMES }, (_, k) => toV3s(play.frame(k)));
};

describe("ticket 14, fault A (fixed): a plain Fold of a stack lands the flap on the stack, not inside it", () => {
  // Before the fix, Step 2 at this snapshot had the flap's layers at -0.5 and +0.5 gaps, the very heights
  // of the two layers they should be lying on, and the last snapshots dragged them through to +0.5 and +1.5.
  it.each(["S2F1", "S3F1"])("%s: nearly down, the flap is already over the paper it lands on, in the finished layer order", (name) => {
    const c = caseNamed(name);
    const mesh = buildMesh(c.before, c.after);
    expect(layerOrderHolds(mesh, snapshots(c)[NEARLY_DOWN], c.after, (f) => f)).toBe(true);
  });

  it.each(["S2F1", "S3F1"])("%s: no faces cross at any snapshot", (name) => {
    const c = caseNamed(name);
    const mesh = buildMesh(c.before, c.after);
    snapshots(c).forEach((positions, k) => expect([...crossings(mesh, positions).keys()], `snapshot ${k}`).toEqual([]));
  });

  it("the layouts at either end of Steps 2 and 3 are sound", () => {
    for (const name of ["S2F1", "S3F1"]) {
      const c = caseNamed(name);
      const mesh = buildMesh(c.before, c.after);
      expect([...crossings(mesh, mesh.start).keys()], `${name} start`).toEqual([]);
      expect([...crossings(mesh, mesh.end).keys()], `${name} end`).toEqual([]);
    }
  });
});

describe("ticket 14, fault B (ticket 15): Step 4's layouts have faces crossing before anything moves", () => {
  it.fails.each(["S4F1", "S4F2", "S4F2first", "S4F1second"])("%s: no faces cross in the mesh's own start and end layouts (known failure: waiting on ticket 15)", (name) => {
    const c = caseNamed(name);
    const mesh = buildMesh(c.before, c.after);
    expect([...crossings(mesh, mesh.start).keys()], "start").toEqual([]);
    expect([...crossings(mesh, mesh.end).keys()], "end").toEqual([]);
  });

  it("the engine's finished Step 4 has the front flap on top of both corners and the back flap beneath everything", () => {
    const { after } = caseNamed("S4F2");
    const layers = seenFaces(after).map((face) => face.layer);
    // Faces 0 to 3 are the two corner flaps (two layers each), 4 the front flap, 5 the back flap.
    expect(layers).toEqual([3, 4, 5, 6, 7, 0, 2, 1]);
  });
});

// ---------------------------------------------------------------------------
// The report, printed on request.

const f4 = (n: number) => n.toFixed(4);
/** A height in layer gaps. */
const gaps = (z: number) => (z / LAYER_GAP).toFixed(2);

function worstBar(mesh: Mesh, positions: V3[]) {
  let worst = 0;
  let bar = "";
  for (const [u, v, rest] of mesh.bars) {
    const stretch = Math.abs(length(sub(positions[u], positions[v])) / rest - 1);
    if (stretch > worst) {
      worst = stretch;
      bar = `${u}-${v}, ${f4(rest)} long`;
    }
  }
  return { worst, bar };
}

const ranges = (ks: number[]) => {
  const out: string[] = [];
  let [a, b] = [ks[0], ks[0]];
  for (const k of [...ks.slice(1), Infinity]) {
    if (k === b + 1) b = k;
    else {
      out.push(a === b ? `${a}` : `${a}-${b}`);
      a = b = k;
    }
  }
  return out.join(",");
};

/** Over a run of snapshots: the worst bar and where, and each crossing face pair with the snapshots it crosses at. */
function summarise(mesh: Mesh, frames: V3[][], label: string) {
  const spans = new Map<string, number[]>();
  let worst = { worst: 0, bar: "", k: 0 };
  frames.forEach((positions, k) => {
    for (const key of crossings(mesh, positions).keys()) spans.set(key, [...(spans.get(key) ?? []), k]);
    const w = worstBar(mesh, positions);
    if (w.worst > worst.worst) worst = { ...w, k };
  });
  console.log(`  [${label}] worst bar ${(worst.worst * 100).toFixed(2)}% at snapshot ${worst.k} (${worst.bar}); faces crossing, by snapshot:`);
  if (!spans.size) console.log("     none");
  for (const [key, ks] of spans) console.log(`     ${key}: ${ranges(ks)}`);
}

const only = process.env.T14_ONLY?.split(",");

describe.runIf(process.env.T14_REPORT)("ticket 14: the report", { timeout: 120000 }, () => {
  it.each(cases.filter((c) => !only || only.includes(c.name)))("$name", (c) => {
    const mesh = buildMesh(c.before, c.after);
    const before = seenFaces(c.before).map((face) => face.layer);
    const after = seenFaces(c.after).map((face) => face.layer);
    const n = mesh.paperVertexCount;
    const facing = Math.sign(determinant(c.after.view));
    const height = (p: V3) => gaps(facing * p[2]);
    console.log(`\n===== ${c.name}: ${after.length} faces, ${mesh.start.length} vertices, ${mesh.triangles.length} triangles (heights in layer gaps, toward him positive)`);
    after.forEach((layer, f) => {
      const [s, e] = [mesh.start[n + f], mesh.end[n + f]];
      const moves = Math.hypot(s[0] - e[0], s[1] - e[1]) > 1e-9;
      console.log(`  face ${f} (was ${mesh.faceBefore[f]}) [${c.after.graph.faces_vertices[f]}] layer ${before[mesh.faceBefore[f]]} -> ${layer} ${moves ? "MOVES" : "stays"}; centre height ${height(s)} -> ${height(e)}`);
    });
    for (let v = 0; v < n; v++) {
      const faces = [...new Set(mesh.triangles.flatMap((t, i) => (t.includes(v) ? [mesh.triangleFace[i]] : [])))];
      console.log(`  vertex ${v} at (${f4(mesh.start[v][0])}, ${f4(mesh.start[v][1])}) height ${height(mesh.start[v])} -> ${height(mesh.end[v])}, faces ${faces}`);
    }
    const creaseVertices = [...new Set(mesh.hinges.filter((h) => h.kind === "crease" && h.driven).flatMap((h) => h.edge))];
    console.log(`  this Fold's crease vertices: ${creaseVertices.map((v) => `${v} at ${height(mesh.start[v])} -> ${height(mesh.end[v])}`).join(", ")}`);

    const frames = snapshots(c);
    for (const k of [0, 50, 90, 96, 98, 100, 101, 102, 103, 104]) {
      console.log(`  snapshot ${k}: face centre heights ${after.map((_, f) => `${f}:${height(frames[k][n + f])}`).join(" ")}`);
    }
    summarise(mesh, frames, "the Recording");
    summarise(mesh, [mesh.start], "start layout alone");
    summarise(mesh, [mesh.end], "end layout alone");
    if (process.env.T14_DETAIL) {
      for (const [label, positions] of [["start", mesh.start], ["end", mesh.end]] as const) {
        for (const [key, list] of crossings(mesh, positions)) {
          const show = (t: number) => mesh.triangles[t].map((v) => `${v} (${f4(positions[v][0])}, ${f4(positions[v][1])}) at ${height(positions[v])}`).join("; ");
          console.log(`  ${label} layout, faces ${key} (${list.length} triangle pairs), e.g. [${show(list[0][0])}] x [${show(list[0][1])}]`);
        }
      }
    }
  });
});
