# No real cup Source can be imported yet: what building Import out needs

Status: needs-triage
Type: task

## Why

Milestone 1's spec has the cup arrive through Import. On 2026-11-13 Dad chose not to connect an API key, and asked for the cup to be got in for v1 another way, with a separate grilling session to follow on how to build Import out fully. This ticket holds what was found, as input to that session. It asks for no code by itself.

## What was tried

The agent read two Sources of the traditional cup itself, in a Claude Code session, in place of the Claude API. Neither can become a Model one Step for one (GLOSSARY: "a Step exactly as the Source shows it"), because a Model carries only valley and mountain Folds (`FOLD_CALL_TYPES`), and Import's own instructions say to fail such a Source and not to work round it.

| Source | Steps a Model cannot carry |
| --- | --- |
| Cup, traditional, diagram by Atsushi Tajiri (OrigamiUSA, linked from origami-resource-center.com's Easy Origami index) | Step 2, a pinch mark (fold and unfold); Step 4, the top layer tucked into the corner flap's pocket; Step 5, turn over; Step 6, the same again on the other side |
| Traditional Origami Cup, diagram by Kelly Tan (origami.me) | Step 2, a pinch mark (fold and unfold); Step 6, flatten the bottom and open the top |

A third (origami-fun.com's drinking cup) was not opened; a search summary suggests it uses a landmark crease too.

The Tajiri cup is a different variant from the one in the Library: one corner is folded on each side, and each flap is locked into a pocket. The origami.me cup is the Library's variant: both corners across the front, one flap down each side.

## What Dad decided for v1

The hand-written cup (`cupRecipe`, `src/library/recipes.ts`) stays as the Milestone 1 cup, recorded as written by hand and checked against these diagrams, not imported. Its Folds are the origami.me variant's, less the pinch mark and the opening of the finished cup. The pinch is not needed to place the Fold: the pinch marks where the angle bisector from one base corner meets the far edge, which is √2 − 1 of the edge from the apex, and that is where `cornerLandsAt` lands the corner.

## For the grilling session

- **Fold and unfold (a pinch or a landmark crease).** Both Sources that were read need it, and most diagrams of anything do. Questions: how he makes a crease that opens again, how a pinch (a crease made only at one edge) differs from a full crease, and whether a landmark Step is kept when the app can show the landing place without it. Leaving it out teaches a sequence that will not work on real paper.
- **Turn over as a Step.** Not built (ticket 08's decision). Flip now exists as a view move and is not this (DESIGN.md). DESIGN.md asks for an edge swipe.
- **A tuck into a pocket.** A valley Fold lands its flap on top; a tuck lands it between layers. The engine's layer order would have to take it, and the recorder would have to move it there.
- **Opening or inflating the finished Model.** The last Step of many Models, and not a flat Fold at all.
- **Who reads the Source.** The Claude API from a script (`npm run import`, built, never run for real), or a Claude Code session as tried here. The session needs no key and no per-run bill, but every Import then needs a session; the script runs unattended. `ImportClient` in `src/import/import.ts` is the seam either would sit behind.
- **Where Sources come from.** Dad asked about importing every model from a public website. The engine checks that a Fold can be made, not that it is the Source's Fold, so each Model still needs someone to fold it against its Source (ADR 0003). Sites' terms differ: origami-resource-center.com says "Diagrams are intended for personal use" and that designers keep their copyright; the origami.me PDF says reproduction and derivative works are prohibited without permission. ADR 0002 keeps Sources private and publishes only FoldLab's own fold sequences and words.
- **A Source's orientation.** Both diagrams start with the paper as a diamond and fold the bottom corner up; the hand-written cup starts square and folds the top right corner down to the bottom left. An imported cup would look turned beside the one he has folded.

## Done when

Dad has run the grilling session and this ticket's points are each either in a spec or set aside on purpose.
