# The layered layout breaks where a crease wraps other layers: the cup's Step 4

Status: resolved
Type: task
Blocked by: 14

## Why

Split out of ticket 14 (see its comment "2026-11-13, agent, diagnosis", fault B). `layeredLayout` (`src/motion/mesh.ts`) puts each vertex at the mean height of the faces that touch it. That holds for the cup's Steps 1 to 3 and breaks in Step 4 in two ways:

- At the start: the mesh is cut along the new crease, so the vertices at its ends average three faces instead of two. The same Paper that has no crossings as Step 3's end has six pairs of faces crossing as Step 4's start.
- At the end: the new crease joins layers that have four corner layers between them, and those corners' raw edges lie exactly along the crease. Next to the crease the top flap dips below the corner flaps and the layer beneath rises above them.

By the numbers this is what shows as patches of the wrong colour on the top flap in Step 4, lying flat and seen from above. That is inferred from the heights, not yet confirmed on a screen.

It also keeps Step 4's bars over the 1% limit for the back flap (1.19% with ticket 14's turn fix alone).

## What done looks like

- All four Step 4 Recordings of the cup pass ticket 10's acceptance tests, and their expected-failure registrations in `src/library/library.test.ts` (and `src/library/cup-recordings.diagnosis.test.ts`) are removed. Limits untouched.
- The Recordings of tickets 10 to 13 (inside reverse, squash, sink) still pass their acceptance runs: every Recording's start and end come from this layout, and the hinges' rest angles are measured from it.

## Not yet designed

It needs a decision about how a crease with no width wraps a stack of layers. Two crude versions were tried during the diagnosis and not kept: giving every vertex at one folded point the same height, and doing so only for vertices on folded creases. Each cleared some of Step 4's layouts and broke others.

## Why it matters for Milestone 1

Any Model whose Fold wraps a crease round other layers' edges will carry it, and the cup, the one Model in Milestone 1, does in its last Step. Whether it must be fixed before ticket 09's iPad session depends on how Step 4 looks once ticket 14's turn fix is in.

## Comments

**2026-11-13, agent:** Filed at Dad's request after ticket 14's diagnosis. Not triaged, not started.

**2026-11-13, Dad, on the iPad after ticket 14's turn fix** (`milestone-1` at `1b16fbb`): Steps 2 and 3 look good; Step 4 still breaks down. So this does have to be fixed before ticket 09's session.

