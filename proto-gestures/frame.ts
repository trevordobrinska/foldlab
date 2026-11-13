// The "frame": the 0..100 square that the recognizer, the target overlay and
// the pointer all share. It is the largest centred square of the canvas
// (fitted like an SVG viewBox with "meet"), so the same numbers work in
// landscape and portrait. The camera is fitted so that a fixed square of the
// 3D view fills that square, which makes a projected point's frame position
// independent of the canvas aspect. Pure: no DOM, only three's camera maths.

import { PerspectiveCamera, Vector3 } from "three";
import type { V3 } from "./geometry";

export interface FramePoint {
  x: number;
  y: number;
}

/** A fixed camera for one Fold: where it sits, what it looks at, and the
 *  vertical field of view (degrees) of the square view it must fit. */
export interface View {
  position: V3;
  target: V3;
  fov: number;
}

/** The vertical field of view that keeps a square of `fov` degrees inside
 *  the canvas: unchanged in landscape, widened in portrait so the square
 *  still fits across. */
export function fitFov(fov: number, aspect: number): number {
  if (aspect >= 1) return fov;
  const half = Math.tan((fov * Math.PI) / 360) / aspect;
  return (Math.atan(half) * 360) / Math.PI;
}

/** Points the camera for a Fold and fits it to the canvas aspect. */
export function applyView(camera: PerspectiveCamera, view: View, aspect: number): void {
  camera.aspect = aspect;
  camera.fov = fitFov(view.fov, aspect);
  camera.near = 0.1;
  camera.far = 20;
  camera.position.set(view.position.x, view.position.y, view.position.z);
  camera.lookAt(view.target.x, view.target.y, view.target.z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

export function makeCamera(view: View, aspect: number): PerspectiveCamera {
  const camera = new PerspectiveCamera();
  applyView(camera, view, aspect);
  return camera;
}

/** Normalised device coordinates (-1..1, y up) to the frame (0..100, y
 *  down) of a `width` x `height` canvas. */
export function ndcToFrame(ndcX: number, ndcY: number, width: number, height: number): FramePoint {
  const side = Math.min(width, height) || 1;
  return {
    x: 50 + (50 * ndcX * width) / side,
    y: 50 - (50 * ndcY * height) / side,
  };
}

/** A pixel position inside a `width` x `height` canvas to the frame. */
export function pixelToFrame(px: number, py: number, width: number, height: number): FramePoint {
  const side = Math.min(width, height) || 1;
  return {
    x: ((px - (width - side) / 2) / side) * 100,
    y: ((py - (height - side) / 2) / side) * 100,
  };
}

const scratch = new Vector3();

/** Where a world point lands in the frame of a `width` x `height` canvas
 *  seen through `camera` (which must have been fitted with `applyView`). */
export function projectToFrame(camera: PerspectiveCamera, point: V3, width: number, height: number): FramePoint {
  scratch.set(point.x, point.y, point.z).project(camera);
  return ndcToFrame(scratch.x, scratch.y, width, height);
}
