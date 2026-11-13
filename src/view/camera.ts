// The view of the paper: a camera orbiting the paper's centre on the table.
// He moves it with two fingers on the background (pinch to zoom, twist to
// turn, and the pair sliding to look at another part of the paper) and
// tilts it with a button to see the layers in 3D. All camera moves: the
// paper itself never changes. Pure maths; the DOM side is main.ts and the
// three.js side view.ts.

import { fitFov, type View } from "./frame";

export interface Orbit {
  /** Turn about the table's vertical, radians: 0 looks from his side, increasing turns the paper clockwise on screen. */
  azimuth: number;
  /** Angle above the table, radians: π/2 looks straight down (the paper flat, as in a diagram). */
  elevation: number;
  /** From the target, in paper units (the paper is about one unit across). */
  distance: number;
  /** Where on the table the camera looks: x right, z toward him, from the paper's centre. */
  target: { x: number; z: number };
}

export interface Limits {
  /** The closest and the furthest the camera may be. */
  distance: [number, number];
  /** How far the target may stray from the paper's centre: half the paper's extent, so the paper can't be lost off screen. */
  extent: { x: number; z: number };
}

/** The vertical field of view (degrees) of the square frame. */
export const FOV = 30;
/** Looking straight down: the paper as a diagram shows it. */
export const FLAT = Math.PI / 2;
/** Tilted to show the layers in 3D. */
export const TILTED = (52 * Math.PI) / 180;

/** The view that fits a paper of the given extent in the square frame, flat, with room round it. */
export function fitting(extent: { x: number; z: number }): { orbit: Orbit; limits: Limits } {
  const half = Math.max(extent.x, extent.z, 0.25);
  // The paper's half extent fills a square of FOV degrees at this distance, with a margin of a third.
  const distance = (half * 1.35) / Math.tan((FOV * Math.PI) / 360);
  return {
    orbit: { azimuth: 0, elevation: FLAT, distance, target: { x: 0, z: 0 } },
    limits: { distance: [distance / 3, distance * 1.5], extent },
  };
}

/** The camera for an orbit, looking at the table's height. */
export function viewOf(orbit: Orbit, tableHeight = 0): View {
  const { azimuth, elevation, distance, target } = orbit;
  const level = Math.cos(elevation);
  return {
    position: {
      x: target.x + distance * level * Math.sin(azimuth),
      y: tableHeight + distance * Math.sin(elevation),
      z: target.z + distance * level * Math.cos(azimuth),
    },
    target: { x: target.x, y: tableHeight, z: target.z },
    // Up on screen is away from him across the table, whatever the tilt (so looking straight down is not a special case).
    up: { x: -Math.sin(azimuth), y: 0, z: -Math.cos(azimuth) },
    fov: FOV,
  };
}

export function clamp(orbit: Orbit, limits: Limits): Orbit {
  const within = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    ...orbit,
    elevation: within(orbit.elevation, TILTED, FLAT),
    distance: within(orbit.distance, limits.distance[0], limits.distance[1]),
    target: {
      x: within(orbit.target.x, -limits.extent.x, limits.extent.x),
      z: within(orbit.target.z, -limits.extent.z, limits.extent.z),
    },
  };
}

export interface Touch {
  x: number;
  y: number;
}

/** What two fingers did between two moments: how much they spread, twisted (radians, clockwise on screen) and slid (pixels). */
export interface Pinch {
  scale: number;
  twist: number;
  dx: number;
  dy: number;
}

export function pinchOf(before: [Touch, Touch], after: [Touch, Touch]): Pinch {
  const span = (pair: [Touch, Touch]) => ({ x: pair[1].x - pair[0].x, y: pair[1].y - pair[0].y });
  const b = span(before);
  const a = span(after);
  const lengthB = Math.hypot(b.x, b.y) || 1;
  const lengthA = Math.hypot(a.x, a.y) || 1;
  let twist = Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x);
  if (twist > Math.PI) twist -= 2 * Math.PI;
  if (twist < -Math.PI) twist += 2 * Math.PI;
  return {
    scale: lengthA / lengthB,
    twist,
    dx: (after[0].x + after[1].x - before[0].x - before[1].x) / 2,
    dy: (after[0].y + after[1].y - before[0].y - before[1].y) / 2,
  };
}

/** The orbit after a pinch on a canvas of `width` x `height` CSS pixels: the paper follows the fingers, within the limits. */
export function pinched(orbit: Orbit, pinch: Pinch, width: number, height: number, limits: Limits): Orbit {
  const fov = fitFov(FOV, width / Math.max(1, height));
  // One pixel at the target's distance, in paper units.
  const worldPerPixel = (2 * orbit.distance * Math.tan((fov * Math.PI) / 360)) / Math.max(1, height);
  // Screen right and screen up across the table (up is foreshortened by the tilt).
  const right = { x: Math.cos(orbit.azimuth), z: -Math.sin(orbit.azimuth) };
  const away = { x: -Math.sin(orbit.azimuth), z: -Math.cos(orbit.azimuth) };
  const lift = Math.max(0.3, Math.sin(orbit.elevation));
  const slide = { right: pinch.dx * worldPerPixel, away: (-pinch.dy * worldPerPixel) / lift };
  return clamp(
    {
      azimuth: orbit.azimuth + pinch.twist,
      elevation: orbit.elevation,
      distance: orbit.distance / pinch.scale,
      // The paper moves with the fingers, so what the camera looks at moves the other way.
      target: {
        x: orbit.target.x - slide.right * right.x - slide.away * away.x,
        z: orbit.target.z - slide.right * right.z - slide.away * away.z,
      },
    },
    limits,
  );
}
