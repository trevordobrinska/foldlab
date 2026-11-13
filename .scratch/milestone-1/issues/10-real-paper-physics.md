# Real paper physics for one Fold at a time, starting with inside reverse

Status: ready-for-agent
Type: task
Blocked by: 03

## Why

The 3D gesture prototype (ticket 02) animates each Fold by hand, so it doesn't behave like paper: the inside reverse's tip passes through the side of a layer instead of going down into the middle, and the sink stretches. Dad wants every Fold to move like real paper. FoldLab is an interactive game played Step by Step, not a crease pattern that collapses all at once, so the physics has to work on one Fold at a time.

## What to build

1. **The engine knows the Step.** The fold engine (`src/engine/`, ticket 03) holds the Paper after each Fold, including which creases are already folded and the layer order. Add an inside reverse to the engine: a two-layer point is reversed between its own layers along a given line, and the engine gives its finished flat state and layer order, with tests. The engine stays the source of truth for where every Fold must end.
2. **The physics moves one Fold.** A new pure module (in `src/`, next to the engine, not in the throwaway prototype folder) takes the Paper as it is now and the Fold being made, and gives the paper's 3D shape at any progress from 0 to 1. Only this Fold's creases move. Folds already made stay folded, so the paper behaves like paper lying on a table.
   - Use real paper physics: a bar-and-hinge model, the method of Origami Simulator (Ghassaei, Demaine, Gershenfeld, 2018). Faces stay stiff, creases are hinges driven towards their target angle, and the paper finds its own path. We borrow the method only, not Origami Simulator's all-at-once folding. If a Fold can be solved exactly (the inside reverse folds without bending), an exact solution is fine instead.
   - Layers that touch must not pass through each other.
3. **His finger drives it.** In the gesture prototype (`proto-gestures/`), the inside reverse tab uses the real engine state and the physics module instead of hand-made geometry. Gesture progress drives physics progress. On a match the Fold finishes exactly into the engine's state; on a miss it springs back to where the Step began.

## Done when (automatic tests, every one passing)

Each test samples the Fold at many progress values (at least 50 from 0 to 1):

- **No stretching:** every edge length and face area stays within 1% of the flat paper's.
- **No passing through:** no two faces intersect at any sample (layers that lie flat together may touch).
- **The inside reverse goes down into the middle:** the tip moves between the two outer layers, and the two layers of the tip stay mirror images of each other across the middle plane.
- **Right start, right finish:** progress 0 equals the current Paper and progress 1 equals the engine's finished state, including the layer order.
- **Smooth:** no face jumps between neighbouring samples.
- **Earlier Folds hold:** creases from earlier Steps keep their angles throughout.
- **Spring-back:** running progress back to 0 returns the starting state.

Also: `npm run typecheck`, `npm test` and `npm run build` pass, and screenshots of the inside reverse at the start, halfway and finished look right.

## Revision (2026-11-12): record once, play back

Dad tried the first version: the inside reverse ran at about 20 frames a second, because the physics ran live on every finger move. New rule: **the physics never runs while he is folding.** Each Fold is worked out once, ahead of time, as a recording: a short series of snapshots of the paper from progress 0 to 1. His finger only plays the recording.

