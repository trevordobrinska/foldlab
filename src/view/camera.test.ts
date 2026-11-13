import { describe, expect, it } from "vitest";
import { clamp, fitting, FLAT, pinched, pinchOf, TILTED, turnedOver, viewOf, type Orbit, type Touch } from "./camera";

const extent = { x: 0.5, z: 0.5 };
const { orbit: home, limits } = fitting(extent);
const t = (x: number, y: number): Touch => ({ x, y });

describe("the view fits the paper", () => {
  it("looks straight down at the paper's centre from his side, up on screen away from him", () => {
    expect(home.elevation).toBe(FLAT);
    const view = viewOf(home);
    expect(view.position.x).toBeCloseTo(0, 9);
    expect(view.position.z).toBeCloseTo(0, 9);
    expect(view.position.y).toBeCloseTo(home.distance, 9);
    expect(view.target).toEqual({ x: 0, y: 0, z: 0 });
    expect(view.up).toEqual({ x: -0, y: 0, z: -1 });
  });

  it("shows the whole paper with room round it", () => {
    // The square frame's half height at the target: more than the paper's half extent.
    const halfHeight = home.distance * Math.tan((viewOf(home).fov * Math.PI) / 360);
    expect(halfHeight).toBeGreaterThan(0.5);
    expect(halfHeight).toBeLessThan(0.8);
  });

  it("tilted, the camera comes down toward him and still looks at the same spot", () => {
    const v = viewOf({ ...home, elevation: TILTED });
    expect(v.position.z).toBeGreaterThan(0);
    expect(v.position.y).toBeLessThan(home.distance);
    expect(v.target).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("two fingers move the view", () => {
  it("spreading zooms in, pinching zooms out, within limits", () => {
    const spread = pinched(home, pinchOf([t(400, 400), t(500, 400)], [t(350, 400), t(550, 400)]), 1180, 820, limits);
    expect(spread.distance).toBeCloseTo(home.distance / 2, 9);
    const narrowed = pinched(home, pinchOf([t(350, 400), t(550, 400)], [t(400, 400), t(500, 400)]), 1180, 820, limits);
    expect(narrowed.distance).toBeCloseTo(home.distance * 1.5, 9);
    let far = home;
    for (let i = 0; i < 20; i++) far = pinched(far, { scale: 0.5, twist: 0, dx: 0, dy: 0 }, 1180, 820, limits);
    expect(far.distance).toBe(limits.distance[1]);
    let near = home;
    for (let i = 0; i < 20; i++) near = pinched(near, { scale: 2, twist: 0, dx: 0, dy: 0 }, 1180, 820, limits);
    expect(near.distance).toBe(limits.distance[0]);
  });

  it("twisting turns the view by the fingers' angle, clockwise on screen for a clockwise twist", () => {
    // The pair goes from side by side to one above the other, about the same spot: a quarter turn clockwise on screen (y down).
    const pinch = pinchOf([t(400, 400), t(500, 400)], [t(450, 350), t(450, 450)]);
    expect(pinch.dx).toBe(0);
    expect(pinch.dy).toBe(0);
    expect(pinch.twist).toBeCloseTo(Math.PI / 2, 9);
    expect(pinch.scale).toBeCloseTo(1, 9);
    const turned = pinched(home, pinch, 1180, 820, limits);
    expect(turned.azimuth).toBeCloseTo(Math.PI / 2, 9);
    // The camera has gone round to the paper's right, so the paper's right side is now at the bottom of the screen.
    const v = viewOf(turned);
    expect(v.position.x).toBeCloseTo(0, 6);
    expect(v.up!.x).toBeCloseTo(-1, 9);
  });

  it("a twist across the seam stays small", () => {
    // Pointing left, the tip rising a little: a small clockwise turn, not nearly a full one the other way.
    expect(pinchOf([t(0, 0), t(-100, 1)], [t(0, 0), t(-100, -1)]).twist).toBeCloseTo(0.02, 2);
  });

  it("sliding both fingers moves the paper with them, the camera's target the other way", () => {
    const slid = pinched(home, { scale: 1, twist: 0, dx: 100, dy: 0 }, 1180, 820, limits);
    expect(slid.target.x).toBeLessThan(0);
    expect(slid.target.z).toBeCloseTo(0, 9);
    // Fingers up the screen: the paper moves away from him, so the target comes toward him (+z).
    const up = pinched(home, { scale: 1, twist: 0, dx: 0, dy: -100 }, 1180, 820, limits);
    expect(up.target.z).toBeGreaterThan(0);
    expect(up.target.x).toBeCloseTo(0, 9);
    // Turned a quarter, screen right is the table's -z.
    const turnedSlide = pinched({ ...home, azimuth: Math.PI / 2 }, { scale: 1, twist: 0, dx: 100, dy: 0 }, 1180, 820, limits);
    expect(turnedSlide.target.x).toBeCloseTo(0, 9);
    expect(turnedSlide.target.z).toBeGreaterThan(0);
  });

  it("never lets the paper off screen: the target stays on the paper", () => {
    let orbit: Orbit = home;
    for (let i = 0; i < 50; i++) orbit = pinched(orbit, { scale: 1, twist: 0, dx: 300, dy: -300 }, 1180, 820, limits);
    expect(orbit.target.x).toBe(-extent.x);
    expect(orbit.target.z).toBe(extent.z);
    expect(clamp({ ...home, target: { x: 9, z: -9 } }, limits).target).toEqual({ x: 0.5, z: -0.5 });
  });
});

describe("flip: a look at the paper's other side", () => {
  it("lies as it was at the start and shows the other side at the end, on the table both times", () => {
    expect(turnedOver(0, 0, 0.5)).toMatchObject({ angle: 0, lift: 0 });
    const over = turnedOver(1, 0, 0.5);
    expect(over.angle).toBeCloseTo(Math.PI, 9);
    expect(over.lift).toBeCloseTo(0, 9);
  });

  it("lifts the paper half way so its edge swings over the table, not through it", () => {
    expect(turnedOver(0.5, 0, 0.5).lift).toBeCloseTo(0.5, 9);
  });

  it("turns about the line that runs up the screen, however the view is twisted", () => {
    for (const azimuth of [0, 0.7, -2]) {
      const { axis } = turnedOver(0.5, azimuth, 0.5);
      const up = viewOf({ ...home, azimuth }).up!;
      expect(axis.x).toBeCloseTo(up.x, 9);
      expect(axis.z).toBeCloseTo(up.z, 9);
    }
  });
});
