// Notation and calm help on the page: the thin layer between the pure parts
// (notation/notation.ts, calm.ts), the SVG over the canvas
// (notation/overlay.ts) and the "show me" button.
//
// It does not know which Step is current: the Model player
// (src/player-page.ts) does, and main.ts gives this what it needs of it as a
// StepHost. The Step's text, Undo and Step back are the player's.

import type { Pointer } from "../view/pointer";
import type { SteppedPaper } from "../view/shape";
import { notationOf, withoutRepeats, type FoldNotation } from "../notation/notation";
import { NotationOverlay } from "../notation/overlay";
import { CalmHelp } from "./calm";

/** What this page needs from whoever owns the current Step. */
export interface StepHost {
  /** The Folds still to make in the current Step, each as its Recording's paper lying as the paper lies at rest. Empty when every Fold is made. */
  folds(): SteppedPaper[];
  /** True when the current Step turns the paper over (drawn as the turn-over symbol). No Model has such a Step yet. */
  turnOver?(): boolean;
  /** Plays the first of `folds()` once and puts the paper back as it was, then calls `done`. Nobody can pick the paper up meanwhile. */
  showMe(done: () => void): void;
}

export interface HelpPageOptions {
  steps: StepHost;
  /** The camera as it is now, on the canvas. */
  pointer(): Pointer;
  /** True while his finger has the paper or the paper is settling (FoldGesture.busy). */
  busy(): boolean;
}

export interface HelpPage {
  /** He made a Fold that is not the Step's, and the paper has sprung back. For FoldGestureHost.missed. */
  missed(): void;
  /**
   * The Folds to make have changed (he made one, or went back): new Notation,
   * and the misses start again. Working the Notation out moves the papers'
   * buffers, so draw the page afterwards.
   */
  changed(): void;
  /**
   * Puts the Notation where the paper is on screen now; call from the page's
   * draw. "rest": lines and arrows; "folding" (the paper is part way through
   * the Fold): lines only; "hidden": nothing (the paper is going back).
   */
  draw(mode: "rest" | "folding" | "hidden"): void;
}

export function helpPage({ steps, pointer, busy }: HelpPageOptions): HelpPage {
  const overlay = new NotationOverlay(document.querySelector<SVGSVGElement>("#notation")!);
  const showMeButton = document.querySelector<HTMLButtonElement>("#show-me")!;

  /** Each Fold's Notation is worked out once: it reads the whole Recording. */
  const notations = new WeakMap<SteppedPaper, FoldNotation | undefined>();

  const calm = new CalmHelp({
    pulse: () => overlay.pulse(),
    offer: (shown) => (showMeButton.hidden = !shown),
    play: (done) => steps.showMe(done),
  });

  showMeButton.addEventListener("click", () => {
    if (!busy() && steps.folds().length) calm.showMe();
  });

  return {
    missed: () => calm.missed(),
    changed() {
      calm.fresh();
      const found: FoldNotation[] = [];
      for (const paper of steps.folds()) {
        if (!notations.has(paper)) notations.set(paper, notationOf(paper));
        const notation = notations.get(paper);
        if (notation) found.push(notation);
      }
      overlay.set(withoutRepeats(found), steps.turnOver?.() ?? false);
    },
    draw: (mode) => overlay.draw(pointer(), mode),
  };
}
