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
