// Throwaway prototype (ticket 02): the squash, inside reverse and sink
// gestures on canned 3D paper. Not the engine; delete this folder (and its
// entries in vite.config.ts and tsconfig.json) once the real Folds exist.
//
// The proposed gestures, each a single-finger (or Pencil) push that copies
// the real hand motion. Squash and closed sink push the same way, so the
// sink starts with a press-and-hold, the way a finger presses a point in:
//
//   Squash          Touch the top of the standing flap and press it straight
//                   down. The flap opens symmetrically as it goes and lies
//                   flat as a kite. (Real hands: open the flap, press flat.)
//
//   Inside reverse  Touch the tip of the folded point and push it back in
//                   between its two layers, across the pre-crease. The point
//                   swings through the layers and comes out reversed. (Real
//                   hands: part the layers and push the point through.)
//
//   Closed sink     Press and hold the closed point until its ring fills
//                   in, then push it down into the model. It flattens to the
//                   pre-crease, then inverts inside, where it shows as an
//                   x-ray line. (Real hands: press the point in.)
//
// The paper follows the finger. On release: a match settles into the
// finished Fold; anything else springs back calmly and the target (the push
// arrow and the ring on the point) pulses twice, then stops.
//
// The paper is a three.js scene (view.ts) drawn from canned 3D geometry
// (geometry.ts). The finger, the recognizer and the target overlay share
// one frame: the 0..100 square of the canvas (frame.ts), into which each
// Fold's grab point and push axis are projected through its camera.

import "../src/style.css";
import "./style.css";
import { FOLDS, FOLD_ORDER, type FoldType } from "./folds";
import { pixelToFrame } from "./frame";
import { target, type Shape } from "./notation";
import { heldStill, judge, progressOf, tookHold, type PathPoint } from "./recognize";
import { PaperView } from "./view";

const SVG_NS = "http://www.w3.org/2000/svg";

const tabs = document.querySelector<HTMLElement>("#tabs")!;
const stage = document.querySelector<HTMLElement>("#stage")!;
const canvas = document.querySelector<HTMLCanvasElement>("#paper")!;
const targetLayer = document.querySelector<SVGSVGElement>("#target")!;
const prompt = document.querySelector<HTMLElement>("#prompt")!;
const again = document.querySelector<HTMLButtonElement>("#again")!;

const view = new PaperView(canvas);

let current: FoldType = "squash";
let progress = 0;
let done = false;
let path: PathPoint[] = [];
let pointerId: number | null = null;
let startedAt = 0;
let animation: number | null = null;
let holdTimer: number | undefined;

/** Fills the ring when a Fold's press-and-hold is done, if the finger is
 *  still on the point. Squash and inside reverse have no hold. */
function startHold() {
  const spec = FOLDS[current].push;
  if (!spec.holdMs || !tookHold(spec, path)) return;
  holdTimer = window.setTimeout(() => {
    const last = path[path.length - 1];
    const now = { ...last, t: performance.now() - startedAt };
    if (pointerId !== null && heldStill(spec, [...path, now])) {
      targetLayer.classList.add("held");
    }
  }, spec.holdMs);
}

function endHold() {
  window.clearTimeout(holdTimer);
  targetLayer.classList.remove("held");
}

// --- Drawing ---------------------------------------------------------------

function el(shape: Shape): SVGElement {
  switch (shape.kind) {
    case "polygon": {
      const e = document.createElementNS(SVG_NS, "polygon");
      e.setAttribute("points", shape.points.map((p) => `${p.x},${p.y}`).join(" "));
      e.setAttribute("class", shape.cls);
      return e;
    }
    case "circle": {
      const e = document.createElementNS(SVG_NS, "circle");
      e.setAttribute("cx", String(shape.c.x));
      e.setAttribute("cy", String(shape.c.y));
      e.setAttribute("r", String(shape.r));
      e.setAttribute("class", shape.cls);
      return e;
    }
  }
}

function draw() {
  view.show(current, progress);
  // The target is shown while the paper is untouched, hidden once it moves.
  targetLayer.style.opacity = progress === 0 && !done ? "1" : "0";
}

