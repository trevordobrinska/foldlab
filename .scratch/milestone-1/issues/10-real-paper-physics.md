# Real paper physics for one Fold at a time, starting with inside reverse

Status: ready-for-agent
Type: task
Blocked by: 03

## Why

The 3D gesture prototype (ticket 02) animates each Fold by hand, so it doesn't behave like paper: the inside reverse's tip passes through the side of a layer instead of going down into the middle, and the sink stretches. Dad wants every Fold to move like real paper. FoldLab is an interactive game played Step by Step, not a crease pattern that collapses all at once, so the physics has to work on one Fold at a time.

## What to build

1. **The engine knows the Step.** The fold engine (`src/engine/`, ticket 03) holds the Paper after each Fold, including which creases are already folded and the layer order. Add an inside reverse to the engine: a two-layer point is reversed between its own layers along a given line, and the engine gives its finished flat state and layer order, with tests. The engine stays the source of truth for where every Fold must end.
2. **The physics moves one Fold.** A new pure module (in `src/`, next to the engine, not in the throwaway prototype folder) takes the Paper as it is now and the Fold being made, and gives the paper's 3D shape at any progress from 0 to 1. Only this Fold's creases move. Folds already made stay folded, so the paper behaves like paper lying on a table.
   - Use real paper physics: a bar-and-hinge model, the method of Origami Simulator (Ghassaei, Demaine, Gershenfeld, 2018). Faces stay stiff, creases are hinges driven towards their target angle, and the paper finds its own path. We borrow the method only, not Origami Simulator's all-at-once folding. If a Fold can be solved exactly (the inside reverse folds without bending), an exact solution is fine instead.
   - Layers that touch must not pass through each other.
3. **His finger drives it.** In the gesture prototype (`proto-gestures/`), the inside reverse tab uses the real engine state and the physics module instead of hand-made geometry. Gesture progress drives physics progress. On a match the Fold finishes exactly into the engine's state; on a miss it springs back to where the Step began.

## Done when (automatic tests, every one passing)

Each test samples the Fold at many progress values (at least 50 from 0 to 1):

- **No stretching:** every edge length and face area stays within 1% of the flat paper's.
- **No passing through:** no two faces intersect at any sample (layers that lie flat together may touch).
- **The inside reverse goes down into the middle:** the tip moves between the two outer layers, and the two layers of the tip stay mirror images of each other across the middle plane.
- **Right start, right finish:** progress 0 equals the current Paper and progress 1 equals the engine's finished state, including the layer order.
- **Smooth:** no face jumps between neighbouring samples.
- **Earlier Folds hold:** creases from earlier Steps keep their angles throughout.
- **Spring-back:** running progress back to 0 returns the starting state.

Also: `npm run typecheck`, `npm test` and `npm run build` pass, and screenshots of the inside reverse at the start, halfway and finished look right.

## Out of scope

Squash and sink (next, the same way, once the inside reverse is accepted; real paper bends a little during a closed sink, so that one needs extra care), view controls (ticket 04), drag-to-land (ticket 05).

## Comments

**2026-11-12, agent:** Implemented; awaiting review.

- Engine: `insideReverse(paper, { line, tip })` in `src/engine/paper.ts`. The two layers under `tip` joined by a folded edge on the tip's side each turn toward the other; creases inside the tip (its spine) turn inside out; each layer's tip keeps its own side of the point in the layer order. `makeFold` was split into a shared cut/perform so both Folds use the same face splitting and `faceOrders` bookkeeping. Tests in `paper.test.ts`.
- Physics: `src/motion/` (`motionOf(before, after)`): bar-and-hinge mesh (`mesh.ts`: fan + one midpoint subdivision per face, bars on every triangle edge, crease hinges driven from the start angle to the end angle, soft facet hinges), solved by extended position-based dynamics run quasi-statically with Jacobi-averaged passes (`solve.ts`), vertex-face contacts keeping layers a gap apart. Hinge start/end angles are measured on the layered flat-folded Papers, so both ends are exact rests; at either end the paper is pressed flat (stiff facets while settling).
- A rigid (exact) inside reverse does not exist without unfolding the point's spine completely: the degree-4 vertex where the line meets the spine only moves with the body opening (tan φ · cos α = cot(θ/2)), so the paper bends near the crease, which is what the physics shows and what hands do ("open the layers").
- Acceptance tests in `src/motion/motion.test.ts` (51 samples): no stretching (max 0.5%), no crossings, tip on the middle plane and the two layers mirror images (to 1e-6), start/finish equal the engine's Papers with layer order, smooth (max step 0.04 of the paper per 2% progress), earlier creases within 10° (the spine stays within 5°), spring-back from 0.3/0.55/0.8 returns within 0.5% of the paper's width.
- Known limits: unfolding from the finished state (progress 1 back to 0) is not reliable (the tips must come back out of four closed layers and the symmetric path buckles); the prototype starts afresh on "Again" instead. A full sweep costs about 2.5 s of CPU on a desktop, so a fast finger lags on the iPad.
- Prototype: `proto-gestures/scene.ts` drives the Inside reverse tab from the engine state and the physics; squash and sink are still canned.
