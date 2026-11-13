// The solver for the bar-and-hinge mesh: extended position-based dynamics
// (Macklin, Müller, Chentanez 2016), run quasi-statically. Each pass, every
// constraint works out the move that would satisfy it, and the moves are
// averaged per vertex and applied together (Jacobi style), so a symmetric
// Fold stays symmetric: no constraint goes first. A compliance gives soft
// constraints their stiffness independent of the pass count. Bars are
// rigid; hinges are springs on their fold angle; contacts keep every vertex
// a layer's gap away from any face it is not part of, so touching layers
// never pass through each other (which the original bar-and-hinge model
// doesn't handle). No time, no inertia: the paper is always at rest where
// the hand holds it.

import { dihedral, dihedralGradient, type Hinge } from "./hinge";
import { LAYER_GAP, type Mesh } from "./mesh";
import { cross, dot, length, sub, type V3 } from "./vec3";

// Compliances (inverse stiffnesses) of the hinges, per unit of edge length.
// The scale to read them against: a hinge's own gradient term is about
// 1/height², some 100 to 1000 here, and a compliance well below that is hard.
export const tuning = {
  /** A crease, driven or holding: hard. */
  creaseCompliance: 0.002,
  /** A facet (inside a face): soft enough to bend before a crease gives, stiff enough to flatten again. */
  facetCompliance: 10,
  /** A facet while the paper is pressed flat at rest (the start or the end of the Fold, both flat-folded). */
  pressedFacetCompliance: 0.05,
  /**
   * A folded crease that turns inside out during the Fold (the spine of a
   * reversed tip): the paper around it turns it, not the hand.
   */
  insideOutCompliance: 0.002,
  /** The most a hinge is turned in one pass: its correction is linearised, so no wild steps. */
  maxTurn: 0.3,
  /** How much of the averaged move a vertex takes each pass. */
  relaxation: 1,
  /** Bar passes per hinge pass: bars are cheap and must end up exact. */
  barPasses: 30,
  barRelaxation: 1,
  /** The largest change of progress taken in one solver step. */
  step: 0.01,
  /** Passes per step. */
  passes: 120,
  /** Extra passes at the ends, where the paper must come fully to rest. */
  settlePasses: 400,
  /** Passes between fresh searches for touching vertices and faces. */
  contactRefresh: 20,
  /** Whether touching layers are kept apart at all (off only to see what the contacts do). */
  contacts: true,
  /** Whether a rigid Fold's faces (mesh.rigid) are kept stiff throughout (off only to see what that does). */
  rigidFaces: true,
};

const turnsInsideOut = (h: Hinge) => h.driven && Math.abs(h.start) > 1 && Math.abs(h.end) > 1;

function complianceOf(h: Hinge, pressed: boolean): number {
  const facet = pressed ? tuning.pressedFacetCompliance : tuning.facetCompliance;
  const base = h.kind === "facet" ? facet : turnsInsideOut(h) ? tuning.insideOutCompliance : tuning.creaseCompliance;
  return base / h.restLength;
}

export interface Contact {
  vertex: number;
  triangle: number;
  /** Which side of the face the vertex is on: +1 along its front normal. */
  side: 1 | -1;
}

export interface State {
  positions: V3[];
  /** Each hinge's last measured angle, unwrapped, so a folded-flat crease never flips sign. */
  angles: number[];
}

export function initialState(mesh: Mesh): State {
  return { positions: mesh.start.map((p) => [...p] as V3), angles: mesh.hinges.map((h) => h.start) };
}

/** The angle a hinge is driven to at progress p: along its own path if it has one, else straight from start to end. */
export const angleAt = (hinge: Hinge, p: number): number => (hinge.path ? hinge.path(p) : hinge.start + (hinge.end - hinge.start) * p);

/** Unwrap a freshly measured angle to the turn nearest the last one. */
function unwrap(measured: number, last: number): number {
  return measured + 2 * Math.PI * Math.round((last - measured) / (2 * Math.PI));
}

/**
 * Vertex-face pairs close enough to touch: the vertex over the face, within
 * a few layer gaps of it, and not one of its own corners. Found once per
 * step; the side is remembered so a vertex is pushed back the way it came.
 */
export function findContacts(mesh: Mesh, positions: V3[]): Contact[] {
  const contacts: Contact[] = [];
  const reach = LAYER_GAP * 3;
  mesh.triangles.forEach((tri, t) => {
    const [p, q, r] = tri.map((i) => positions[i]);
    const n = cross(sub(q, p), sub(r, p));
    const nl = length(n);
    if (nl < 1e-12) return;
    const unitN: V3 = [n[0] / nl, n[1] / nl, n[2] / nl];
    positions.forEach((x, v) => {
      if (tri.includes(v)) return;
      const d = dot(sub(x, p), unitN);
      if (Math.abs(d) >= reach || d === 0) return;
      const bary = barycentric(p, q, r, unitN, x);
      if (bary.some((w) => w < -0.02)) return;
      contacts.push({ vertex: v, triangle: t, side: d > 0 ? 1 : -1 });
    });
  });
  return contacts;
}

