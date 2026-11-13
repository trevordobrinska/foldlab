// The Model player on the page: the thin layer between the pure player
// (model/player.ts), saved progress (model/progress.ts), the Step's words
// under the paper, and the Undo and Fold buttons. It decides which paper is
// drawn and how far along its Fold; main.ts draws it.
//
// The Fold button is temporary: it makes the Step's next Fold for him by
// playing its Recording. Ticket 05's finger will instead set `progress` while
// he drags, read `target()` to match his gesture against, and call
// `foldMade()` when it lands (or play `progress` back to 0 when it misses).

import type { Model, ModelFold } from "./model/model";
import { made, nextFold, opened, progressOf, shown, startedAgain, undone, type Place, type Progress } from "./model/player";
import { loadProgress, saveProgress } from "./model/progress";
import type { ModelPapers } from "./view/model-papers";
import type { SteppedPaper } from "./view/shape";

/** main.ts's animation: `step` gets an eased 0..1 over `ms`, the page is drawn after each, then `then` runs. */
export type Animate = (subject: string, ms: number, step: (k: number) => void, then?: () => void) => void;

export interface PlayerPage {
  /** The paper to draw now: the Recording of the Fold being made (or, once every Fold is made, of the last one). */
  paper: SteppedPaper;
  /** How far along that Recording the paper is, 0..1. A gesture may move it while he drags. */
  progress: number;
  /** Where he is in the Model. */
  place(): Place;
  /** The Fold he is to make now, or undefined when every Fold is made. */
  target(): ModelFold | undefined;
  /** He has made the target Fold: move on to the next Fold or Step, save, and redraw. */
  foldMade(): void;
}

export interface PlayerPageOptions {
  animate: Animate;
  /** Draws the page now. */
  redraw: () => void;
  /** Debug: open here instead of at the saved progress, and save nothing during this visit. */
  openAt?: Progress;
  /** How long the Fold button's Fold takes, in milliseconds. */
  foldMs?: number;
}

export function playerPage(model: Model, papers: ModelPapers, { animate, redraw, openAt, foldMs = 1100 }: PlayerPageOptions): PlayerPage {
  const title = document.querySelector<HTMLElement>("#step-title")!;
  const text = document.querySelector<HTMLElement>("#step-text")!;
  const undoButton = document.querySelector<HTMLButtonElement>("#undo")!;
  const foldButton = document.querySelector<HTMLButtonElement>("#fold")!;

  let place = opened(model, openAt ?? loadProgress(model.id));
  /** True while a button's Fold is playing: the buttons wait for it. */
  let busy = false;

  const page: PlayerPage = {
    paper: papers.of(shown(model, place).fold),
    progress: 0,
    place: () => place,
    target: () => nextFold(model, place),
    foldMade() {
      place = made(model, place);
      settle();
      redraw();
    },
  };

  /** Shows the Place as it is: its paper at rest, its words, its buttons; and saves it. */
  function settle() {
    const now = shown(model, place);
    page.paper = papers.of(now.fold);
    page.progress = now.progress;
    const next = nextFold(model, place);
    title.textContent = `${model.name}${place.finished ? " ✓" : ""} · Step ${place.step + 1} of ${model.steps.length}`;
    text.textContent = next ? model.steps[place.step].text : "Finished.";
    undoButton.disabled = place.step === 0 && place.fold === 0;
    foldButton.textContent = next ? "Fold" : "Fold it again";
    if (!openAt) saveProgress(model.id, progressOf(model, place));
  }

  foldButton.addEventListener("click", () => {
    if (busy) return;
    if (!nextFold(model, place)) {
      place = startedAgain(place);
      settle();
      redraw();
      return;
    }
    busy = true;
    const from = page.progress;
    animate("fold", foldMs * (1 - from), (k) => (page.progress = from + (1 - from) * k), () => {
      busy = false;
      page.foldMade();
    });
  });

  undoButton.addEventListener("click", () => {
    const back = undone(model, place);
    if (busy || back === place) return;
    busy = true;
    // The Fold taken back, played from made to not made; then the Place settles there.
    place = back;
    page.paper = papers.of(shown(model, place).fold);
    page.progress = 1;
    animate("fold", foldMs, (k) => (page.progress = 1 - k), () => {
      busy = false;
      settle();
      redraw();
    });
  });

  settle();
  return page;
}
