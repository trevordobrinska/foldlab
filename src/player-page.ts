// The Model player on the page: the thin layer between the pure player
// (model/player.ts), saved progress (model/progress.ts), the Step's words
// under the paper, the Undo and Fold buttons, and his finger (it is the
// Model's half of the fold gesture's host, src/gesture/drag.ts: the Folds he
// can make now, drawing one part way, and moving on when one is made). It
// decides which paper is drawn and how far along its Fold; main.ts draws it.
//
// The Fold button is temporary: it makes the Step's next Fold for him by
// playing its Recording, so a Model can be walked without a finger. Ticket
// 06's "show me" is its calm replacement.

import type { Model } from "./model/model";
import { made, opened, progressOf, shown, startedAgain, toMake, undoing, type Offer, type Place, type Progress } from "./model/player";
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
  /** Where he is in the Model. */
  place(): Place;
  /** The Folds he can make now, with their places in the Step: what a gesture is matched against. */
  offers(): Offer[];

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
  /** Debug: open here instead of at the saved progress, and save nothing during this visit. */
  openAt?: Progress;
  /** How long a button's Fold takes, in milliseconds. */
  foldMs?: number;
}

export function playerPage(model: Model, papers: ModelPapers, { animate, redraw, held = () => false, openAt, foldMs = 1100 }: PlayerPageOptions): PlayerPage {
  const title = document.querySelector<HTMLElement>("#step-title")!;
  const text = document.querySelector<HTMLElement>("#step-text")!;
  const undoButton = document.querySelector<HTMLButtonElement>("#undo")!;
  const foldButton = document.querySelector<HTMLButtonElement>("#fold")!;

  let place = opened(model, openAt ?? loadProgress(model.id));
  /** True while a button's Fold is playing: the buttons and his finger wait for it. */
  let playing = false;
  /** The Folds last offered to the gesture, which names them by their place in this list. */
  let offered: Offer[] = [];
  let paper = papers.of(shown(model, place).recording);

  /** Shows the Place at rest: its paper, its words, its buttons; and saves it. */
  function rest() {
    const now = shown(model, place);
    paper = papers.of(now.recording);
    page.progress = now.progress;
    const more = toMake(model, place).length > 0;
    title.textContent = `${model.name}${place.finished ? " ✓" : ""} · Step ${place.step + 1} of ${model.steps.length}`;
    text.textContent = more ? model.steps[place.step].text : "Finished.";
    undoButton.disabled = !undoing(model, place);
    foldButton.textContent = more ? "Fold" : "Fold it again";
    if (!openAt) saveProgress(model.id, progressOf(model, place));
    redraw();
  }

  const page: PlayerPage = {
    get paper() {
      return paper;
    },
    progress: 0,
    place: () => place,
    offers: () => toMake(model, place),
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

  foldButton.addEventListener("click", () => {
    if (playing || held()) return;
    const [next] = toMake(model, place);
    if (!next) {
      place = startedAgain(place);
      return rest();
    }
    playing = true;
    paper = papers.of(next.recording);
    const from = page.progress;
    animate("fold", foldMs * (1 - from), (k) => (page.progress = from + (1 - from) * k), () => {
      playing = false;
      place = made(model, place, next.fold);
      rest();
    });
  });

  undoButton.addEventListener("click", () => {
    const undo = undoing(model, place);
    if (playing || held() || !undo) return;
    playing = true;
    // The Fold taken back, played from made to not made; then the Place rests there.
    place = undo.place;
    paper = papers.of(undo.recording);
    page.progress = 1;
    animate("fold", foldMs, (k) => (page.progress = 1 - k), () => {
      playing = false;
      rest();
    });
  });

  // The first rest draws nothing: main.ts draws once the canvas is fitted.
  const draw = redraw;
  redraw = () => {};
  rest();
  redraw = draw;
  return page;
}