function drawTarget() {
  targetLayer.replaceChildren(...target(FOLDS[current].push).map(el));
}

// The canvas follows its container (landscape or portrait); the frame is
// its centred square, so the target overlay (an SVG with the same square
// viewBox, "meet") lines up with the projected paper at any size.
function fit() {
  const rect = stage.getBoundingClientRect();
  view.resize(rect.width, rect.height);
  draw();
}
new ResizeObserver(fit).observe(stage);

// --- Animation (never loops) -----------------------------------------------

const easeOut = (k: number) => 1 - (1 - k) ** 3;

function animateTo(to: number, ms: number, then?: () => void) {
  if (animation !== null) cancelAnimationFrame(animation);
  const from = progress;
  const t0 = performance.now();
  const frame = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    progress = from + (to - from) * easeOut(k);
    draw();
    if (k < 1) {
      animation = requestAnimationFrame(frame);
    } else {
      animation = null;
      then?.();
    }
  };
  animation = requestAnimationFrame(frame);
}

function pulseTarget() {
  // Two gentle pulses, then still. The CSS sets the count; this just restarts it.
  targetLayer.classList.remove("pulse");
  void targetLayer.getBoundingClientRect(); // restart the animation
  targetLayer.classList.add("pulse");
}
targetLayer.addEventListener("animationend", () => targetLayer.classList.remove("pulse"));

// --- Gesture ---------------------------------------------------------------

function framePoint(e: PointerEvent): PathPoint {
  const rect = canvas.getBoundingClientRect();
  const pt = pixelToFrame(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
  return { x: pt.x, y: pt.y, t: performance.now() - startedAt };
}

stage.addEventListener("pointerdown", (e) => {
  if (done || pointerId !== null || animation !== null) return;
  e.preventDefault();
  pointerId = e.pointerId;
  stage.setPointerCapture(e.pointerId);
  startedAt = performance.now();
  path = [framePoint(e)];
  progress = 0;
  draw();
  startHold();
});

stage.addEventListener("pointermove", (e) => {
  if (e.pointerId !== pointerId) return;
  e.preventDefault();
  path.push(framePoint(e));
  const next = progressOf(FOLDS[current].push, path);
  if (next === progress) return; // render on demand only
  progress = next;
  draw();
});

function release(e: PointerEvent) {
  if (e.pointerId !== pointerId) return;
  pointerId = null;
  endHold();
  path.push(framePoint(e));
  const verdict = judge(FOLDS[current].push, path);
  if (verdict === "match") {
    animateTo(1, 350, () => {
      done = true;
      again.classList.add("ready");
      draw();
    });
  } else {
    animateTo(0, 450, pulseTarget);
  }
}
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);

// --- Choosing a Fold and starting again -------------------------------------

function select(type: FoldType) {
  if (animation !== null) cancelAnimationFrame(animation);
  animation = null;
  pointerId = null;
  endHold();
  current = type;
  progress = 0;
  done = false;
  path = [];
  again.classList.remove("ready");
  targetLayer.classList.remove("pulse");
  prompt.textContent = FOLDS[type].prompt;
  for (const button of tabs.querySelectorAll<HTMLButtonElement>("button")) {
    const selected = button.dataset.fold === type;
    button.setAttribute("aria-pressed", String(selected));
  }
  drawTarget();
  draw();
}

for (const type of FOLD_ORDER) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.fold = type;
  button.textContent = FOLDS[type].name;
  button.addEventListener("click", () => select(type));
  tabs.append(button);
}

again.addEventListener("click", () => select(current));

// Debug only: `?fold=sink&p=0.5` opens a Fold at a given progress so the
// drawing can be checked without a finger.
const params = new URLSearchParams(location.search);
const wanted = params.get("fold") as FoldType | null;
fit();
select(wanted && FOLD_ORDER.includes(wanted) ? wanted : current);
const p = Number(params.get("p"));
if (p > 0) {
  progress = Math.min(1, p);
  draw();
}
