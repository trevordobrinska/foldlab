import { describe, expect, it } from "vitest";
import { pick } from "./pick";

// A unit square lying on the table, centred: x right, z toward him. Each
// side is two segments meeting at its middle, the way a Recording's edge
// chains are, so a middle is a joint that is not a corner.
function square(): { triangles: Float32Array; edges: Float32Array } {
  const c = [
    [-0.5, 0.5],
    [0.5, 0.5],
    [0.5, -0.5],
    [-0.5, -0.5],
  ];
  const edges: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c[i];
    const [bx, bz] = c[(i + 1) % 4];
    const [mx, mz] = [(ax + bx) / 2, (az + bz) / 2];
    edges.push(ax, 0.01, az, mx, 0.01, mz, mx, 0.01, mz, bx, 0.01, bz);
  }
  const triangles = [c[0], c[1], c[2], c[0], c[2], c[3]].flatMap(([x, z]) => [x, 0.01, z]);
  return { triangles: new Float32Array(triangles), edges: new Float32Array(edges) };
}

/** Two squares lying exactly on each other, a layer gap apart. */
function stack(): { triangles: Float32Array; edges: Float32Array } {
  const one = square();
  const lower = (buffer: Float32Array) => buffer.map((v, i) => (i % 3 === 1 ? v - 0.004 : v));
  return {
    triangles: new Float32Array([...one.triangles, ...lower(one.triangles)]),
    edges: new Float32Array([...one.edges, ...lower(one.edges)]),
  };
}

describe("one finger on the paper picks up the nearest corner or edge point", () => {
  it("picks up the corner when he touches near it", () => {
    const [grabbed] = pick(square(), { x: 0.44, z: -0.41 });
    expect(grabbed.corner).toBe(true);
    expect(grabbed.at.x).toBeCloseTo(0.5, 9);
    expect(grabbed.at.z).toBeCloseTo(-0.5, 9);
  });

  it("picks up the nearest point of an edge when no corner is near, and a joint along a straight edge is not a corner", () => {
    const [grabbed] = pick(square(), { x: 0.4, z: 0.02 });
    expect(grabbed.corner).toBe(false);
    expect(grabbed.at.x).toBeCloseTo(0.5, 9);
    expect(grabbed.at.z).toBeCloseTo(0.02, 9);
  });

  it("picks up the nearest edge point even from the middle of the paper", () => {
    const [grabbed] = pick(square(), { x: 0.1, z: 0.3 });
    expect(grabbed.at.x).toBeCloseTo(0.1, 9);
    expect(grabbed.at.z).toBeCloseTo(0.5, 9);
  });

  it("forgives a finger just off the paper's edge", () => {
    const [grabbed] = pick(square(), { x: 0.54, z: 0.2 });
    expect(grabbed.at.x).toBeCloseTo(0.5, 9);
    expect(grabbed.at.z).toBeCloseTo(0.2, 9);
  });

  it("picks up nothing when he touches the background", () => {
    expect(pick(square(), { x: 0.8, z: 0.8 })).toEqual([]);
    expect(pick(square(), { x: 0.6, z: 0 })).toEqual([]);
  });

  it("says where on the paper the point is: the segment and how far along it", () => {
    const paper = square();
    for (const touch of [
      { x: 0.44, z: -0.41 },
      { x: 0.4, z: 0.02 },
      { x: -0.2, z: -0.45 },
    ]) {
      for (const { segment, t, at } of pick(paper, touch)) {
        const e = paper.edges;
        const o = segment * 6;
        expect(e[o] + (e[o + 3] - e[o]) * t).toBeCloseTo(at.x, 6);
        expect(e[o + 2] + (e[o + 5] - e[o + 2]) * t).toBeCloseTo(at.z, 6);
      }
    }
  });

  it("offers the point on every layer whose edge lies there, the top layer first", () => {
    const paper = stack();
    const picks = pick(paper, { x: 0.4, z: 0.02 });
    expect(picks).toHaveLength(2);
    const heights = picks.map(({ segment }) => paper.edges[segment * 6 + 1]);
    expect(heights[0]).toBeGreaterThan(heights[1]);

    // At a corner each layer has two segments ending there.
    const layers = new Set(pick(paper, { x: 0.45, z: 0.45 }).map(({ segment }) => paper.edges[segment * 6 + 1]));
    expect(layers.size).toBe(2);
  });
});
