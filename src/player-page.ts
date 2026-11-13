// The Model player on the page: the thin layer between the pure player
// (model/player.ts), saved progress (model/progress.ts), the Step's words
// under the paper, the Undo, Step back and Fold it again buttons, and his
// finger (it is the Model's half of the fold gesture's host,
// src/gesture/drag.ts: the Folds he can make now, drawing one part way, and
// moving on when one is made). It decides which paper is drawn and how far
// along its Fold; main.ts draws it.
//
// Nothing here makes a Fold for him except `showMe`, which calm help
// (src/help/) asks for after a few misses: it plays the Fold once and puts
// the paper back.

import type { Model } from "./model/model";
import { made, opened, progressOf, shown, startedAgain, steppedBack, toMake, undoing, type Offer, type Place, type Progress } from "./model/player";
import { loadProgress, saveProgress } from "./model/progress";
import type { ModelPapers } from "./view/model-papers";
import type { SteppedPaper } from "./view/shape";

/** main.ts's animation: `step` gets an eased 0..1 over `ms`, the page is drawn after each, then `then` runs. */
export type Animate = (subject: string, ms: number, step: (k: number) => void, then?: () => void) => void;

export interface PlayerPage {
  /** The paper to draw now. */
  readonly paper: SteppedPaper;
  /** How far along its Fold that paper is, 0..1. */
  progress: number;
  /** True while Undo or Step back is moving the paper back. */
  readonly goingBack: boolean;
  /** Where he is in the Model. */
  place(): Place;
  /** The Folds he can make now, with their places in the Step: what a gesture is matched against. */
  offers(): Offer[];
  /**
   * Show me: plays the first Fold on offer once (made, rested on, and put
   * back as it was), then calls `done`. He then makes it himself. Does
   * nothing but call `done` when the paper is already moving or all is made.
   */
  showMe(done: () => void): void;

  // The fold gesture's host (FoldGestureHost), all but the camera.
  /** The Folds he can make now, each as its paper lying as the paper lies. Empty while the paper is moving or all made. */
  folds(): SteppedPaper[];
  /** Draw Fold `fold` (of the last `folds()`) at `progress`. */
  show(fold: number, progress: number): void;
  /** Move that Fold calmly from `from` to `to`, then call `done`. */
  settle(fold: number, from: number, to: number, done: () => void): void;
  /** He made that Fold: move on to the next Fold or Step, save, and redraw. */
  folded(fold: number): void;
}

export interface PlayerPageOptions {
  animate: Animate;
  /** Draws the page now. */
  redraw: () => void;
  /** True while his finger has the paper: the buttons wait. */
  held?: () => boolean;
  /** The paper has come to rest at a new Place (not called for the Place the page opens at). Called before the redraw. */
  rested?: () => void;
  /** Debug: open here instead of at the saved progress, and save nothing during this visit. */
  openAt?: Progress;
  /** How long a button's Fold takes, in milliseconds. */
  foldMs?: number;
}

/** How long show me takes to make the Fold, rest on it, and put the paper back, in milliseconds. */
const SHOW_ME = { fold: 1400, rest: 600, back: 700 };

