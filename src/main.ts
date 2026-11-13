// FoldLab: the paper on his iPad. The Model player (player-page.ts) walks a
// Model's Steps and chooses the paper to draw; one finger on the paper folds
// it (drag a point to where it lands, src/gesture/), two fingers move the
// view and a button tilts it to show the layers. Notation is drawn on the
// paper and mistakes are calm (src/notation/, src/help/). The house button
// stays in index.html (suite rule 5).
//
// This page carries no physics and no engine: every Fold of a Model was
// replayed and recorded once on the computer (src/model/build.ts) and is
// only played back here.

import "./style.css";
import { FoldGesture } from "./gesture/drag";
import { helpPage, type HelpPage } from "./help/page";
import { openModel } from "./library/library";
import { playerPage, type PlayerPage } from "./player-page";
import { clamp, FLAT, fitting, pinched, pinchOf, TILTED, viewOf, type Orbit, type Touch } from "./view/camera";
import { modelPapers } from "./view/model-papers";
import { pointerOf } from "./view/pointer";
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
  help.draw(player.goingBack ? "hidden" : player.progress === 0 ? "rest" : "folding");
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

// --- The Model player: Steps, Undo, step back, saved progress ----------------
// Debug only: `?step=3` opens at that Step and saves nothing during the visit.

/** The camera as it is now, on the canvas. */
const pointer = () => {
  const rect = canvas.getBoundingClientRect();
  return pointerOf(viewOf(orbit), rect.width, rect.height);
};

const openStep = Number(params.get("step"));
const player: PlayerPage = playerPage(model, papers, {
  animate,
  redraw: draw,
  held: () => gesture.busy,
  rested: () => help.changed(),
  openAt: openStep >= 1 ? { step: openStep - 1, finished: false } : undefined,
});

// --- Notation on the paper, and calm help ------------------------------------
// All in src/notation/ and src/help/. The player says which Folds are still
// to make and plays one for "show me".

const help: HelpPage = helpPage({
  steps: {
    folds: () => player.offers().map((offer) => papers.of(offer.recording)),
    showMe: (done) => player.showMe(done),
  },
  pointer,
  busy: () => gesture.busy,
});

// --- One finger (or the Pencil) on the paper folds it ------------------------
// All the logic is in src/gesture/drag.ts. The player supplies the Step's
// Folds still to make, draws them and takes `folded`; calm help takes
// `missed`.

const gesture = new FoldGesture({
  folds: () => player.folds(),
  pointer,
  show: (fold, p) => player.show(fold, p),
  settle: (fold, from, to, done) => player.settle(fold, from, to, done),
  folded: (fold) => player.folded(fold),
  missed: () => help.missed(),
});
/** A pointer event's place on the canvas, in CSS pixels from its top left. */
const onCanvas = (e: PointerEvent): [number, number] => {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
};

// --- Two fingers anywhere: pinch to zoom, twist to turn, slide to look ---------
// One finger on the background does nothing; a second finger lets the paper go.

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
  if (fingers.size === 1) gesture.down(...onCanvas(e));
  else gesture.cancel();
});

canvas.addEventListener("pointermove", (e) => {
  if (!fingers.has(e.pointerId)) return;
  e.preventDefault();
  const before = pair();
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const after = pair();
  if (fingers.size === 1) gesture.move(...onCanvas(e));
  if (!before || !after) return;
  const rect = canvas.getBoundingClientRect();
  orbit = pinched(orbit, pinchOf(before, after), rect.width, rect.height, limits);
  draw();
});

const lift = (e: PointerEvent) => {
  if (!fingers.delete(e.pointerId)) return;
  if (e.type === "pointerup") gesture.up(...onCanvas(e));
  else gesture.cancel();
};
canvas.addEventListener("pointerup", lift);
canvas.addEventListener("pointercancel", lift);

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
help.changed();
fit();
