// The inside reverse on real paper: the engine's Paper (ticket 03) folded
// through its earlier Steps, the Fold the engine says comes next, and the
// physics (src/motion) that moves the paper between the two. Pure and
// DOM-free, like geometry.ts, which still holds the canned squash and sink.
//
// The scene is a square folded in half along its diagonal (an earlier Step),
// then the corner at the end of the spine reversed in between the two
// layers, so its head comes out across the top edge. The physics frame is
// the engine's folded frame; here it is placed on the table like the canned
// scenes: x to the right as he sees it, y up off the table, z toward him.

import { apply, determinant } from "../src/engine/geometry";
import { fold, insideReverse, newPaper, rotate, type FoldResult, type Paper } from "../src/engine/paper";
import { motionOf, type Motion } from "../src/motion/motion";
import type { V3 } from "../src/motion/vec3";
import type { Face, FoldModel, Segment, V3 as World } from "./geometry";

const v = (x: number, y: number, z: number): World => ({ x, y, z });

function folded(result: FoldResult): Paper {
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return result.paper;
}

const before = folded(fold(newPaper(), { line: { origin: [0, 0], vector: [1, 1] }, flap: [0.9, 0.1], assignment: "V" }));
// Then turned on the table (a Step, not a Fold) so the tip's travel comes straight down the screen.
const after = rotate(folded(insideReverse(before, { line: { origin: [0.6, 0.6], vector: [0.1, 0.4] }, tip: [0.95, 0.95] })), 104);

let motion: Motion | undefined;
let lastProgress = 0;
function theMotion(): Motion {
  return (motion ??= motionOf(before, after));
}

/** The paper at `progress`. "Again" after a finished Fold starts afresh from the Paper; it doesn't unfold. */
function positionsAt(progress: number): V3[] {
  if (progress === 0 && lastProgress === 1) motion = undefined;
  lastProgress = progress;
  return theMotion().at(progress);
}

const facing = Math.sign(determinant(after.view));
/** How high the middle of the stack sits above the table. */
const LIFT = 0.01;

/** The middle of the tip's travel as he sees it, put at the world's origin so the camera looks straight at it. */
const centre = (() => {
  const { mesh } = theMotion();
  const tip = tipVertex();
  const [x0, y0] = apply(after.view, [mesh.start[tip][0], mesh.start[tip][1]]);
  const [x1, y1] = apply(after.view, [mesh.end[tip][0], mesh.end[tip][1]]);
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
})();

/** A physics-frame point placed in the world as he sees the Paper. */
function toWorld([x, y, z]: V3): World {
  const [sx, sy] = apply(after.view, [x, y]);
  return v(sx - centre.x, facing * z + LIFT, -(sy - centre.y));
}

/** The mesh vertex of the point's tip: the Paper vertex this Fold carries furthest. */
function tipVertex(): number {
  const { mesh } = theMotion();
  let best = 0;
  let far = -1;
  for (let i = 0; i < mesh.paperVertexCount; i++) {
    const d = Math.hypot(mesh.start[i][0] - mesh.end[i][0], mesh.start[i][1] - mesh.end[i][1]);
    if (d > far) {
      far = d;
      best = i;
    }
  }
  return best;
}

/** The paper at `progress`, as faces and lines for the view. */
export function insideReverseModel(progress: number): FoldModel {
  const positions = positionsAt(progress);
  const { mesh } = theMotion();
  const world = positions.map(toWorld);
  const faces: Face[] = mesh.triangles.map((tri) => ({ points: tri.map((i) => world[i]) }));
  const lines: Segment[] = [];
  for (const edge of mesh.edges) {
    // A paper edge is solid, as is a crease folded flat; a crease being made is dashed until it is.
    const made = edge.folded || progress >= 0.97;
    const style: Segment["style"] = edge.assignment === "B" || made ? "edge" : "crease";
    for (let i = 1; i < edge.chain.length; i++) {
      lines.push({ from: world[edge.chain[i - 1]], to: world[edge.chain[i]], style });
    }
  }
  return { faces, lines };
}

/** Where the tip is at `progress`: the point the finger holds. */
export function insideReverseAnchor(progress: number): World {
  const tip = tipVertex();
  if (progress <= 0) return toWorld(theMotion().mesh.start[tip]);
  if (progress >= 1) return toWorld(theMotion().mesh.end[tip]);
  return toWorld(positionsAt(progress)[tip]);
}
