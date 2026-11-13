# Evaluate Rabbit Ear as the base of the fold engine

Status: resolved
Type: research

Can the open-source Rabbit Ear library (FOLD-based origami JS) do what the engine needs: fold chosen layers of a flat-folded, layered sheet along a line (valley/mountain), keep correct layer order (`faceOrders`), and give per-Step FOLD frames we can render? Check license, bundle size, maintenance, TypeScript types, and whether it supports or could support reverse, squash, sink and petal Folds. Answer: use it as the engine core, use parts, or write our own, with a small spike that folds a square in half twice and prints the layer order.

## Answer

Use Rabbit Ear (0.9.41, 2026-10-16, actively maintained, TypeScript types, ES modules) as the engine core, pinned to an exact version; write the complex Fold types ourselves. Spike, run in a scratch folder:

- `ear.graph.square()` then `simpleFoldLine(g, line, { assignment: "V" })` twice: 2 then 4 faces, `faceOrders` kept up to date by the fold itself (`[[1,2,1],[0,3,1],[0,1,-1],[2,3,1]]`), `makeVerticesCoordsFlatFolded` collapses correctly to a quarter square. The layer solver (`ear.layer`) is not needed when folds maintain `faceOrders`; running it on top of them throws a conflict.
- `reverseFold` prints "DO NOT USE. This method is in progress" and changes nothing. `simpleSquashFold` is in the same unfinished state. Squash, petal, reverse, sink, rabbit ear and crimp are ours to build, ideally as compositions of simple folds on chosen layer sets (`foldGraph` takes a folded-coords option and a line domain, which looks like the hook for "fold only this flap").
- Also useful: `diagrams.foldLineArrow` (Notation arrows), FOLD frame helpers, 3D folded coordinates for animation.
- License GPLv3: fine, since the repo is public; FoldLab is licensed GPLv3 to match (ADR 0004).
