# The recorder gets multi-layer Folds wrong: the cup's Steps 2 to 4

Status: needs-triage
Type: task
Blocked by: 07

## Why

Found while building ticket 07 (see its comment, "Flagged: the cup's later Folds do not look right"). Ticket 10's acceptance tests, run on every Recording in the cup (`src/library/library.test.ts`), pass only for Step 1:

- Steps 2 and 3: faces cut through each other part way through the Fold.
- Step 4 (all four Recordings): faces already cross in the starting layout, and bars are up to 2.3% long against the 1% limit.

It shows on screen: in Step 4, lying flat and seen from above, the top flap has patches of the wrong colour. The cause was not diagnosed. The recorder (`src/motion/`) had only been exercised on a first Fold of a flat square (ticket 04's exact path for plain Folds) and on the prototype's three complex Folds.

The failures are registered as 10 expected failures in `src/library/library.test.ts`, with the limits untouched. Fixing this means those tests pass and the registrations are removed.

## Why it matters for Milestone 1

The cup is four Steps and three of them are affected, so this stands between ticket 08's Import and ticket 09's iPad session: any Model Import produces with a Fold over more than one layer will carry the same fault.

## Comments

**2026-11-13, agent:** Filed during the Milestone 1 integration run from ticket 07's report. Not triaged, not started.

**2026-11-13, Dad, on the iPad** (branch `milestone-1`, dev server):

- Step 1: fine.
- Step 2: the Fold is good and the layers are correct, but nearing the end of the Fold the bottom of the flap, near the fold line, starts to break down.
- Step 3: the same as Step 2.
- Step 4: the major problem. The flap is shown going to the outside of the cup instead of tucking inside, and then it just pushes through the cup at the end.

**2026-11-13, Dad, second look:** Step 4's flap travelling on the outside of the cup is correct (the recipe says over the two corners). What is wrong in Step 4 is the same kind of break-down at the end of the Fold as in Steps 2 and 3. Treat it as one fault across all three Steps at the end of the Fold, not a separate "pushes through" problem.

**2026-11-13, agent, diagnosis:** Not fixed, only diagnosed. Branch `ticket-14-diagnosis`. Reproduction: `src/library/cup-recordings.diagnosis.test.ts` (0.4 s; the faults are pinned as expected failures). Every number below prints with `T14_REPORT=1 npx vitest run src/library/cup-recordings.diagnosis.test.ts --disable-console-intercept` (5 s). Heights are in layer gaps (`LAYER_GAP` = 0.004, `mesh.ts:19`), toward him positive. Snapshots are 0 to 104: 0 the start, 1 to 100 the turn, 101 to 104 the catch-up.

There are two faults. Fault A is what Dad sees in Steps 2, 3 and 4. Fault B is in Step 4 only and is the less visible one.

*Fault A, the motion: the turn brings the flap down inside the stack (Steps 2, 3 and 4).* All six Recordings take the plain Fold's exact path, `turn` in `src/motion/record.ts:126-157`; the solver never runs. Three things in it are right for one layer and wrong for a stack:

1. The line the flap turns about is put at the mean starting height of the moving vertices (`record.ts:115-116`). A half turn about that line brings each layer of the flap back to the heights the flap started at, and the paper it should land on is at those same heights. Step 2 at snapshot 100: flap layers at -0.50 and +0.50, the two layers beneath them at +0.50 and -0.50. Step 3 the same (-1.17 and -0.17 against -0.17 and -1.17). Step 4's front flap starts as layer 1 under the four corner layers and at snapshot 100 is back at -1.28, under all four (they are at -0.28 to +2.71), when it should be on top at +3.
2. A vertex counts as moving only if its place on the flat changes (`record.ts:128`), so the vertices on the fold line stay at their starting heights for the whole turn (`record.ts:143`). In a stack each layer's fold-line vertices lie at that layer's own height (Step 2: vertex 4 at +0.5, vertex 6 at -0.5), not on the turn's line. Past upright the flap's layers have swapped sides and their fold-line vertices have not, so the layers cross each other in an X along the fold line: Step 2 faces 0 and 1 from snapshot 51 to 97, Step 3 faces 2 and 3 from 51 to 97. In Step 3 the flap also crosses the first corner flap (faces 0 and 1) from snapshot 56 to 99; that corner's tip touches the fold line at (1, 0), so I take it to be the same X catching it, but did not look at those triangles one by one. This is also where the long bars come from: a bar from a fold-line vertex into the flap changes length by about that vertex's distance from the turn's line, most at upright. Step 2: 0.5 gap off, 0.89% at snapshot 52. Step 4 front flap: vertex 7 is 1.00 gap off, 1.36% at snapshot 50. Step 4 back flap: vertex 9 is 1.67 gaps off, 2.30% at snapshot 50 (0.00667 over a 0.2071 bar is 3.2%; the measured figures in all three are about 0.7 of offset over length, as for a bar lying at 45 degrees to the line, which I did not check bar by bar).
3. The catch-up (`record.ts:152-155`) then slides every vertex in a straight line from where the turn left it to the engine's layout, which carries the flap's layers through the layers they are lying inside. Step 2: flap against the paper beneath, on and off from snapshot 99 to 103. Step 3: against the first corner flap as well, 102 to 103. Step 4: the front flap rises through all four corner layers over 101 to 104.

Why Dad sees it "nearing the end, near the fold line": a point of the flap is inside the stack once its height above the turn's line is under a gap or so, which happens first next to the fold line and spreads outward over the last five or so snapshots of the turn (by my arithmetic, at snapshot 96 within about 0.03 of the line, at 98 within 0.06, at 100 everywhere; the flap's centre heights at 96, 98 and 100 are in the report). Step 4's "pushes through the cup at the end" is the same thing with four layers to go through instead of one.

