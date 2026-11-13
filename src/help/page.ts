// Notation, Step text, calm help, undo and step back on the page: the thin
// layer between the pure parts (notation/notation.ts, calm.ts), the SVG over
// the canvas (notation/overlay.ts) and the buttons under the paper.
//
// It does not know which Step is current. Whoever does (ticket 07's Model
// player; until then fixture.ts) gives it a StepHost.

import type { Pointer } from "../view/pointer";
import type { SteppedPaper } from "../view/shape";
import { notationOf, type FoldNotation } from "../notation/notation";
import { NotationOverlay } from "../notation/overlay";
import { CalmHelp } from "./calm";

/** What this page needs from whoever owns the current Step. */
export interface StepHost {
  /** The current Step's text, in FoldLab's own words. */
  text(): string;
  /** The Folds still to make in the current Step, each as its Recording's paper lying as the paper lies now. Empty when every Fold is made. */
  folds(): SteppedPaper[];
  /** True when the current Step turns the paper over (drawn as the turn-over symbol). */
  turnOver?(): boolean;
  /** Whether there is a Fold to take back. */
  canUndo(): boolean;
  /** Takes back the last Fold he made, moving the paper calmly, then calls `done` with the paper at rest. */
  undo(done: () => void): void;
  /** Whether there is anywhere to step back to. */
  canStepBack(): boolean;
  /** Goes to the start of this Step, or of the Step before when he is already there; then calls `done` with the paper at rest. */
  stepBack(done: () => void): void;
}

/** The page's animation: `step` gets an eased 0..1 over `ms`, the page is drawn after each, then `then` runs. Never loops. */
export type Animate = (subject: string, ms: number, step: (k: number) => void, then?: () => void) => void;

export interface HelpPageOptions {
  steps: StepHost;
  /** The camera as it is now, on the canvas. */
  pointer(): Pointer;
  /** Puts Fold `fold` of `steps.folds()` at `progress`, to be drawn by the next draw. */
  place(fold: number, progress: number): void;
  animate: Animate;
  /** Draws the page now. */
  redraw(): void;
  /** True while his finger has the paper or the paper is settling (FoldGesture.busy). */
  busy(): boolean;
}

export interface HelpPage {
  /** The Folds he may pick up now: the Step's, or none while the paper is being moved for him. For FoldGestureHost.folds. */
  folds(): SteppedPaper[];
  /** He made a Fold that is not the Step's, and the paper has sprung back. For FoldGestureHost.missed. */
  missed(): void;
  /** The Fold to make has changed (he made one, or the Step changed): new Notation and text, and the misses start again. Redraws. */
  changed(): void;
  /** Puts the Notation where the paper is now. Call from the page's draw; the arrows show only when `atRest`. */
  draw(atRest: boolean): void;
}

/** How long show me takes to make the Fold, rest on it, and put the paper back, in milliseconds. */
const SHOW_ME = { fold: 1400, rest: 600, back: 700 };

export function helpPage({ steps, pointer, place, animate, redraw, busy }: HelpPageOptions): HelpPage {
  const overlay = new NotationOverlay(document.querySelector<SVGSVGElement>("#notation")!);
  const text = document.querySelector<HTMLElement>("#step-text")!;
  const undoButton = document.querySelector<HTMLButtonElement>("#undo")!;
  const stepBackButton = document.querySelector<HTMLButtonElement>("#step-back")!;
  const showMeButton = document.querySelector<HTMLButtonElement>("#show-me")!;

  /** True while undo or step back is moving the paper. */
  let goingBack = false;
  /** Each Fold's Notation is worked out once: it reads the whole Recording. */
  const notations = new WeakMap<SteppedPaper, FoldNotation | undefined>();

  const calm = new CalmHelp({
    pulse: () => overlay.pulse(),
    offer: (shown) => (showMeButton.hidden = !shown),
    // The Step's Fold (the first still to make), once: made, rested on, and put back for him.
    play: (done) =>
      animate("fold", SHOW_ME.fold, (k) => place(0, k), () =>
        animate("fold", SHOW_ME.rest, () => place(0, 1), () =>
          animate("fold", SHOW_ME.back, (k) => place(0, 1 - k), done),
        ),
      ),
  });

  const still = () => !busy() && !calm.showing && !goingBack;

  function changed() {
    calm.fresh();
    const found: FoldNotation[] = [];
    for (const paper of steps.folds()) {
      if (!notations.has(paper)) notations.set(paper, notationOf(paper));
      const notation = notations.get(paper);
      if (notation) found.push(notation);
    }
    overlay.set(found, steps.turnOver?.() ?? false);
    text.textContent = steps.text();
    undoButton.disabled = !steps.canUndo();
    stepBackButton.disabled = !steps.canStepBack();
    // Working out a Notation moved the paper's buffers: the redraw puts them back.
    redraw();
  }

  const back = (can: () => boolean, go: (done: () => void) => void) => () => {
    if (!still() || !can()) return;
    goingBack = true;
    overlay.set([]);
    go(() => {
      goingBack = false;
      changed();
    });
  };
  undoButton.addEventListener("click", back(() => steps.canUndo(), (done) => steps.undo(done)));
  stepBackButton.addEventListener("click", back(() => steps.canStepBack(), (done) => steps.stepBack(done)));
  showMeButton.addEventListener("click", () => {
    if (still() && steps.folds().length) calm.showMe();
  });

  return {
    folds: () => (calm.showing || goingBack ? [] : steps.folds()),
    missed: () => calm.missed(),
    changed,
    draw: (atRest) => overlay.draw(pointer(), atRest),
  };
}
