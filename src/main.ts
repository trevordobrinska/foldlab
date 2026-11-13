// FoldLab: the paper on his iPad. For now (ticket 04) one recorded Step is
// drawn as real layered paper; two fingers on the background move the view
// and a button tilts it to show the layers. Folding gestures come with
// ticket 05, the Model player (which chooses the Step and plays its
// Recording) with ticket 07. The house button stays in index.html (suite
// rule 5).
//
// This page carries no physics and no engine: a Step's motion was recorded
// once on the computer (src/motion/record.ts) and is only played back here.

import "./style.css";
import cupStep1 from "./recordings/cup-1.json";
import type { Recording } from "./motion/recording";
import { clamp, FLAT, fitting, pinched, pinchOf, TILTED, viewOf, type Orbit, type Touch } from "./view/camera";
import { steppedPaper } from "./view/shape";
import { PaperView } from "./view/view";

const stage = document.querySelector<HTMLElement>("#stage")!;
const canvas = document.querySelector<HTMLCanvasElement>("#paper")!;
const tiltButton = document.querySelector<HTMLButtonElement>("#tilt")!;
const foldButton = document.querySelector<HTMLButtonElement>("#fold")!;
const readout = document.querySelector<HTMLElement>("#stats")!;

// --- The paper and the view ------------------------------------------------

// The fixture: the cup's first Step. Ticket 07's Model player replaces this
// with the Model's own Steps and Recordings.
const paper = steppedPaper(cupStep1 as Recording);
const { orbit: home, limits } = fitting(paper.extent);

const view = new PaperView(canvas);
let orbit: Orbit = home;
let progress = 0;
let tilted = false;

const params = new URLSearchParams(location.search);
const showStats = params.has("stats");

function draw() {
  view.show(paper.at(progress));
  view.look(viewOf(orbit));
  view.render();
  if (showStats) {
    const { renders, ms, drawCalls, triangles } = view.stats;
    readout.textContent = `renders ${renders}, ${ms.toFixed(2)} ms, ${drawCalls} calls, ${triangles} triangles`;
  }
}

function fit() {
  const rect = stage.getBoundingClientRect();
  view.resize(rect.width, rect.height);
  draw();
}
new ResizeObserver(fit).observe(stage);

// --- Animation: a short move, then still; never loops ----------------------

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

/** One running animation per subject; starting another replaces it from where it is. */
const running = new Map<string, number>();
function animate(subject: string, ms: number, step: (k: number) => void, then?: () => void) {
  const earlier = running.get(subject);
  if (earlier !== undefined) cancelAnimationFrame(earlier);
  const t0 = performance.now();
  const frame = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    step(easeInOut(k));
    draw();
    if (k < 1) {
      running.set(subject, requestAnimationFrame(frame));
    } else {
      running.delete(subject);
      then?.();
    }
  };
  running.set(subject, requestAnimationFrame(frame));
}

// --- The tilt button: a camera move only --------------------------------------

function setTilted(next: boolean, ms = 500) {
  tilted = next;
  tiltButton.setAttribute("aria-pressed", String(tilted));
  tiltButton.textContent = tilted ? "Lay flat" : "Tilt";
  const from = orbit.elevation;
  const to = tilted ? TILTED : FLAT;
  if (ms <= 0) {
    orbit = { ...orbit, elevation: to };
    return;
  }
  animate("tilt", ms, (k) => (orbit = { ...orbit, elevation: from + (to - from) * k }));
}
tiltButton.addEventListener("click", () => setTilted(!tilted));

// --- Two fingers on the background: pinch to zoom, twist to turn, slide to look ---
// Every touch on the canvas is "background" until folding gestures (ticket 05).

const fingers = new Map<number, Touch>();
const pair = (): [Touch, Touch] | undefined => {
  if (fingers.size !== 2) return undefined;
  const [a, b] = [...fingers.values()];
  return [{ ...a }, { ...b }];
};

canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
});

canvas.addEventListener("pointermove", (e) => {
  if (!fingers.has(e.pointerId)) return;
  e.preventDefault();
  const before = pair();
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const after = pair();
  if (!before || !after) return;
  const rect = canvas.getBoundingClientRect();
  orbit = pinched(orbit, pinchOf(before, after), rect.width, rect.height, limits);
  draw();
});

const lift = (e: PointerEvent) => {
  fingers.delete(e.pointerId);
};
canvas.addEventListener("pointerup", lift);
canvas.addEventListener("pointercancel", lift);

// --- Temporary: play the Step's Recording ----------------------------------
// Ticket 07's Model player replaces this button; folding gestures (ticket 05)
// will drive the Recording from his finger instead.

let folded = false;
function setFolded(next: boolean, ms = 1100) {
  folded = next;
  foldButton.textContent = folded ? "Unfold" : "Fold";
  const from = progress;
  const to = folded ? 1 : 0;
  if (ms <= 0) {
    progress = to;
    return;
  }
  animate("fold", ms * Math.abs(to - from), (k) => (progress = from + (to - from) * k));
}
foldButton.addEventListener("click", () => setFolded(!folded));

// --- Start ------------------------------------------------------------------
// Debug only: `?p=0.5&tilt&zoom=1.5&turn=30&stats` opens the page at a given
// progress and view, so the drawing can be checked without a finger.

const p = Number(params.get("p"));
if (p > 0) {
  progress = Math.min(1, p);
  folded = progress >= 1;
  foldButton.textContent = folded ? "Unfold" : "Fold";
}
if (params.has("tilt")) setTilted(true, 0);
orbit = clamp(
  {
    ...orbit,
    distance: orbit.distance / (Number(params.get("zoom")) || 1),
    azimuth: ((Number(params.get("turn")) || 0) * Math.PI) / 180,
  },
  limits,
);
readout.hidden = !showStats;
fit();