Evidence that this is the cause: the layouts at both ends of Steps 2 and 3 have no faces crossing (a passing test in the reproduction), so it is the motion between them. A prototype of the corrected turn in the reproduction (`prototypeTurn`: same mesh, same layouts, the line placed where the flap is mirrored between the start and end layouts, fold-line vertices brought to their end heights over the first 10 snapshots, the stack's shift fed in through the turn, no catch-up needed) gives no faces crossing at any snapshot in Steps 1, 2 and 3, with bars within 0.02%, 0.23% and 0.40%. Feeding the fold-line vertices in over the whole turn instead brings the X back (Step 2: 52 to 83, bars 1.73%), which confirms point 2.

*Fault B, the layout: Step 4's start and end layouts have faces crossing before anything moves.* `layeredLayout` (`src/motion/mesh.ts:286-311`) puts each vertex at the mean height of the faces that touch it (`mesh.ts:307`). That only stays sound while every vertex at one folded point comes out at the same height, which in Steps 2 and 3 it does by arithmetic (Step 3's end layout: vertices 1, 7, 9 at the point (1, 0) are all at 0.00; no crossings). Step 4 breaks it two ways:

- At the start: the mesh is cut along the new crease, so the face being folded is two faces of the same layer, and the vertices at the ends of the new crease now average three faces instead of two. The same Paper that was sound as Step 3's end has, as Step 4's start, vertices 1, 7, 9 at +0.21, -0.29, +0.21, and the corners poke through each other: faces 0x2, 0x5, 1x2, 2x5, 4x5, 5x6 at snapshot 0, and they stay crossed through the turn because nothing but the flap moves. This is "faces already crossing at progress 0".
- At the end: the new crease joins layer 1 to layer 6 (front flap) or layer 0 to the layer above (back flap), and the four corner layers in between have their raw edges lying exactly along that crease (the recipe lands the corners there on purpose). The crease's vertices sit at 0.00 to 0.67 while those raw edges sit at their own layers, so next to the crease the top flap dips below the corner flaps (faces 2x4, 3x4: face 4's crease midpoint at +0.50 under face 2's edge at +0.67 to +1.00) and the layer beneath rises above them (0x6, 1x6, 3x6). Lying flat and seen from above, that would show as patches of the wrong colour on the top flap next to the fold line; I have the numbers for this, not a picture of it.

