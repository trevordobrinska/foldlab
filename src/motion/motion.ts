// The paper in motion for one Fold: real paper physics, one Fold at a time.
// Given the Paper as it is now and the Paper the engine says the Fold ends
// at, `motionOf` gives the paper's 3D shape at any progress from 0 to 1. Only
// this Fold's creases are driven; every earlier crease holds its angle, and
// layers that touch never pass through each other. The paper finds its own
// path by a bar-and-hinge model (mesh.ts) brought to rest at each progress
// (solve.ts), so the shape at a progress depends on the way there: progress
// is stepped a little at a time, forward or back, like a finger pushing.
//
// Positions are in the engine's folded frame: x and y as the Paper lies
// flat-folded, z toward the root face's front; `after.view` maps x and y to
// what he sees.

import type { Paper } from "../engine/paper";
import { buildMesh, type Mesh } from "./mesh";
import { angleAt, initialState, relax, tuning, type State } from "./solve";
import type { V3 } from "./vec3";

export { dihedral, type Hinge } from "./hinge";
export { LAYER_GAP, type Mesh, type PaperEdge } from "./mesh";

export interface Motion {
  readonly mesh: Mesh;
  /** The paper's shape at `progress` (0 = the Paper now, 1 = the Fold made). Clamped to 0..1. */
  at(progress: number): V3[];
}

export function motionOf(before: Paper, after: Paper): Motion {
  const mesh = buildMesh(before, after);
  const state: State = initialState(mesh);
  let progress = 0;
  /** True when the paper has been brought to rest at the current progress (an end). */
  let settled = true;

  const target = (p: number) => (hinge: Mesh["hinges"][number]) => angleAt(hinge, p);

  return {
    mesh,
    at(wanted) {
      const to = Math.min(1, Math.max(0, wanted));
      while (progress !== to) {
        const step = Math.sign(to - progress) * Math.min(tuning.step, Math.abs(to - progress));
        progress += step;
        if (Math.abs(progress - to) < 1e-12) progress = to;
        relax(mesh, state, target(progress), tuning.passes);
        settled = false;
      }
      // At either end the paper comes to rest, pressed flat by the hand: once, on arriving.
      if ((to === 0 || to === 1) && !settled) {
        relax(mesh, state, target(to), tuning.settlePasses, true);
        settled = true;
      }
      return state.positions.map((p) => [...p] as V3);
    },
  };
}