**2026-11-13, Dad, on the iPad:** (`milestone-1` with ticket 14's turn fix in) "There is still breakdown on step four. It starts with a bit of breakdown, and then just gets worse."

**2026-11-13, agent:** Fixed on branch `ticket-15-layout`. All four Step 4 Recordings of the cup now pass every one of ticket 10's acceptance tests, limits untouched, and the cup has no expected failures left. Both parts of what Dad saw are covered: the crossing already there at progress 0 (the layouts) and what grew through the turn (the motion between them). Nothing was looked at on a screen; this is from the tests.

*The rule, in the layout* (`layeredLayout` in `src/motion/mesh.ts`), three parts:

1. **Bundles.** The edge vertices lying at one folded point are taken together. Each spans the layers of the faces around it: one layer for a raw edge, the two a folded crease joins and all between. Spans that overlap are one bundle, and every vertex of a bundle takes the bundle's middle height. So a crease, the creases nested inside it, and the raw edges and corners lying in the fold all meet at one height. Why: a crease has no width in this mesh, and working through the order the layers must keep at such a point shows every vertex there has to be at the same height; the old rule (the mean of the faces touching each vertex) only gave that by luck of the arithmetic. The height now depends on which layers meet and not on how many faces do, so cutting a face along the crease about to be made no longer moves anything: Step 4's start layout is Step 3's end layout again.
2. **Gentle slopes.** A vertex next to a bundled one more than 3.5 layers away comes that much nearer, so no face climbs more than 3.5 layers over one row of its triangles (`STEEPEST`). By the arithmetic it does not act in the cup's own layouts (their deepest bundle spans eight layers, 3.5 either side of its middle); it is for part 4 below.
3. **Keeping apart.** Away from a bundle each face slopes back to its own layer over its own triangles, and two faces cut into triangles differently can overtake each other on the way (this was the one crossing left after part 1: the back panel, cut by the back flap's crease, against the uncut front panel). The layout now checks every pair of overlapping faces exactly (at every vertex of either over the other, and wherever their edges cross) and lifts the upper one clear where it is not, by 0.02 of a layer more than touching (`CLEARANCE`; exactly touching read as crossing once the Recording's heights were rounded).

*And in the turn* (`turn` in `src/motion/record.ts`):

4. The vertices bundled with the fold line's (the corners and edges of the layers the crease wraps) now ride on the turning line with them, and the rest of the paper that stays is settled at every snapshot by parts 2 and 3 (`settleStack`). Before, only the fold line's own vertices left the bundle, which is what crossed the corner flaps from snapshot 53 on.

Tried and dropped on the way: spreading each bundle's slope as one cone over all its faces (made more crossings than it cured, and bent Steps 2 and 3). Part 3 was first written as repeated sweeps in which the face nearer the bundle gave way; it is now one pass from the bottom up, which cannot undo its own work. The scattered single-snapshot crossings that were left in the back flap's Recording turned out to be faces left exactly touching, cured by the clearance.

*Numbers* (acceptance run in `src/library/library.test.ts`, at twice the snapshot rate; limits 1%, 1%, 0.015, 10 degrees). Before is `milestone-1` with ticket 14's fix.

| Step 4 Recording | Bars | Areas | Earlier creases | Faces crossing |
| --- | --- | --- | --- | --- |
| Front flap | 0.32% to 0.40% | 0.59% to 0.66% | 1.1 to 1.0 degrees | all the way through, to none |
| Back flap | 1.17% to 0.74% | 0.59% to 0.75% | 1.0 to 6.9 degrees | all the way through, to none |
| Back flap made first | 1.17% to 0.48% | 0.45% to 0.31% | 1.0 to 3.6 degrees | all the way through, to none |
| Front flap made second | 0.52% to 0.43% | 0.59% to 0.76% | 1.1 to 2.7 degrees | all the way through, to none |

The largest move between samples is 0.0046 in all four, as before. Steps 1 to 3 are unchanged to the figure shown (bars 0.02%, 0.23%, 0.41%; no crossings).

*The other Recordings.*

- Squash (`src/recordings/squash.json`): its layout moved, so it was re-recorded (`npm run record -- squash`). It passes its acceptance tests as before: bars 0.54% to 0.07%, areas 0.13% to 0.12%, largest move 0.0101 to 0.0092, earlier creases 0.0 degrees.
- Inside reverse and closed sink: their freshness tests still pass without re-recording, so they are as they were; the closed sink's 5 expected failures are untouched.
- `src/library/cup.json` rebuilt (`npm run library`). `src/recordings/cup-1.json` did not move.

*Registrations removed* (all pass now): in `library.test.ts`, crossing for all four Step 4 Recordings and stretch for the two back-flap ones; in `cup-recordings.diagnosis.test.ts`, the four "no faces cross in Step 4's start and end layouts" tests are plain tests. None added.

*What this does not do.*

- Bundling needs the layers' mesh vertices to lie at the same folded point. The cup's do (the corners' edges run the whole length of Step 4's crease). A raw edge lying along only part of a crease, with its vertices between the crease's, would not be bundled.
- The back flap folds about a line at the bottom of the stack, but its crease ends at the cup's two bottom corners, where every layer is bundled at the middle of the stack. So through the back flap's turn those two corners are squeezed down to the turning line and back, about three layer gaps (0.012 of the paper, by the layer arithmetic; not measured on a screen). That is why the earlier creases there now move 6.9 degrees, the nearest any of these numbers is to its limit.

*For Dad on the iPad:*

- Step 4 at rest, before touching it: no patches of the wrong colour, seen from above and tilted.
- Step 4 front flap through the whole drag: nothing breaking down along the fold line or at the two corners, and no patches on the flap once it is down.
- Step 4 back flap, turned over or tilted: the same, and look at the cup's two bottom corners during the Fold for the squeeze described above. If it shows, say so; it is the one thing here I would expect to be visible.
- Both orders of Step 4 (front then back, back then front).
- Steps 1 to 3 should look as they did.

**2026-11-13, Dad, on the iPad after the fix** (`milestone-1` at `373fa1b`), asked to look at Step 4 at rest, the front flap through the whole drag, and the back flap from the flipped side: "that was perfect". He did not mention the squeeze at the bottom corners. Resolved.