The 2.3% bars in Step 4 are fault A's point 2, made worse by fault B: the crease's vertices are at uneven heights, so no one line can hold them all (the prototype turn alone brings Step 4's bars to 0.66% for the front flap and 1.19% for the back flap, the second still over the limit).

*Ruled out.*

- The engine's layer order: right. After Step 4 the layers are corner flaps 3 to 6, front flap 7 (on top of both corners), back flap 0 (beneath everything); a passing test in the reproduction. The flap travelling on the outside is the recipe.
- The renderer: `src/view/shape.ts:83-88` places the recorded positions as they are, one rigid move for the whole paper; the crossings are in the Recording's own numbers. Read from the code, not checked on a screen.
- Playback's blending: the crossings are at the snapshots themselves, not only between them.
- The solver and the triangulation: the solver does not run for these Folds (nothing but the flap moves over snapshots 0 to 100), and the prototype turn is clean on the same mesh.
- The starting layout for Steps 2 and 3: no crossings. (For Step 4 it is at fault: fault B.)
- The catch-up as the only cause: the X starts at snapshot 51 and the flap is already inside the stack at snapshot 100, before the catch-up begins. The catch-up is the last part of fault A, not all of it.

*Candidate fixes.*

1. Fix the turn (`turn` and `plainFoldAxis` in `record.ts`, about 40 lines): turn about the line the flap is mirrored in between the two layouts, so it comes down on top of (or beneath) the stack at its finished height; bring the fold-line vertices onto that line early and feed the stack's shift in through the turn; the catch-up for plain Folds then has nothing left to do. Cost: small, perhaps half a day with tests and a rebuilt `cup.json`. Risk: low. The prototype passes crossing and stretch for Steps 1 to 3 (Step 1: bars 0.02%), and the complex Folds do not use this path. The prototype was only run through the crossing and stretch checks, not the whole acceptance set (smoothness, earlier creases holding, spring-back), so those are still to be shown. The one number to tune is how early the fold-line vertices arrive (10 snapshots in the prototype; 20 gave 0.75% in Step 3 in the scratch runs, 100 fails), and Dad should look at the start of the Fold on the iPad for it. This removes the two registered failures for Steps 2 and 3 and, in Step 4, the flap pushing through at the end. It does not make Step 4 pass.
2. Fix the layout (`layeredLayout` in `mesh.ts`): make it hold for a crease wrapped round other layers' edges and for a face cut by the new crease, for instance by giving every vertex at one folded point on a folded crease one height. Cost: medium to large, a day or two at a guess, and not yet designed: two crude versions tried in scratch work, not committed (pinch every coincident vertex; pinch only those on folded creases), each cleared some of Step 4's layouts and broke others (the first pinched the tips of the front and back flaps together through six layers), and with fix 1 on top only one of the four Step 4 Recordings came out fully clean (front flap made second: no crossings, bars 0.53%). Risk: medium. Every Recording's start and end come from this layout and the hinges' rest angles are measured from it (`mesh.ts:203-204`), so the inside reverse, squash and sink Recordings (tickets 10 to 13) all move and need their acceptance runs again.

*Recommendation.* Do fix 1 now under this ticket: it is small, the prototype shows it works for Steps 2 and 3, and it removes what Dad sees in all three Steps. Then look again on the iPad. Split fix 2 into its own ticket: it is what stands between Step 4 and the acceptance tests (the eight registered Step 4 failures stay until it is done) and what the numbers say causes the colour patches lying flat, but it needs a design decision about how a zero-width crease wraps a stack, and it touches every Recording.
