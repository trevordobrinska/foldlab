# Fold engine core: layered paper, valley and mountain Folds

Status: resolved
Type: task
Blocked by: 01

The pure, tested heart of ADR 0001. Paper state as FOLD (vertices, faces, layer order). Operations: valley and mountain Fold of a chosen flap (the layers above or below a line) along an exact line, fold-and-unfold, turn over, rotate. Each operation returns a new state or a clear refusal (impossible Fold). Test-first; no rendering here.

## Notes from ticket 01

- Build on Rabbit Ear 0.9.41 (ADR 0004). `foldGraph(graph, line, includeL, { assignment, vertices_coordsFolded })` creases *every* layer along a line given in folded coordinates and sets V/M per face winding; `simpleFoldLine` does the same from crease-pattern coordinates. Both keep `faceOrders` current.
- Folding one flap (the cup needs it: "fold the front flap down") is ours: crease the line, then `getFlaps(graph, line, foldedCoords)` gives the connected face groups on each side; the flap is the group under his finger. Refuse when a face that isn't moving lies on the flap's path (a valley Fold lands on top, a mountain Fold goes underneath).
- Express every Fold in the paper's current folded coordinates, which is what he sees and what Import describes.
- Turn over and rotate are changes of view, not geometry, but are still Steps.

## Comments

**2026-11-12, implemented** (`src/engine/paper.ts`, `src/engine/geometry.ts`, tests in `src/engine/paper.test.ts`):

- API: `newPaper`, `fold(paper, { line, flap, assignment: "V" | "M", layers? })`, `foldAndUnfold`, `turnOver`, `rotate`, `seenFaces`. Folds are described as he sees the Paper (x right, y up), after any turn over or rotate. `fold` returns `{ ok: true, paper }` or `{ ok: false, refusal: "no-flap" | "misses-flap" | "blocked" }`.
- The flap is the `layers` (default 1) under `flap`, counted from the side the flap moves toward, plus every face joined to them on that side of the line.
- Departs from the note above: the engine doesn't crease every layer and then call `getFlaps`, because that leaves stray creases in layers that stay put. It splits only the flap's faces and keeps `faceOrders` for every overlapping pair. Rabbit Ear's layer solver agreed with those orders on every sequence probed during review. Recorded in ADR 0004.
- Known limits: unfolding leaves the crease as an "F" edge and never merges faces back, so the face count only grows. Folding a whole stack along its own outer edge is refused as `misses-flap`; that move is really a turn over.
- The full cup sequence folds end to end in the tests.
