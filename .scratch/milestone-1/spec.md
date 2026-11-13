# Spec: Milestone 1, the cup folded end to end

Status: open

Sources: `DESIGN.md` (grilled 2026-11-12), `GLOSSARY.md`, ADRs 0001–0003. Where this spec and DESIGN.md disagree, DESIGN.md wins: flag it, don't silently pick.

## Problem

He loves origami and wants to practise without paper. Before building the full Fold vocabulary and a big Library, we need proof that the riskiest pieces work together on his iPad: a real layered paper engine, a drag gesture that feels like folding, calm mistakes, and Import feeding the engine.

## Solution

One traditional Model, the cup, folded on his iPad from the first Step to the last with drag-to-land valley and mountain Folds. Standard Notation is drawn on the paper with Step text underneath; mistakes spring back calmly; undo and step back work. The cup arrives through a minimal Import (a Source on Dad's computer → the Claude API → Fold calls → engine replay → a Model file), not by hand. Alongside this, a throwaway prototype of the squash, inside reverse and sink gestures for him to try.

## Out of scope

Complex Fold types in the real app, the Library browser and search, Difficulty, Mismatch reports, book-page Import, paper colour choice beyond the Source's default.
