# Guided folds on true geometry, not free simulation

Each step of a Model has a known target fold. The paper is rendered with real layered 3D geometry, his gesture only has to roughly match the target (right flap, direction, approximate line), and the app then performs the fold exactly. A wrong gesture springs back rather than producing an unplanned paper state.

## Considered Options

- **Free physical simulation** (any fold, anywhere, wrong results visible): rejected. Squash, petal, reverse and sink folds on arbitrary layered paper are a research problem.
- **Gesture-triggered animations** (a gesture just plays a canned clip): rejected. It removes the actual practice of choosing the flap, line and direction.

## Consequences

Every Model must be expressed as an ordered sequence of exact folds. That makes the Library depend on getting step-level fold data from Sources, which is the project's main risk.
