# Fold engine core: layered paper, valley and mountain Folds

Status: ready-for-agent
Type: task
Blocked by: 01

The pure, tested heart of ADR 0001. Paper state as FOLD (vertices, faces, layer order). Operations: valley and mountain Fold of a chosen flap (the layers above or below a line) along an exact line, fold-and-unfold, turn over, rotate. Each operation returns a new state or a clear refusal (impossible Fold). Test-first; no rendering here.

## Notes from ticket 01

- Build on Rabbit Ear 0.9.41 (ADR 0004). `foldGraph(graph, line, includeL, { assignment, vertices_coordsFolded })` creases *every* layer along a line given in folded coordinates and sets V/M per face winding; `simpleFoldLine` does the same from crease-pattern coordinates. Both keep `faceOrders` current.
- Folding one flap (the cup needs it: "fold the front flap down") is ours: crease the line, then `getFlaps(graph, line, foldedCoords)` gives the connected face groups on each side; the flap is the group under his finger. Refuse when a face that isn't moving lies on the flap's path (a valley Fold lands on top, a mountain Fold goes underneath).
- Express every Fold in the paper's current folded coordinates, which is what he sees and what Import describes.
- Turn over and rotate are changes of view, not geometry, but are still Steps.
