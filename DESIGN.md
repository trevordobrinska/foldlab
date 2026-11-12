# FoldLab design

Decisions from the grilling session of 2026-11-12. Vocabulary is in `GLOSSARY.md`, hard-to-reverse decisions in `docs/adr/`.

## Who and where

- For one child: 10, autistic, a very advanced reader, already folds from many origami books.
- Runs on his **iPad** (Safari), opened from the **Dobrinska Arcade** at `trevordobrinska.github.io/foldlab/`. Follows the Arcade's `SUITE-RULES.md` (slug `foldlab`, storage prefixed `foldlab`, house button, no install prompt). The Arcade has to be added to his iPad's home screen.
- No offline support, matching the Arcade. No accounts. Progress lives on the iPad.

## Folding

- Guided folds on true geometry (ADR 0001): the paper is real layered 3D, his gesture roughly matches the target Fold, and then the engine folds it exactly.
- A Step is exactly the Source's numbered step, with one or more Folds. Symmetric Folds can be made in any order. "Repeat behind" is expanded into real Folds.
- The full Fold type set from the start (see the glossary). Modular (multi-unit) Models are out of scope.
- **Gestures:** touching the paper folds it; touching the background moves the view (two-finger pinch to zoom, twist to rotate) and a button tilts the paper to show its layers. Valley and mountain folds are drag a point to where it lands. Complex Fold types copy the real hand motion. Squash, inside reverse and sink get a throwaway prototype that he tries before they're final. Turn over is an edge swipe because it's a Step, not a camera move. Fingers come first; the Pencil also works for single-touch Folds. No haptics, because iPads have no haptic motor.
- **Screen:** standard Yoshizawa–Randlett Notation drawn on the paper, with Step text underneath.
- **Mistakes are calm:** no sounds by default, no red, no score. The paper springs back. After one miss the target line pulses; after a few, a "show me" button plays the Fold once and he then makes it himself. Undo and step back are always available. Animations never loop.
- **Paper:** the Source's shape and coloured side by default; he can choose each side's colour or pattern.

## Library

- Built only by checked AI Import (ADR 0003): the engine implements every Fold type and base once, the Claude API turns a Source into Fold calls, and the engine replays every Step. Only clean replays reach the Library. Failed imports are held back for retry.
- Sources first: diagram PDFs and images, plus photos of his book pages dropped into an inbox folder on the parent's computer. No videos yet. Book import must reach 8 of 10 or it's cut.
- Import is a batch run on the parent's computer with a per-run cost cap. New Models are published with the app.
- Sources stay private; the published Library is FoldLab's own words (ADR 0002).
- Browse by Source and search by name. Each Model shows its Difficulty. Finished Models get a checkmark; unfinished ones reopen at their Step.
- Mismatch report: he can flag a Step that doesn't match his book, which pulls the Model until it's re-imported.

## Stack

TypeScript, Vite (from the Arcade starter), three.js, Models stored as FOLD (one frame per Step, with layer order), the Claude API for Import.

## First milestone

The fold engine and paper rendering; drag-to-land valley and mountain Folds; calm mistakes; Notation; undo; and one traditional Model (the cup) through a minimal Import, end to end.

## Open, not blocking

- Optional: ask the Learn2Fold authors (arXiv 2603.29585) for the OrigamiCode dataset.
- The name is a working name. He may pick another.
