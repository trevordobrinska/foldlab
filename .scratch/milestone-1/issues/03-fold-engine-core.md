# Fold engine core: layered paper, valley and mountain Folds

Status: ready-for-agent
Type: task
Blocked by: 01

The pure, tested heart of ADR 0001. Paper state as FOLD (vertices, faces, layer order). Operations: valley and mountain Fold of a chosen flap (the layers above or below a line) along an exact line, fold-and-unfold, turn over, rotate. Each operation returns a new state or a clear refusal (impossible Fold). Test-first; no rendering here.