1. **Record.** A pure function in `src/motion/` turns (Paper before, Paper after) into a Recording: the mesh plus at least 51 snapshots, with progress 0 and 1 exactly the engine's two Papers. The physics from the first version is reused unchanged except for whatever recording needs.
2. **Record ahead of time, not in the browser.** Recordings are made on the computer, the way Import works (ADR 0003: Models are imported on Dad's computer and published with the app). For now a script (`npm run record`) writes the prototype's inside reverse recording to a small data file that is committed and loaded by the page. The page contains no physics.
3. **Play.** `at(p)` blends the two nearest snapshots. Moving the finger costs only that blend plus drawing.
4. **Spring-back is the recording played backwards** toward progress 0, so "can't unfold from finished" no longer matters, and "Again" plays back to the start too.

Done when, in addition to the tests above (now run on the recording, including points halfway between snapshots):

- **Fast:** playing one frame (blend + mesh update, without the GPU draw) costs under 1 ms on the desktop, measured by a test; the page bundle does not include `src/motion/solve.ts`.
- **The recording is fresh:** a test re-records and checks it matches the committed file, so the file can't drift from the code.
- Dad checks on the iPad that the inside reverse follows his finger smoothly.

## Out of scope

Squash and sink (next, the same way, as their own tickets: exact engine Fold, recording, and a check against a known origami result; once the inside reverse is accepted; real paper bends a little during a closed sink, so that one needs extra care), view controls (ticket 04), drag-to-land (ticket 05).

## Comments

**2026-11-12, agent:** Implemented; awaiting review.

- Engine: `insideReverse(paper, { line, tip })` in `src/engine/paper.ts`. The two layers under `tip` joined by a folded edge on the tip's side each turn toward the other; creases inside the tip (its spine) turn inside out; each layer's tip keeps its own side of the point in the layer order. `makeFold` was split into a shared cut/perform so both Folds use the same face splitting and `faceOrders` bookkeeping. Tests in `paper.test.ts`.
- Physics: `src/motion/` (`motionOf(before, after)`): bar-and-hinge mesh (`mesh.ts`: fan + one midpoint subdivision per face, bars on every triangle edge, crease hinges driven from the start angle to the end angle, soft facet hinges), solved by extended position-based dynamics run quasi-statically with Jacobi-averaged passes (`solve.ts`), vertex-face contacts keeping layers a gap apart. Hinge start/end angles are measured on the layered flat-folded Papers, so both ends are exact rests; at either end the paper is pressed flat (stiff facets while settling).
- A rigid (exact) inside reverse does not exist without unfolding the point's spine completely: the degree-4 vertex where the line meets the spine only moves with the body opening (tan φ · cos α = cot(θ/2)), so the paper bends near the crease, which is what the physics shows and what hands do ("open the layers").
- Acceptance tests in `src/motion/motion.test.ts` (51 samples): no stretching (max 0.5%), no crossings, tip on the middle plane and the two layers mirror images (to 1e-6), start/finish equal the engine's Papers with layer order, smooth (max step 0.04 of the paper per 2% progress), earlier creases within 10° (the spine stays within 5°), spring-back from 0.3/0.55/0.8 returns within 0.5% of the paper's width.
- Known limits: unfolding from the finished state (progress 1 back to 0) is not reliable (the tips must come back out of four closed layers and the symmetric path buckles); the prototype starts afresh on "Again" instead. A full sweep costs about 2.5 s of CPU on a desktop, so a fast finger lags on the iPad.
- Prototype: `proto-gestures/scene.ts` drives the Inside reverse tab from the engine state and the physics; squash and sink are still canned.

**2026-11-12, agent (revision: record once, play back):** Implemented; awaiting review.

- Recording: `src/motion/recording.ts` is the data format (topology once, then `frameCount × vertexCount × 3` positions rounded to 1e-5 of the paper, plus the Paper's `view`; laid out the way FOLD lays out frames so a Step's frame can inherit the topology later). `src/motion/record.ts` makes one from (Paper before, Paper after) with the solver unchanged (`solve.ts`, `mesh.ts`, `hinge.ts`, `motion.ts` untouched). Two things a recording needed that the live finger didn't: snapshots are spaced by how far the paper travels (a first sweep measures it, the kept sweep drives the hinges to the angles at which the paper has moved an equal share), so the tip's fast swing gets the most snapshots and blending halfway between two no longer cuts corners; and the hinges arrive four snapshots early with the paper pressed flat a little at a time over the last ones, because the solver trails its target by a few steps and the old one-shot settle at progress 1 was a 0.026 jump. Snapshot 0 is `mesh.start` and the last is `mesh.end`, rounded. 105 snapshots, forward only; the solver never unfolds.
- Playback: `src/motion/playback.ts` (`playbackOf(recording).at(p, buffer)`) blends the two nearest snapshots into a Float32Array; no physics imported. Measured by the Fast test: 0.4–0.7 µs per frame for the blend plus laying out the 56-triangle position buffer (budget 1 ms).
- Ahead of time: `npm run record` (`scripts/record.mjs` boots Vite's SSR loader to run `scripts/record.ts`; no tsx) writes `proto-gestures/recordings/inside-reverse.json` from `proto-gestures/papers.ts` (the Step: square folded on its diagonal, corner reversed along (0.6,0.6)→(0.7,1), rotated 104°). 82 kB, one line per snapshot; about 7 s (two sweeps). `@types/node` added as a devDependency so the record script and the tests that read files typecheck.
- Prototype: `proto-gestures/scene.ts` plays the recording into one reused buffer; it imports neither the engine nor the physics (the page gets `view` and the mesh from the file). Spring-back and "Again" play back to 0 through the recording (`main.ts`). Squash and sink unchanged.
- Tests (106 passing, suite about 8 s): `src/motion/motion.test.ts` runs the acceptance tests on a fresh recording through playback at 209 samples, every other one halfway between snapshots; `src/motion/playback.test.ts` has the blend unit tests and Fast; `proto-gestures/recordings.test.ts` has Fresh (re-records, requires the committed file to be the serializer's own output and every coordinate within one rounding step) and the no-physics check, done by walking the page's static import graph from `main.ts` (value imports only; type imports are erased) and asserting `solve.ts`, `hinge.ts`, `mesh.ts`, `motion.ts`, `record.ts`, `engine/paper.ts` and `rabbit-ear` are never reached. That is robust to minification and chunking and needs no build; the built chunk was also grepped by hand (`creaseCompliance`, `findContacts`, `dihedralGradient`, `makeVerticesCoordsFlatFolded`: absent).
- Measured on the committed recording (209 samples): bars within 0.54%, face areas within 0.93% (0.925% at the snapshots, 0.934% halfway between them), no crossings, tip on the middle plane with the layers mirror images, earlier creases within −5.2°..+1.2°, largest move 0.022 of the paper per snapshot, ends equal the engine's layouts to 5e-6.
- Bundle: `protoGestures-*.js` 564,591 → 619,442 bytes (158.8 kB gzip). The engine and physics left (about 27 kB) and the 82 kB JSON string came in, inlined by Vite; fetching it as a separate asset would be an easy follow-up if the chunk size matters.
- Known limits: the 1% face-area margin is thin (0.93%). It is the solver's own squeeze of the tip during the swing (its sliver fan triangles amplify a 0.3% bar error into 0.9% of face area), not the recording's; stiffer bars (more bar passes or over-relaxation) remove the stretch but make the spine over-fold through the neighbouring layer, which the contacts miss at a crease edge, so the tuning was left alone. A bar-only projection of each snapshot was tried and dropped for the same reason. Progress is no longer linear in hinge angle (steady speed under the finger instead), so the layers open earlier in progress than in the first version's screenshots. Dad's iPad check is still to do.
