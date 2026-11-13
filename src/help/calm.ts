// Calm help (DESIGN.md, "Mistakes are calm"): no sound, no red, no score.
// The paper has already sprung back (src/gesture/drag.ts). After one miss
// the target line pulses, once; after a few, a "show me" button is offered,
// which plays the Fold once and puts the paper back for him to make it
// himself. Nothing here loops or repeats by itself.
//
// Pure: no DOM and no clock. The page (page.ts) pulses, shows the button
// and plays the Fold.

/** "A few" misses (DESIGN.md), counted on one Fold to make: the show-me button is offered at this many. */
export const SHOW_ME_AFTER = 3;

/** What the page does for calm help. */
export interface CalmHelpHost {
  /** Pulse the target line, once. */
  pulse(): void;
  /** Show or hide the show-me button. */
  offer(shown: boolean): void;
  /** Play the Fold once and put the paper back as it was, then call `done`. */
  play(done: () => void): void;
}

export class CalmHelp {
  private misses = 0;
  private playing = false;

  constructor(private readonly host: CalmHelpHost) {}

  /** True while show me is playing the Fold: the paper is not his to pick up until it is back. */
  get showing(): boolean {
    return this.playing;
  }

  /** He made a Fold that is not the Step's, and the paper has sprung back. */
  missed(): void {
    this.misses++;
    this.host.pulse();
    if (this.misses === SHOW_ME_AFTER) this.host.offer(true);
  }

  /** He pressed show me. */
  showMe(): void {
    if (this.playing || this.misses < SHOW_ME_AFTER) return;
    this.playing = true;
    this.host.play(() => (this.playing = false));
  }

  /** The Fold to make has changed (he made it, undid one, stepped back): the count starts again. */
  fresh(): void {
    this.misses = 0;
    this.host.offer(false);
  }
}
