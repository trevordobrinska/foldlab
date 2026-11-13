// Real paper, played from its Recordings: for each recorded Fold the
// engine's Paper (ticket 03) folded through its earlier Steps and the Fold
// the engine says comes next were worked out once by the physics
// (src/motion) on the computer (`npm run record`, from papers.ts) and
// written to recordings/*.json. Here his finger only plays that back
// (src/motion/playback.ts), so this page carries no physics and no engine.
// Pure and DOM-free, like geometry.ts, which still holds the canned sink.
//
// The recording's frame is the engine's folded frame; here it is placed on
// the table like the canned scene: x to the right as he sees it, y up off
// the table, z toward him.
//
// Inside reverse: a square folded in half along its diagonal (an earlier
// Step), then the corner at the end of the spine reversed in between the two
// layers, so its head comes out across the top edge.
//
// Squash: a square folded in half along its diagonal, the triangle folded in
// half again, then the top flap, lifted to stand on its hinge line, pressed
// flat so its spine lies along the line and it spreads into a square.

import { apply, determinant } from "../src/engine/geometry";
import { playbackOf } from "../src/motion/playback";
import type { Recording } from "../src/motion/recording";
import type { Face, FoldModel, Segment, V3 as World } from "./geometry";
import insideReverseData from "./recordings/inside-reverse.json";
import squashData from "./recordings/squash.json";

const v = (x: number, y: number, z: number): World => ({ x, y, z });

/** How high the middle of the stack sits above the table. */
const LIFT = 0.01;

export interface RecordedFold {
  /** The paper at `progress`, as faces and lines for the view. */
  model(progress: number): FoldModel;
  /** Where the moving point is at `progress`: the point the finger holds. */
  anchor(progress: number): World;
}

function recordedFold(data: Recording): RecordedFold {
  const play = playbackOf(data);
  const { view, edges, triangles, paperVertexCount } = play.recording;
  const start = play.frame(0);
  const end = play.frame(play.frameCount - 1);
  const facing = Math.sign(determinant(view));

  /** The mesh vertex the finger holds: the Paper vertex this Fold carries furthest. */
  const tip = (() => {
    let best = 0;
    let far = -1;
    for (let i = 0; i < paperVertexCount; i++) {
      const d = Math.hypot(start[i * 3] - end[i * 3], start[i * 3 + 1] - end[i * 3 + 1], start[i * 3 + 2] - end[i * 3 + 2]);
      if (d > far) {
        far = d;
        best = i;
      }
    }
    return best;
  })();

  /** The middle of the tip's travel as he sees it, put at the world's origin so the camera looks straight at it. */
  const centre = (() => {
    const [x0, y0] = apply(view, [start[tip * 3], start[tip * 3 + 1]]);
    const [x1, y1] = apply(view, [end[tip * 3], end[tip * 3 + 1]]);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  })();

  /** A recording-frame point placed in the world as he sees the Paper. */
  function toWorld(x: number, y: number, z: number): World {
    const [sx, sy] = apply(view, [x, y]);
    return v(sx - centre.x, facing * z + LIFT, -(sy - centre.y));
  }

  /** One buffer for every frame: playing costs the blend, not garbage. */
  const positions = new Float32Array(play.vertexCount * 3);

  return {
    model(progress) {
      play.at(progress, positions);
      const world: World[] = [];
      for (let i = 0; i < play.vertexCount; i++) world.push(toWorld(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]));
      const faces: Face[] = [];
      for (let t = 0; t < triangles.length; t += 3) {
        faces.push({ points: [world[triangles[t]], world[triangles[t + 1]], world[triangles[t + 2]]] });
      }
      const lines: Segment[] = [];
      for (const edge of edges) {
        // A paper edge is solid, as is a crease folded flat; a crease being made is dashed until it is.
        const made = edge.folded || progress >= 0.97;
        const style: Segment["style"] = edge.assignment === "B" || made ? "edge" : "crease";
        for (let i = 1; i < edge.chain.length; i++) {
          lines.push({ from: world[edge.chain[i - 1]], to: world[edge.chain[i]], style });
        }
      }
      return { faces, lines };
    },
    anchor(progress) {
      const [x, y, z] = play.vertexAt(progress, tip);
      return toWorld(x, y, z);
    },
  };
}

export const insideReverseFold = recordedFold(insideReverseData as Recording);
export const squashFold = recordedFold(squashData as Recording);
