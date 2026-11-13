import { describe, expect, it } from "vitest";
import { FOLD_ORDER, FOLDS, GRAB_RADIUS } from "./folds";
import { anchor, length, model, normalOf, rotateAbout, sub } from "./geometry";

describe("the push spec is read off the 3D scene", () => {
  it.each(FOLD_ORDER)("%s: the grab point and its travel lie inside the frame", (type) => {
    const { grab, axis, travel } = FOLDS[type].push;
    expect(grab.radius).toBe(GRAB_RADIUS);
    for (const k of [0, 1]) {
      const at = { x: grab.x + axis.x * travel * k, y: grab.y + axis.y * travel * k };
      expect(at.x).toBeGreaterThan(0);
      expect(at.x).toBeLessThan(100);
      expect(at.y).toBeGreaterThan(0);
      expect(at.y).toBeLessThan(100);
    }
    expect(Math.hypot(axis.x, axis.y)).toBeCloseTo(1, 9);
    // Far enough to be a push, not a tap, and not off the paper.
    expect(travel).toBeGreaterThan(15);
    expect(travel).toBeLessThan(60);
  });

  it.each(FOLD_ORDER)("%s: the point is pushed down the screen", (type) => {
    expect(FOLDS[type].push.axis.y).toBeGreaterThan(0.6);
  });

  it("squash and closed sink push the same way; the hold tells them apart", () => {
    expect(FOLDS.squash.push.axis.y).toBeGreaterThan(0.95);
    expect(FOLDS.sink.push.axis.y).toBeGreaterThan(0.95);
    expect(FOLDS.sink.push.holdMs).toBe(400);
    expect(FOLDS.squash.push.holdMs).toBeUndefined();
  });

  it("inside reverse pushes the tip straight down, a little back at most", () => {
    expect(FOLDS.insideReverse.push.axis.x).toBeLessThan(0.1);
    expect(FOLDS.insideReverse.push.axis.x).toBeGreaterThan(-0.4);
  });
});

describe("the paper", () => {
  it.each(FOLD_ORDER)("%s: the finger's point moves from its start to its end", (type) => {
    const start = anchor(type, 0);
    const end = anchor(type, 1);
    expect(length(sub(end, start))).toBeGreaterThan(0.3);
    expect(anchor(type, -1)).toEqual(start);
    expect(anchor(type, 2)).toEqual(end);
  });

  it.each(FOLD_ORDER)("%s: every face is a flat polygon with a winding", (type) => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      for (const { points } of model(type, p).faces) {
        expect(points.length).toBeGreaterThanOrEqual(3);
        expect(length(normalOf(points))).toBeCloseTo(1, 6);
      }
    }
  });

  it("squash: the flap stands up, then lies flat on the base", () => {
    expect(anchor("squash", 0).y).toBeGreaterThan(0.3);
    expect(anchor("squash", 1).y).toBeLessThan(0.02);
  });

  it("closed sink: the point drops to the crease, then inverts inside", () => {
    const top = anchor("sink", 0).y;
    const mid = anchor("sink", 0.5).y;
    const inside = anchor("sink", 1).y;
    expect(mid).toBeLessThan(top);
    expect(inside).toBeCloseTo(mid - (top - mid), 9); // mirrored through the crease
    expect(model("sink", 0.25).faces.some((f) => f.xray)).toBe(false);
    expect(model("sink", 0.75).faces.some((f) => f.xray)).toBe(true);
  });

  it("inside reverse: the tip ends reversed, well below where it started", () => {
    const start = anchor("insideReverse", 0);
    const end = anchor("insideReverse", 1);
    expect(end.y).toBeLessThan(start.y - 0.4);
    expect(Math.abs(end.x - start.x)).toBeLessThan(0.15);
    expect(Math.abs(end.z)).toBeLessThan(0.02); // back between the layers
    // Halfway, the tip has swung out of the point's plane.
    expect(Math.abs(anchor("insideReverse", 0.5).z)).toBeGreaterThan(0.15);
  });

  it("rotates about a hinge line", () => {
    const turned = rotateAbout({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, Math.PI / 2);
    expect(turned.x).toBeCloseTo(0, 9);
    expect(turned.y).toBeCloseTo(1, 9);
    const about = rotateAbout({ x: 2, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, Math.PI);
    expect(about.x).toBeCloseTo(0, 9);
    expect(about.y).toBeCloseTo(1, 9);
  });
});