function barycentric(p: V3, q: V3, r: V3, n: V3, x: V3): [number, number, number] {
  const area = dot(cross(sub(q, p), sub(r, p)), n);
  const wp = dot(cross(sub(q, x), sub(r, x)), n) / area;
  const wq = dot(cross(sub(r, x), sub(p, x)), n) / area;
  return [wp, wq, 1 - wp - wq];
}

/**
 * Relax the mesh toward rest with every hinge driven to `target(h)`, running
 * `passes` over all the constraints. `pressed` is the hand pressing the paper
 * flat where it comes to rest at either end of the Fold.
 */
export function relax(
  mesh: Mesh,
  state: State,
  target: (hinge: Hinge, index: number) => number,
  passes: number,
  pressed = false,
): void {
  const { positions } = state;
  const count = positions.length;
  const w = mesh.pinned.map((pinned) => (pinned ? 0 : 1));
  const touching = () => (tuning.contacts ? findContacts(mesh, positions) : []);
  let contacts = touching();
  const lambda = mesh.hinges.map(() => 0);
  const compliance = mesh.hinges.map((h) => complianceOf(h, pressed || (mesh.rigid && tuning.rigidFaces)));

  // Moves asked of each vertex in the current sub-pass, and how many constraints asked.
  const delta: V3[] = positions.map(() => [0, 0, 0]);
  const asks = new Array<number>(count).fill(0);
  const ask = (i: number, g: V3, k: number) => {
    if (w[i] === 0) return;
    delta[i][0] += g[0] * k;
    delta[i][1] += g[1] * k;
    delta[i][2] += g[2] * k;
    asks[i]++;
  };
  const apply = (relaxation = tuning.relaxation) => {
    for (let i = 0; i < count; i++) {
      if (asks[i] === 0) continue;
      const k = relaxation / asks[i];
      positions[i][0] += delta[i][0] * k;
      positions[i][1] += delta[i][1] * k;
      positions[i][2] += delta[i][2] * k;
      delta[i][0] = delta[i][1] = delta[i][2] = 0;
      asks[i] = 0;
    }
  };

  const bar = (u: number, v: number, rest: number) => {
    const wsum = w[u] + w[v];
    if (wsum === 0) return;
    const d = sub(positions[v], positions[u]);
    const len = length(d);
    if (len < 1e-12) return;
    const k = (len - rest) / (len * wsum);
    ask(u, d, w[u] * k);
    ask(v, d, -w[v] * k);
  };

  const hinge = (h: Hinge, i: number) => {
    const measured = unwrap(dihedral(positions, h), state.angles[i]);
    state.angles[i] = measured;
    const c = Math.max(-tuning.maxTurn, Math.min(tuning.maxTurn, measured - target(h, i)));
    const grads = dihedralGradient(positions, h);
    const ids = [h.edge[0], h.edge[1], h.apex[0], h.apex[1]];
    let denominator = compliance[i];
    grads.forEach((g, j) => (denominator += w[ids[j]] * dot(g, g)));
    if (!(denominator > 1e-12)) return;
    const dl = (-c - compliance[i] * lambda[i]) / denominator;
    lambda[i] += dl;
    grads.forEach((g, j) => ask(ids[j], g, w[ids[j]] * dl));
  };

  const contact = ({ vertex, triangle, side }: Contact) => {
    const [ip, iq, ir] = mesh.triangles[triangle];
    const p = positions[ip];
    const n = cross(sub(positions[iq], p), sub(positions[ir], p));
    const nl = length(n);
    if (nl < 1e-12) return;
    const unitN: V3 = [n[0] / nl, n[1] / nl, n[2] / nl];
    const x = positions[vertex];
    const c = side * dot(sub(x, p), unitN) - LAYER_GAP;
    if (c >= 0) return;
    const bary = barycentric(p, positions[iq], positions[ir], unitN, x);
    const denominator = w[vertex] + w[ip] * bary[0] ** 2 + w[iq] * bary[1] ** 2 + w[ir] * bary[2] ** 2;
    if (denominator < 1e-12) return;
    const dl = -c / denominator;
    ask(vertex, unitN, side * w[vertex] * dl);
    ask(ip, unitN, -side * w[ip] * bary[0] * dl);
    ask(iq, unitN, -side * w[iq] * bary[1] * dl);
    ask(ir, unitN, -side * w[ir] * bary[2] * dl);
  };

  for (let pass = 0; pass < passes; pass++) {
    if (pass > 0 && pass % tuning.contactRefresh === 0) contacts = touching();
    mesh.hinges.forEach(hinge);
    apply();
    for (const c of contacts) contact(c);
    apply();
    // Bars last, so the paper handed back is as unstretched as the pass can make it.
    for (let k = 0; k < tuning.barPasses; k++) {
      for (const [u, v, rest] of mesh.bars) bar(u, v, rest);
      apply(tuning.barRelaxation);
    }
  }
}
