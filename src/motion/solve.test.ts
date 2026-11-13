import { describe, expect, it } from "vitest";
import { dihedral, dihedralGradient, type Hinge } from "./hinge";
import type { V3 } from "./vec3";

const hinge: Hinge = { edge: [0, 1], apex: [2, 3], kind: "crease", start: 0, end: 0, driven: true, restLength: 1 };

describe("the hinge angle", () => {
  it("is zero when flat, positive when the faces fold toward their front (a valley)", () => {
    const flat: V3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0.5, 1, 0],
      [0.5, -1, 0],
    ];
    expect(dihedral(flat, hinge)).toBeCloseTo(0, 12);
    const a = 0.3;
    const valley: V3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0.5, Math.cos(a), Math.sin(a)],
      [0.5, -Math.cos(a), Math.sin(a)],
    ];
    expect(dihedral(valley, hinge)).toBeCloseTo(2 * a, 12);
    const mountain = valley.map(([x, y, z]) => [x, y, -z] as V3);
    expect(dihedral(mountain, hinge)).toBeCloseTo(-2 * a, 12);
  });

  it("has the gradient the formula says it has", () => {
    const positions: V3[] = [
      [0.1, -0.2, 0.05],
      [1.1, 0.1, -0.1],
      [0.4, 0.9, 0.3],
      [0.7, -0.8, 0.2],
    ];
    const gradient = dihedralGradient(positions, hinge);
    const h = 1e-6;
    gradient.forEach((g, i) => {
      for (let k = 0; k < 3; k++) {
        const plus = positions.map((p) => [...p] as V3);
        const minus = positions.map((p) => [...p] as V3);
        plus[i][k] += h;
        minus[i][k] -= h;
        const numeric = (dihedral(plus, hinge) - dihedral(minus, hinge)) / (2 * h);
        expect(g[k]).toBeCloseTo(numeric, 5);
      }
    });
  });
});
