import { describe, expect, it } from "vitest";
import insideReverse from "../../proto-gestures/recordings/inside-reverse.json";
import squash from "../../proto-gestures/recordings/squash.json";
import { playbackOf } from "./playback";
import { MIN_FRAMES, RECORDING_VERSION, type Recording } from "./recording";

/** Two vertices moving in straight lines over 51 snapshots. */
function straight(): Recording {
  const positions: number[] = [];
  for (let k = 0; k < MIN_FRAMES; k++) {
    const p = k / (MIN_FRAMES - 1);
    positions.push(p, 2 * p, 0, 1 - p, 0, 3 * p);
  }
  return {
    version: RECORDING_VERSION,
    paperVertexCount: 2,
    vertexCount: 2,
    frameCount: MIN_FRAMES,
    positions,
    triangles: [],
    triangleFace: [],
    edges: [],
    view: [1, 0, 0, 1, 0, 0],
  };
}

describe("playing a Recording", () => {
  it("gives the first snapshot at 0 and the last at 1, and clamps beyond", () => {
    const play = playbackOf(straight());
    expect([...play.at(0)]).toEqual([0, 0, 0, 1, 0, 0]);
    expect([...play.at(-3)]).toEqual([0, 0, 0, 1, 0, 0]);
    expect([...play.at(1)]).toEqual([1, 2, 0, 0, 0, 3]);
    expect([...play.at(7)]).toEqual([1, 2, 0, 0, 0, 3]);
  });

  it("blends the two nearest snapshots", () => {
    const play = playbackOf(straight());
    // 0.37 lies between snapshots 18 (0.36) and 19 (0.38), halfway.
    const at = play.at(0.37);
    expect(at[0]).toBeCloseTo(0.37, 6);
    expect(at[1]).toBeCloseTo(0.74, 6);
    expect(at[3]).toBeCloseTo(0.63, 6);
    expect(at[5]).toBeCloseTo(1.11, 6);
    expect(play.vertexAt(0.37, 1)[2]).toBeCloseTo(1.11, 6);
  });

  it("writes into the buffer it is given", () => {
    const play = playbackOf(straight());
    const out = new Float32Array(6);
    expect(play.at(0.5, out)).toBe(out);
    expect(out[0]).toBeCloseTo(0.5, 6);
  });

  it("refuses a Recording of another version or with the wrong amount of data", () => {
    expect(() => playbackOf({ ...straight(), version: 2 as 1 })).toThrow(/version/);
    expect(() => playbackOf({ ...straight(), frameCount: 52 })).toThrow(/counts/);
  });

  // The whole cost of a finger move, short of the GPU draw: the blend into
  // the mesh's position buffer, then laying it out triangle by triangle the
  // way the page's geometry is (one flat normal per triangle, so no index).
  it.each([
    ["inside reverse", insideReverse],
    ["squash", squash],
  ])("is fast: a frame of the %s costs under a millisecond", (_name, data) => {
    const play = playbackOf(data as Recording);
    const { triangles } = play.recording;
    const positions = new Float32Array(play.vertexCount * 3);
    const buffer = new Float32Array(triangles.length * 3);
    const frame = (p: number) => {
      play.at(p, positions);
      for (let t = 0; t < triangles.length; t++) {
        const v = triangles[t] * 3;
        buffer[t * 3] = positions[v];
        buffer[t * 3 + 1] = positions[v + 1];
        buffer[t * 3 + 2] = positions[v + 2];
      }
    };
    for (let i = 0; i < 500; i++) frame(i / 500); // warm up
    const runs = 5000;
    const started = performance.now();
    for (let i = 0; i < runs; i++) frame(((i * 7919) % 10007) / 10007);
    const perFrame = (performance.now() - started) / runs;
    console.log(`playback: ${(perFrame * 1000).toFixed(1)} µs per frame (${play.vertexCount} vertices, ${triangles.length / 3} triangles)`);
    expect(perFrame).toBeLessThan(1);
  });
});
