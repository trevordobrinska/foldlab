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

/** Rests the finger on `at` for `ms` (a press-and-hold), then continues with
 *  `then`, whose times are shifted to follow the hold. */
function holdThen(at: { x: number; y: number }, ms: number, then: PathPoint[]): PathPoint[] {
  const rest: PathPoint[] = [];
  for (let t = 0; t < ms; t += 50) rest.push({ x: at.x, y: at.y, t });
  return [...rest, ...then.map((p) => ({ ...p, t: p.t + ms }))];
}

/** A drag from the grab zone along the Fold's own axis, `fraction` of travel,
 *  after the hold the Fold asks for (if any). */
function pushAlong(spec: PushSpec, fraction: number, steps = 10): PathPoint[] {
  const { grab, axis, travel } = spec;
  const push = drag(grab, { x: axis.x * travel * fraction, y: axis.y * travel * fraction }, steps);
  return spec.holdMs ? holdThen(grab, spec.holdMs, push) : push;
}

/** A vector across the axis (perpendicular), scaled by `k`. */
function across(spec: PushSpec, k: number) {
  return { x: -spec.axis.y * k, y: spec.axis.x * k };
}

const cases: [string, FoldGeometry][] = [
  ["squash: press the standing flap down flat", FOLDS.squash],
  ["inside reverse: push the point in between the layers", FOLDS.insideReverse],
  ["closed sink: press and hold the point, then push it in", FOLDS.sink],
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
    const holdMs = spec.holdMs ?? 0;
    const wobbled = pushAlong(spec, 0.75, 12).map((p, i) => {
      if (p.t < holdMs) return p; // a held finger rests; the push wobbles
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
    const path = [...out, ...back.slice(1).map((p, i) => ({ ...p, t: turn.t + (i + 1) * 16 }))];
    expect(progressOf(spec, path)).toBeCloseTo(0.2, 5);
  });
});

describe("closed sink is told apart from squash by the press-and-hold", () => {
  const spec = FOLDS.sink.push;
  const holdMs = spec.holdMs!;
  const push = drag(spec.grab, { x: spec.axis.x * spec.travel, y: spec.axis.y * spec.travel });

  it("asks for a hold that squash does not", () => {
    expect(holdMs).toBeGreaterThan(0);
    expect(FOLDS.squash.push.holdMs).toBeUndefined();
  });

  it("springs back when the point is pushed straight away without a hold", () => {
    expect(judge(spec, push)).toBe("spring-back");
  });

  it("keeps the paper still until the hold is done", () => {
    const resting = holdThen(spec.grab, holdMs * 0.5, []);
    expect(progressOf(spec, resting)).toBe(0);
  });

  it("springs back when the finger slides off the point during the hold", () => {
    const slid = holdThen(spec.grab, holdMs, push).map((p) =>
      p.t > 0 && p.t < holdMs ? { ...p, x: p.x + spec.grab.radius } : p,
    );
    expect(judge(spec, slid)).toBe("spring-back");
  });

  it("matches the same push once the point has been held", () => {
    expect(judge(spec, holdThen(spec.grab, holdMs, push))).toBe("match");
  });
});
