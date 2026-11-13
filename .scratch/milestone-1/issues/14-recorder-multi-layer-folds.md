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
