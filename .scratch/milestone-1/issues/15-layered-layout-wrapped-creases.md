# The layered layout breaks where a crease wraps other layers: the cup's Step 4

Status: needs-triage
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
