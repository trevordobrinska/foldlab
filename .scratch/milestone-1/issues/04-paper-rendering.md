# Render the paper in three.js with a moveable view

Status: ready-for-agent
Type: task
Blocked by: 03

Draw an engine state as two-sided paper with visible layer edges, lit so layers read clearly, smooth on his iPad. Background touches move the view: two-finger pinch zoom and twist rotate; a button tilts the paper to show the layers in 3D. Animate between two states (a Fold folding over). No folding gestures yet.

## Notes from tickets 02, 10, 11 and 12 (2026-11-13)

- **Animation is a recording played back.** Folds are worked out once, ahead of time, by the recorder in `src/motion/` (`record`, then the physics-free `playback`), and the page only plays them. The page bundle must never include the physics (`solve.ts`, `hinge.ts`, `mesh.ts`, `motion.ts`, `record.ts`). So "animate between two states" means playing a Recording of that Step. In the real app, Recordings come from Import (ticket 08) and travel in the Model file (ticket 07), one per Step. For this ticket, use recorded fixtures.
- **Retire the gesture test page.** He has tried it and the gestures are accepted (ticket 02). Delete `proto-gestures/` and its entries in `vite.config.ts` and `tsconfig.json`. Move what's still needed into `src/`: the recorded Steps (`papers.ts`) and their recordings, plus the tests that use them (Fresh, no-physics-in-page, the acceptance tests), with `npm run record` writing to the new place. Reuse the test page's three.js view and frame code (`view.ts`, `frame.ts`) where it helps, and leave anything only the test page needed (canned geometry, the gesture recogniser) to git history.