export function playerPage(model: Model, papers: ModelPapers, { animate, redraw, held = () => false, rested, openAt, foldMs = 1100 }: PlayerPageOptions): PlayerPage {
  const title = document.querySelector<HTMLElement>("#step-title")!;
  const text = document.querySelector<HTMLElement>("#step-text")!;
  const undoButton = document.querySelector<HTMLButtonElement>("#undo")!;
  const stepBackButton = document.querySelector<HTMLButtonElement>("#step-back")!;
  const againButton = document.querySelector<HTMLButtonElement>("#again")!;

  let place = opened(model, openAt ?? loadProgress(model.id));
  /** True while a button is moving the paper: the buttons and his finger wait for it. */
  let playing = false;
  let goingBack = false;
  /** The Folds last offered to the gesture, which names them by their place in this list. */
  let offered: Offer[] = [];
  let paper = papers.of(shown(model, place).recording);

  const same = (a: Place, b: Place) => a.step === b.step && a.made.join() === b.made.join();

  /** Shows the Place at rest: its paper, its words, its buttons; and saves it. */
  function rest() {
    const now = shown(model, place);
    paper = papers.of(now.recording);
    page.progress = now.progress;
    const more = toMake(model, place).length > 0;
    title.textContent = `${model.name}${place.finished ? " ✓" : ""} · Step ${place.step + 1} of ${model.steps.length}`;
    text.textContent = more ? model.steps[place.step].text : "Finished.";
    undoButton.disabled = !undoing(model, place);
    stepBackButton.disabled = same(steppedBack(model, place), place);
    againButton.hidden = more;
    if (!openAt) saveProgress(model.id, progressOf(model, place));
    rested?.();
    redraw();
  }

  /** Takes back the last Fold he made, played from made to not made over `ms`; then `then`. */
  function unfold(ms: number, then: () => void) {
    const undo = undoing(model, place);
    if (!undo) return then();
    place = undo.place;
    paper = papers.of(undo.recording);
    page.progress = 1;
    animate("fold", ms, (k) => (page.progress = 1 - k), then);
  }

  /** Runs `go` with the paper going back, then rests at the Place it reached. */
  function back(go: (then: () => void) => void) {
    if (playing || held()) return;
    playing = goingBack = true;
    go(() => {
      playing = goingBack = false;
      rest();
    });
  }

  const page: PlayerPage = {
    get paper() {
      return paper;
    },
    progress: 0,
    get goingBack() {
      return goingBack;
    },
    place: () => place,
    offers: () => toMake(model, place),
    showMe(done) {
      const [next] = toMake(model, place);
      if (playing || held() || !next || page.progress !== 0) return done();
      playing = true;
      paper = papers.of(next.recording);
      animate("fold", SHOW_ME.fold, (k) => (page.progress = k), () =>
        animate("fold", SHOW_ME.rest, () => (page.progress = 1), () =>
          animate("fold", SHOW_ME.back, (k) => (page.progress = 1 - k), () => {
            playing = false;
            page.progress = 0;
            done();
          }),
        ),
      );
    },
    folds() {
      offered = playing || page.progress !== 0 ? [] : toMake(model, place);
      return offered.map((offer) => papers.of(offer.recording));
    },
    show(fold, progress) {
      paper = papers.of(offered[fold].recording);
      page.progress = progress;
      redraw();
    },
    // A match folds the rest of the way; a miss springs back. Calm, and never looping.
    settle(fold, from, to, done) {
      paper = papers.of(offered[fold].recording);
      animate("fold", Math.max(160, (to ? 900 : 600) * Math.abs(to - from)), (k) => (page.progress = from + (to - from) * k), done);
    },
    folded(fold) {
      place = made(model, place, offered[fold].fold);
      rest();
    },
  };

  undoButton.addEventListener("click", () => {
    if (undoing(model, place)) back((then) => unfold(foldMs, then));
  });

  // Step back: the Folds come undone one after another, a little quicker
  // than Undo, until the paper is at the start of the Step.
  stepBackButton.addEventListener("click", () => {
    const target = steppedBack(model, place);
    if (same(target, place)) return;
    back((then) => {
      const next = () => (same(place, target) || !undoing(model, place) ? then() : unfold(foldMs * 0.6, next));
      next();
    });
  });

  againButton.addEventListener("click", () => {
    if (playing || held() || toMake(model, place).length) return;
    place = startedAgain(place);
    rest();
  });

  // The first rest draws nothing and tells nobody: main.ts draws once the canvas is fitted.
  const [draw, tell] = [redraw, rested];
  redraw = () => {};
  rested = undefined;
  rest();
  redraw = draw;
  rested = tell;
  return page;
}
