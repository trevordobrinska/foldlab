import { describe, expect, it } from "vitest";
import { FOLDS, type FoldGeometry } from "./folds";
import { judge, progressOf, type PathPoint, type PushSpec } from "./recognize";

// Builds a straight drag of `steps` samples from `from` by `delta`, 16 ms apart.
function drag(
  from: { x: number; y: number },
  delta: { x: number; y: number },
  steps = 10,
): PathPoint[] {
  const path: PathPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    path.push({ x: from.x + delta.x * k, y: from.y + delta.y * k, t: i * 16 });
  }
  return path;
}

/** A drag from the grab zone along the Fold's own axis, `fraction` of travel. */
function pushAlong(spec: PushSpec, fraction: number, steps = 10): PathPoint[] {
  const { grab, axis, travel } = spec;
  return drag(grab, { x: axis.x * travel * fraction, y: axis.y * travel * fraction }, steps);
}

/** A vector across the axis (perpendicular), scaled by `k`. */
function across(spec: PushSpec, k: number) {
  return { x: -spec.axis.y * k, y: spec.axis.x * k };
}

const cases: [string, FoldGeometry][] = [
  ["squash: press the standing flap down flat", FOLDS.squash],
  ["inside reverse: push the point in between the layers", FOLDS.insideReverse],
  ["sink: push the point down inside the model", FOLDS.sink],
];

describe.each(cases)("%s", (_name, fold) => {
  const spec = fold.push;

  it("matches a full push along the hand motion", () => {
    expect(judge(spec, pushAlong(spec, 1))).toBe("match");
  });

  it("springs back when the push is only a nudge", () => {
    expect(judge(spec, pushAlong(spec, 0.2))).toBe("spring-back");
  });

  it("still matches a wobbly push that stops three-quarters of the way", () => {
    const wobbled = pushAlong(spec, 0.75, 12).map((p, i) => {
      const side = across(spec, i % 2 ? 8 : -8);
      return { ...p, x: p.x + side.x, y: p.y + side.y };
    });
    expect(judge(spec, wobbled)).toBe("match");
  });

  it("springs back when pushed across the paper instead of along the motion", () => {
    // Far enough along the axis to pass on distance alone, but ~70° off it.
    const side = across(spec, spec.travel * 1.8);
    const along = { x: spec.axis.x * spec.travel * 0.7, y: spec.axis.y * spec.travel * 0.7 };
    const path = drag(spec.grab, { x: side.x + along.x, y: side.y + along.y });
    expect(judge(spec, path)).toBe("spring-back");
  });

  it("springs back when pulled the opposite way", () => {
    expect(judge(spec, pushAlong(spec, -1))).toBe("spring-back");
  });

  it("springs back when the finger lands away from the point to push", () => {
    const { grab, axis, travel } = spec;
    const elsewhere = { x: grab.x + grab.radius * 3, y: grab.y };
    const path = drag(elsewhere, { x: axis.x * travel, y: axis.y * travel });
    expect(judge(spec, path)).toBe("spring-back");
  });

  it("reports progress so the paper can follow the finger", () => {
    expect(progressOf(spec, pushAlong(spec, 0.5))).toBeCloseTo(0.5, 5);
    expect(progressOf(spec, pushAlong(spec, 1.5))).toBe(1);
    expect(progressOf(spec, pushAlong(spec, -0.5))).toBe(0);
    expect(progressOf(spec, [{ x: spec.grab.x, y: spec.grab.y, t: 0 }])).toBe(0);
  });

  it("lets the paper come back when the finger retreats", () => {
    const out = pushAlong(spec, 0.8, 8);
    const turn = out[out.length - 1];
    const { axis, travel } = spec;
    const back = drag(turn, { x: -axis.x * travel * 0.6, y: -axis.y * travel * 0.6 }, 6);
    const path = [...out, ...back.slice(1).map((p, i) => ({ ...p, t: 200 + i * 16 }))];
    expect(progressOf(spec, path)).toBeCloseTo(0.2, 5);
  });
});
