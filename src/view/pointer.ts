// Between his finger and the paper: the point of the table under a pixel of
// the canvas, and the pixel a point of the paper is drawn at, for a given
// camera. Pure (three's camera maths only, no DOM), so the folding gesture
// can be tested without a screen.

import { Vector3 } from "three";
import { makeCamera, type V3, type View } from "./frame";

export interface Pixel {
  x: number;
  y: number;
}

/** A point on the table: x to his right, z toward him, from the paper's centre. */
export interface TablePoint {
  x: number;
  z: number;
}

export interface Pointer {
  /** The point of the table under a canvas pixel, or undefined when the pixel looks past the table. */
  table(px: number, py: number): TablePoint | undefined;
  /** The canvas pixel a point in the world is drawn at. */
  screen(point: V3): Pixel;
}

/**
 * The pointer for a paper shown turned half over about `axis` (a level line
 * through the paper's centre; Flip, camera.ts `turnedOver`): `table` gives
 * the point of the paper as it lies in its Recording that is now under the
 * pixel, and `screen` the pixel such a point is now drawn at. So a finger
 * and the Notation meet the paper where he sees it, from the other side.
 */
export function turnedPointer(pointer: Pointer, axis: V3): Pointer {
  const length = Math.hypot(axis.x, axis.z) || 1;
  const ax = axis.x / length;
  const az = axis.z / length;
  // Half a turn about a level line: along the line stays, across it and height change sign. Its own undoing.
  const turned = (p: V3): V3 => {
    const along = 2 * (p.x * ax + p.z * az);
    return { x: along * ax - p.x, y: -p.y, z: along * az - p.z };
  };
  return {
    table(px, py) {
      const seen = pointer.table(px, py);
      if (!seen) return undefined;
      const { x, z } = turned({ x: seen.x, y: 0, z: seen.z });
      return { x, z };
    },
    screen: (point) => pointer.screen(turned(point)),
  };
}

/** The pointer for a camera on a canvas of `width` x `height` CSS pixels (pixels measured from its top left). */
export function pointerOf(view: View, width: number, height: number): Pointer {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const camera = makeCamera(view, w / h);
  const eye = new Vector3(view.position.x, view.position.y, view.position.z);
  const scratch = new Vector3();
  return {
    table(px, py) {
      scratch
        .set((px / w) * 2 - 1, 1 - (py / h) * 2, 0.5)
        .unproject(camera)
        .sub(eye);
      if (scratch.y > -1e-9) return undefined;
      // The table is the plane y = 0.
      const t = -eye.y / scratch.y;
      return { x: eye.x + scratch.x * t, z: eye.z + scratch.z * t };
    },
    screen(point) {
      scratch.set(point.x, point.y, point.z).project(camera);
      return { x: ((scratch.x + 1) / 2) * w, y: ((1 - scratch.y) / 2) * h };
    },
  };
}
