// FoldLab: the paper on his iPad. The Model player (player-page.ts) walks a
// Model's Steps and chooses the paper to draw; two fingers on the background
// move the view and a button tilts it to show the layers. Folding gestures
// come with ticket 05. The house button stays in index.html (suite rule 5).
//
// This page carries no physics and no engine: every Fold of a Model was
// replayed and recorded once on the computer (src/model/build.ts) and is
// only played back here.

import "./style.css";
import { openModel } from "./library/library";
import { playerPage } from "./player-page";
import { clamp, FLAT, fitting, pinched, pinchOf, TILTED, viewOf, type Orbit, type Touch } from "./view/camera";
import { modelPapers } from "./view/model-papers";
import { PaperView } from "./view/view";

const stage = document.querySelector<HTMLElement>("#stage")!;
const canvas = document.querySelector<HTMLCanvasElement>("#paper")!;
const tiltButton = document.querySelector<HTMLButtonElement>("#tilt")!;
const readout = document.querySelector<HTMLElement>("#stats")!;

// --- The paper and the view ------------------------------------------------

// The Library is one Model for now: the cup. The camera is fitted once to
// everywhere its paper goes.
const model = await openModel("cup");
const papers = modelPapers(model);
const { orbit: home, limits } = fitting(papers.extent);

const view = new PaperView(canvas);
view.colours(model.paper.front, model.paper.back);
let orbit: Orbit = home;
let tilted = false;

const params = new URLSearchParams(location.search);
const showStats = params.has("stats");

function draw() {
  view.show(player.paper.at(player.progress));
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

// --- The Model player: Steps, Undo, saved progress -------------------------
// Debug only: `?step=3` opens at that Step and saves nothing during the visit.

const openStep = Number(params.get("step"));
const player = playerPage(model, papers, {
  animate,
  redraw: draw,
  openAt: openStep >= 1 ? { step: openStep - 1, finished: false } : undefined,
});

// --- Start ------------------------------------------------------------------
// Debug only: `?p=0.5&tilt&zoom=1.5&turn=30&stats` opens the page at a given
// progress and view, so the drawing can be checked without a finger.

const p = Number(params.get("p"));
if (p > 0) player.progress = Math.min(1, p);
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
