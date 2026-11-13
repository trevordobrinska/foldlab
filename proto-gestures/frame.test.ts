import { describe, expect, it } from "vitest";
import { fitFov, makeCamera, ndcToFrame, pixelToFrame, projectToFrame, type View } from "./frame";

describe("the frame is the centred square of the canvas", () => {
  it("maps a square canvas edge to edge", () => {
    expect(pixelToFrame(0, 0, 400, 400)).toEqual({ x: 0, y: 0 });
    expect(pixelToFrame(400, 400, 400, 400)).toEqual({ x: 100, y: 100 });
    expect(pixelToFrame(200, 100, 400, 400)).toEqual({ x: 50, y: 25 });
  });

  it("centres the square in a landscape canvas", () => {
    // 1180 x 820: the square is 820 wide, starting 180 px in.
    expect(pixelToFrame(180, 0, 1180, 820)).toEqual({ x: 0, y: 0 });
    expect(pixelToFrame(1000, 820, 1180, 820)).toEqual({ x: 100, y: 100 });
    expect(pixelToFrame(590, 410, 1180, 820)).toEqual({ x: 50, y: 50 });
  });

  it("centres the square in a portrait canvas", () => {
    expect(pixelToFrame(0, 180, 820, 1180)).toEqual({ x: 0, y: 0 });
    expect(pixelToFrame(410, 590, 820, 1180)).toEqual({ x: 50, y: 50 });
  });

  it("agrees with the NDC mapping", () => {
    for (const [w, h] of [
      [400, 400],
      [1180, 820],
      [820, 1180],
    ]) {
      const a = ndcToFrame(0.3, -0.6, w, h);
      const b = pixelToFrame(((0.3 + 1) / 2) * w, ((1 - -0.6) / 2) * h, w, h);
      expect(a.x).toBeCloseTo(b.x, 9);
      expect(a.y).toBeCloseTo(b.y, 9);
    }
  });
});

describe("the camera is fitted so the frame is aspect-independent", () => {
  const view: View = { position: { x: 1, y: 1.2, z: 1.6 }, target: { x: 0, y: 0.2, z: 0 }, fov: 30 };
  const point = { x: 0.3, y: 0.4, z: -0.1 };

  it("keeps the vertical field of view in landscape and widens it in portrait", () => {
    expect(fitFov(30, 1.5)).toBe(30);
    expect(fitFov(30, 1)).toBe(30);
    expect(fitFov(30, 0.5)).toBeGreaterThan(30);
    // Portrait at aspect a shows the same width as a square at the fov.
    const halfSquare = Math.tan((30 * Math.PI) / 360);
    const halfPortrait = Math.tan((fitFov(30, 0.5) * Math.PI) / 360) * 0.5;
    expect(halfPortrait).toBeCloseTo(halfSquare, 9);
  });

  it("projects a world point to the same frame spot at any canvas size", () => {
    const square = projectToFrame(makeCamera(view, 1), point, 1, 1);
    const landscape = projectToFrame(makeCamera(view, 1180 / 820), point, 1180, 820);
    const portrait = projectToFrame(makeCamera(view, 820 / 1180), point, 820, 1180);
    expect(landscape.x).toBeCloseTo(square.x, 6);
    expect(landscape.y).toBeCloseTo(square.y, 6);
    expect(portrait.x).toBeCloseTo(square.x, 6);
    expect(portrait.y).toBeCloseTo(square.y, 6);
  });

  it("puts the camera's target at the frame's centre", () => {
    const centre = projectToFrame(makeCamera(view, 1), view.target, 1, 1);
    expect(centre.x).toBeCloseTo(50, 6);
    expect(centre.y).toBeCloseTo(50, 6);
  });
});
