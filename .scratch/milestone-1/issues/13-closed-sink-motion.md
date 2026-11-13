# The closed sink moves like real paper

Status: needs-triage
Type: task
Blocked by: 12

## Why

Ticket 12 gave the closed sink its exact finished shape, but the paper doesn't move while he pushes; it jumps to the end. Two attempts with the bar-and-hinge recorder failed: the plain drive jammed, and the prescribed opening motion either crumpled or broke the limits (ticket 12 comments). Real paper makes closed sinks all the time, so the Fold is possible; the method is what's wrong. Our model has stiff faces, a coarse mesh and no snap-through, and real paper does the closed sink by bending and snapping the point through.

## Directions to weigh

- Paper that can bend smoothly: a much finer mesh in the sinking region, with a bending limit per length instead of per facet, and a snap-through step.
- A different solver for this Fold: for example, curved-crease or developable-surface kinematics for the point as it goes in.
- Study how real paper does it: film or photograph a real closed sink and match the motion.

The finish must still be exactly the engine's state, and the paper must never stretch or pass through itself. The limits for bending during the motion are to be agreed with Dad.

## Out of scope

Milestone 1 (the cup needs no sink). Comes with the full Fold set.

## Comments
