# A real closed sink, recorded and played back like the squash

Status: ready-for-agent
Type: task
Blocked by: 11

## Why

The inside reverse (ticket 10) and the squash (ticket 11) are now real Folds. Dad checked both on the iPad. The closed sink tab is still the hand-made animation from ticket 02, which stretches the paper. It is the last of the three gestures he tries before they're final (ticket 02). It gets the same treatment: the engine knows the exact finished shape, the physics records the Fold once ahead of time, and his finger plays the recording.

A closed sink pushes a closed point down inside the model without opening it out flat. The layers stay wrapped around each other, so the layer order differs from an open sink. Real paper can't make a closed sink without bending a little on the way. The physics may let faces bend during the motion, but not stretch, and they must be flat again at the end.

## What to build

1. **The engine knows the closed sink.** Add `closedSink` to `src/engine/paper.ts`: the closed point above a given line is pushed down inside, along that line, with the layers staying wrapped. The engine gives the finished flat state and layer order, with tests. Reuse the shared cut/perform machinery.
2. **Checked against real origami, not by eye.** Tests compare the engine's result with known results:
   - **Required:** a closed sink of the top (closed) point of a preliminary base. The engine can build one through two squashes (ticket 11). Check the known outline and crease pattern: the point is cut off along the line, and the sunk part's creases swap mountain and valley.
   - Every vertex is flat-foldable (Maekawa and Kawasaki), and Rabbit Ear's layer solver agrees with the engine's layer order.
   - The layer order is a *closed* sink, not an open one. Name the specific orders that tell them apart and test them.
3. **Recorded, then played.** `npm run record` also writes `proto-gestures/recordings/closed-sink.json`. The Closed sink tab plays it; the page still contains no physics. The gesture stays as it is (press and hold until the ring fills, then push the point down; Dad accepted the hold). The ring and arrow line up with the recorded paper.
4. **The physics may improve** for the bending the sink needs, as long as every ticket 10 and 11 test still passes. If either recording's output changes, re-make it.

## Done when (automatic tests, every one passing)

The shared acceptance tests (`src/motion/acceptance.ts`), run on the closed sink recording at at least 50 samples including points halfway between snapshots: no stretching (1%), no passing through, right start and finish with layer order, smooth, earlier Folds hold, spring-back. Plus:

- **A real closed sink:** the engine's result matches the known outline and creases, with closed-sink layer order.
- **Flat-foldable:** Maekawa and Kawasaki at every vertex; Rabbit Ear agrees with the layer order.
- **Symmetric:** the model's mirror symmetry holds throughout the recording.
- **Bends, then flat:** any bending during the motion is within a stated limit, and the finished state is flat.
- **Fast and fresh:** playback under 1 ms per frame, each committed recording matches a fresh one, and no physics in the page.
- `npm run typecheck`, `npm test` and `npm run build` pass. Screenshots at the start, halfway and finished look right. Dad checks it on the iPad.

## Out of scope

Open sink and other Fold types (a later milestone), view controls (ticket 04), and drag-to-land (ticket 05).

## Comments
