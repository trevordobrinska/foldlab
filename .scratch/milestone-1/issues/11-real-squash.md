# A real squash, recorded and played back like the inside reverse

Status: ready-for-agent
Type: task
Blocked by: 10

## Why

Dad's first look on the iPad: the squash tab isn't a real squash. It is still the hand-made animation from ticket 02, with two flaps opening like a book. In a real squash the flap is lifted to stand up, its pocket opens, and it is pressed flat so it spreads evenly on both sides of its folded edge, making new creases. The inside reverse (ticket 10) now works the right way: the engine knows the exact finished shape, the physics records the Fold once ahead of time, and his finger plays the recording. The squash gets the same treatment.

## What to build

1. **The engine knows the squash.** Add `squash` to `src/engine/paper.ts`: a two-layer flap joined by a folded edge (its spine) is opened and pressed flat so the spine lands on a given line, and the flap's two layers spread evenly on either side of it. The engine gives the finished flat state and layer order, with tests. Reuse the shared cut/perform machinery that `fold` and `insideReverse` use.
2. **Checked against real origami, not by eye.** Tests compare the engine's result with known results:
   - **Required:** the classic squash. Fold a square in half on its diagonal, fold the triangle in half again, then squash the top flap. The flap becomes a square (diamond) with known corner coordinates, lying symmetrically on the folded edge. Check the exact outline and crease pattern.
   - Every new vertex is flat-foldable (Maekawa and Kawasaki), and Rabbit Ear's layer solver agrees with the engine's layer order.
   - **If the engine can make it:** squashing one flap of a preliminary base gives the known kite. A preliminary base is a collapse, not a sequence of simple Folds, so skip this if it would mean adding collapses. Say so if you skip it.
3. **Recorded, then played.** Record the squash with `src/motion/` the same way as the inside reverse: `npm run record` writes `proto-gestures/recordings/squash.json`. The squash tab plays it; the page still contains no physics. The gesture stays as it is ("press the standing flap down"). Diagrams lift the flap to stand up first, so the tab may open with the flap already standing and the finger playing from there. Choose what reads best and explain the choice.
4. **The physics may improve.** The inside reverse only just met the stretch limit (face area 0.93% against 1%). If the squash needs a better solver, improve it, as long as every ticket 10 test still passes and the inside reverse recording is re-made.

## Done when (automatic tests, every one passing)

The ticket 10 acceptance tests, run on the squash recording at least 50 samples including points halfway between snapshots: no stretching (1%), no passing through, right start and finish with layer order, smooth, earlier Folds hold, spring-back. Plus:

- **A real squash:** the engine's result matches the classic squash's known outline and creases. The two halves of the flap stay mirror images of each other across the spine's plane throughout the recording.
- **Flat-foldable:** Maekawa and Kawasaki at every vertex; Rabbit Ear agrees with the layer order.
- **Fast and fresh:** playback under 1 ms per frame, the committed recording matches a fresh one, and no physics in the page.
- `npm run typecheck`, `npm test` and `npm run build` pass. Screenshots at the start, halfway and finished look right. Dad checks it on the iPad.

## Out of scope

The sink (next ticket, the same way), other Fold types (a later milestone), view controls (ticket 04), and drag-to-land (ticket 05).

## Comments
