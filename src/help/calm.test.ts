// Calm help, as DESIGN.md has it: after one miss the target line pulses;
// after a few, a "show me" button plays the Fold once and he then makes it
// himself.

import { describe, expect, it } from "vitest";
import { CalmHelp, SHOW_ME_AFTER } from "./calm";

function help() {
  const log = { pulses: 0, offered: false, plays: 0 };
  let finish: (() => void) | undefined;
  const calm = new CalmHelp({
    pulse: () => log.pulses++,
    offer: (shown) => (log.offered = shown),
    play: (done) => {
      log.plays++;
      finish = done;
    },
  });
  /** The show-me playing comes to its end. */
  const played = () => {
    finish?.();
    finish = undefined;
  };
  return { calm, log, played };
}

describe("calm help", () => {
  it("does nothing until he misses", () => {
    const { log } = help();
    expect(log).toEqual({ pulses: 0, offered: false, plays: 0 });
  });

  it("pulses the target line once after the first miss, and once for each miss after", () => {
    const { calm, log } = help();
    calm.missed();
    expect(log.pulses).toBe(1);
    expect(log.offered).toBe(false);
    calm.missed();
    expect(log.pulses).toBe(2);
  });

  it("'a few' misses is three", () => {
    expect(SHOW_ME_AFTER).toBe(3);
  });

  it("offers show me after a few misses, not before", () => {
    const { calm, log } = help();
    for (let i = 1; i < SHOW_ME_AFTER; i++) calm.missed();
    expect(log.offered).toBe(false);
    calm.missed();
    expect(log.offered).toBe(true);
  });

  it("show me plays the Fold once, and is not played again while it plays", () => {
    const { calm, log, played } = help();
    for (let i = 0; i < SHOW_ME_AFTER; i++) calm.missed();
    calm.showMe();
    expect(log.plays).toBe(1);
    expect(calm.showing).toBe(true);
    calm.showMe();
    expect(log.plays).toBe(1);
    played();
    expect(calm.showing).toBe(false);
  });

  it("show me does nothing before it is offered", () => {
    const { calm, log } = help();
    calm.missed();
    calm.showMe();
    expect(log.plays).toBe(0);
    expect(calm.showing).toBe(false);
  });

  it("after show me the Fold is still his to make, and he may watch again", () => {
    const { calm, log, played } = help();
    for (let i = 0; i < SHOW_ME_AFTER; i++) calm.missed();
    calm.showMe();
    played();
    expect(log.offered).toBe(true);
    calm.showMe();
    expect(log.plays).toBe(2);
  });

  it("starts afresh when the Fold to make changes: he made it, or went back", () => {
    const { calm, log } = help();
    for (let i = 0; i < SHOW_ME_AFTER; i++) calm.missed();
    calm.fresh();
    expect(log.offered).toBe(false);
    calm.showMe();
    expect(log.plays).toBe(0);
    for (let i = 1; i < SHOW_ME_AFTER; i++) calm.missed();
    expect(log.offered).toBe(false);
    calm.missed();
    expect(log.offered).toBe(true);
  });
});
