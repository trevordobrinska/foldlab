import { describe, expect, it } from "vitest";
import { FOLD_ORDER, FOLDS, GRAB_RADIUS } from "./folds";
import { anchor, length, model, normalOf, sub } from "./geometry";

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
    expect(length(sub(end, start))).toBeGreaterThan(0.2);
    expect(anchor(type, -1)).toEqual(start);
    expect(anchor(type, 2)).toEqual(end);
  });

  it.each(FOLD_ORDER)("%s: every face is a flat polygon with a winding, from the physics mesh", (type) => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const { faces } = model(type, p);
      // Real paper: the faces are the physics mesh, many small triangles.
      expect(faces.length).toBeGreaterThan(20);
      for (const { points } of faces) {
        expect(points).toHaveLength(3);
        expect(length(normalOf(points))).toBeCloseTo(1, 6);
      }
    }
  });

  it("squash: the flap stands up, then lies flat on the base", () => {
    expect(anchor("squash", 0).y).toBeGreaterThan(0.3);
    expect(anchor("squash", 1).y).toBeLessThan(0.02);
  });

  it("closed sink: the closed point lies on the table and goes down the screen (toward him) into the model", () => {
    const start = anchor("sink", 0);
    const end = anchor("sink", 1);
    for (const p of [0, 0.5, 1]) expect(Math.abs(anchor("sink", p).y)).toBeLessThan(0.03);
    expect(end.z).toBeGreaterThan(start.z + 0.25);
    expect(Math.abs(end.x - start.x)).toBeLessThan(0.01);
  });

  it("inside reverse: the tip stays in between the layers on the table, and comes out across the edge", () => {
    const start = anchor("insideReverse", 0);
    const end = anchor("insideReverse", 1);
    // The point lies flat on the table; its tip never leaves the middle of the layers.
    for (const p of [0, 0.25, 0.5, 0.75, 1]) expect(Math.abs(anchor("insideReverse", p).y)).toBeLessThan(0.02);
    // It comes toward him (+z): the head pokes out across the top edge of the folded square.
    expect(end.z).toBeGreaterThan(start.z + 0.4);
  });
});
