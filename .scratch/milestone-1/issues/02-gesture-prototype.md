# Throwaway prototype: squash, inside reverse and sink gestures

Status: ready-for-human
Type: prototype

DESIGN.md: complex Fold types copy the real hand motion; he tries the three hardest before they're final. A throwaway page (not the engine; canned geometry is fine) under `/foldlab/proto-gestures/` where each of the three Folds can be made by the proposed gesture on his iPad, with a calm spring-back when the gesture doesn't match. Then a tablet session with him (ready-for-human): record which gestures felt right and what he'd change, as the answer here. Deleted once the real Folds are built.

## Comments

**2026-11-12, agent:** Prototype built in `proto-gestures/` (second Vite entry, live at `/foldlab/proto-gestures/` once on master). Proposed gestures, each a one-finger or Pencil push the paper follows:

- **Squash:** touch the top of the standing flap and press it straight down; it opens and lies flat.
- **Inside reverse:** touch the tip of the point and push it down and back between its layers.
- **Closed sink:** press and hold the point until its ring fills in (400 ms), then push it down inside. The hold is what tells it apart from a squash pushed the same way.

A miss springs back (450 ms) and the target pulses twice. No real touch has been tested yet. Watch in the session: whether the edge-on squash flap reads as a standing flap, whether the sink hold feels natural or slow, and whether the pulse works in Safari. Status is ready-for-human, waiting on the tablet session.
