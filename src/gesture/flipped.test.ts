// Folding from the other side (Flip), on the real cup: its last Step has two
// flaps lying on each other, the front one folded over the corners and the
// back one folded behind. Which he gets depends on the side he is looking at.

import { describe, expect, it } from "vitest";
import { openModel } from "../library/library";
import { opened, toMake } from "../model/player";
import { modelPapers } from "../view/model-papers";
import { holdOf, lands, travel } from "./drag";

describe("the cup's last Step, from either side", async () => {
  const cup = await openModel("cup");
  const papers = modelPapers(cup);
  const folds = toMake(cup, opened(cup, { step: 3, finished: false })).map((offer) => papers.of(offer.recording));

  // Where the flaps' corner lies: the corner the first Fold carries furthest.
  const corner = (() => {
    const before = folds[0].at(0).edges.slice();
    const after = folds[0].at(1).edges;
    let far = 0;
    let furthest = -1;
    for (let o = 0; o < before.length; o += 3) {
      const d = Math.hypot(after[o] - before[o], after[o + 2] - before[o + 2]);
      if (d > furthest) [far, furthest] = [o, d];
    }
    return { x: before[far], z: before[far + 2] };
  })();

  it("has two Folds to make, of flaps lying on each other", () => {
    expect(folds).toHaveLength(2);
  });

  it("gives him the front flap from in front", () => {
    expect(holdOf(folds, corner)?.fold).toBe(0);
  });

  it("gives him the back flap from behind, and it lands where that Fold lands it", () => {
    const hold = holdOf(folds, corner, true)!;
    expect(hold.fold).toBe(1);
    expect(travel(hold)).toBeGreaterThan(0.1);
    const end = hold.path[hold.path.length - 1];
    expect(lands(hold, { x: end.x, z: end.z })).toBe(true);
  });
});
