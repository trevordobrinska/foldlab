# Rabbit Ear is the engine core; complex Folds are ours

The fold engine is built on Rabbit Ear (pinned to an exact version), which already does layered flat folding with correct layer order on FOLD data, plus Notation arrows. Its own reverse and squash folds are unfinished, so FoldLab writes the complex Fold types itself on top of its simple folds. Rabbit Ear is GPLv3, so FoldLab is GPLv3 too; the repo is public anyway.

## Considered Options

- **Our own engine from scratch**: rejected; layer ordering alone is months of work that Rabbit Ear has done.
- **Wait for Rabbit Ear's complex folds**: no date, and they're the heart of the app.

## Consequences

Rabbit Ear is alpha (0.9.x): upgrades are deliberate, never automatic, and the engine's tests guard them.

Rabbit Ear's simple folds (`foldGraph`, `simpleFoldLine`) crease every layer the line crosses, but folding one flap must crease only that flap. So even valley and mountain Folds are ours (`src/engine/paper.ts`): we split only the flap's faces (every face is convex, so this is simple clipping) and keep `faceOrders` for every overlapping pair. Rabbit Ear still lays out the folded form, and its layer solver agrees with our orders.
