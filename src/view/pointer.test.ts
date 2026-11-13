import { describe, expect, it } from "vitest";
import { fitting, TILTED, viewOf } from "./camera";
import { pointerOf } from "./pointer";
import { turnedPointer as turnedPointerUnderTest } from "./pointer";

// A unit paper fitted flat: the camera sees 0.675 either side of the centre
// (half the paper, 0.5, plus the fitted margin of 35%), so on an 800 px
// square canvas one paper unit is 400 / 0.675 px.
const { orbit } = fitting({ x: 0.5, z: 0.5 });
const UNIT = 400 / 0.675;

describe("where his finger is on the table", () => {
  it("looking straight down, the middle of the canvas is the middle of the paper", () => {
    const pointer = pointerOf(viewOf(orbit), 800, 800);
    const at = pointer.table(400, 400)!;
    expect(at.x).toBeCloseTo(0, 6);
    expect(at.z).toBeCloseTo(0, 6);
  });

  it("looking straight down, right on screen is +x and up on screen is away from him (-z)", () => {
    const pointer = pointerOf(viewOf(orbit), 800, 800);
    const at = pointer.table(400 + 0.5 * UNIT, 400 - 0.25 * UNIT)!;
    expect(at.x).toBeCloseTo(0.5, 5);
    expect(at.z).toBeCloseTo(-0.25, 5);
  });

  it("puts a point of the paper on screen where the finger that touches it is", () => {
    const pointer = pointerOf(viewOf(orbit), 800, 800);
    const on = pointer.screen({ x: 0.5, y: 0, z: -0.5 });
    expect(on.x).toBeCloseTo(400 + 0.5 * UNIT, 3);
    expect(on.y).toBeCloseTo(400 - 0.5 * UNIT, 3);
  });

  it("tilted, turned and on a landscape canvas, the table point under a pixel projects back to that pixel", () => {
    const pointer = pointerOf(viewOf({ ...orbit, elevation: TILTED, azimuth: 0.6, target: { x: 0.1, z: -0.2 } }), 1180, 820);
    for (const [px, py] of [
      [300, 200],
      [900, 640],
      [590, 410],
    ]) {
      const at = pointer.table(px, py)!;
      const back = pointer.screen({ x: at.x, y: 0, z: at.z });
      expect(back.x).toBeCloseTo(px, 3);
      expect(back.y).toBeCloseTo(py, 3);
    }
  });

  it("a point standing above the table shows higher on screen when the view is tilted", () => {
    const pointer = pointerOf(viewOf({ ...orbit, elevation: TILTED }), 800, 800);
    const flat = pointer.screen({ x: 0, y: 0, z: 0 });
    const raised = pointer.screen({ x: 0, y: 0.3, z: 0 });
    expect(raised.y).toBeLessThan(flat.y - 20);
  });
});

describe("the pointer for a flipped paper", () => {
  // Looking straight down from his side; the paper turned half over about the line that runs up the screen.
  const view = { position: { x: 0, y: 3, z: 0 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: -1 }, fov: 30 };
  const camera = pointerOf(view, 800, 800);
  const flipped = turnedPointerUnderTest(camera, { x: 0, y: 0, z: -1 });

  it("draws a point of the paper on the other side of the screen, at the same height up it", () => {
    const lying = camera.screen({ x: 0.3, y: 0, z: 0.1 });
    const turned = flipped.screen({ x: 0.3, y: 0, z: 0.1 });
    expect(turned.x).toBeCloseTo(800 - lying.x, 6);
    expect(turned.y).toBeCloseTo(lying.y, 6);
  });

  it("finds under his finger the point of the paper that is drawn there", () => {
    const pixel = flipped.screen({ x: 0.3, y: 0, z: 0.1 });
    const touched = flipped.table(pixel.x, pixel.y)!;
    expect(touched.x).toBeCloseTo(0.3, 6);
    expect(touched.z).toBeCloseTo(0.1, 6);
  });

  it("turns about the line it is given, wherever the view is twisted to", () => {
    const about = turnedPointerUnderTest(camera, { x: 1, y: 0, z: 0 });
    const lying = camera.screen({ x: 0.3, y: 0, z: 0.1 });
    const turned = about.screen({ x: 0.3, y: 0, z: 0.1 });
    expect(turned.x).toBeCloseTo(lying.x, 6);
    expect(turned.y).toBeCloseTo(800 - lying.y, 6);
  });
});
