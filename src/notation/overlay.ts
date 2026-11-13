// Notation drawn on the paper: an SVG laid over the canvas, in CSS pixels,
// so the lines are real dashes of a readable weight (the canvas's own lines
// are one-pixel hairlines). Each point of the Notation is a point of the
// world, put on screen through the same camera as the paper (pointer.ts),
// so it stays on the paper when he zooms, turns or tilts the view.
//
// The geometry is notation.ts (pure, tested); this is only the DOM. The
// styles, the dash patterns and the one-time pulse are in style.css.

import type { Pixel, Pointer } from "../view/pointer";
import { arrowOnScreen, TURN_OVER, turnOverPlace, type FoldNotation } from "./notation";

/** How much of the Notation to draw: "rest", lines and arrows; "folding" (the paper is part way through a Fold), lines only; "hidden", nothing (the paper is going back). */
export type NotationMode = "rest" | "folding" | "hidden";

const SVG = "http://www.w3.org/2000/svg";

interface Drawn {
  notation: FoldNotation;
  lines: SVGLineElement[];
  shaft: SVGPathElement;
  head: SVGPathElement;
}

export class NotationOverlay {
  private drawn: Drawn[] = [];
  private turnOver: SVGGElement | undefined;

  constructor(private readonly svg: SVGSVGElement) {}

  /** The Notation to draw from now on: one for each Fold still to make, and the turn-over symbol for a Step that turns the paper over. Draw afterwards. */
  set(notations: FoldNotation[], turnOver = false): void {
    this.svg.replaceChildren();
    this.drawn = notations.map((notation) => {
      const lines = notation.lines.map(() => this.add("line", `fold-line ${notation.kind}`));
      const shaft = this.add("path", "fold-arrow");
      const head = this.add("path", `fold-arrow-head ${notation.kind}`);
      return { notation, lines, shaft, head };
    });
    this.turnOver = undefined;
    if (turnOver) {
      // The turn-over symbol: an arrow that loops once on its way.
      const g = this.add("g", "turn-over");
      const loop = document.createElementNS(SVG, "path");
      loop.setAttribute("class", "fold-arrow");
      loop.setAttribute("d", TURN_OVER.shaft);
      const head = document.createElementNS(SVG, "path");
      head.setAttribute("class", "fold-arrow-head valley");
      head.setAttribute("d", TURN_OVER.head);
      g.append(loop, head);
      this.turnOver = g;
    }
  }

  /**
   * Puts the Notation where the paper is on screen now. The arrows show only
   * while the paper lies at "rest"; "hidden" shows nothing at all.
   */
  draw(pointer: Pointer, mode: NotationMode): void {
    this.svg.style.visibility = mode === "hidden" ? "hidden" : "";
    if (mode === "hidden") return;
    const atRest = mode === "rest";
    for (const { notation, lines, shaft, head } of this.drawn) {
      notation.lines.forEach(([a, b], i) => {
        const p = pointer.screen(a);
        const q = pointer.screen(b);
        lines[i].setAttribute("x1", p.x.toFixed(1));
        lines[i].setAttribute("y1", p.y.toFixed(1));
        lines[i].setAttribute("x2", q.x.toFixed(1));
        lines[i].setAttribute("y2", q.y.toFixed(1));
      });
      const arrow = atRest ? arrowOnScreen(pointer.screen(notation.arrow.from), pointer.screen(notation.arrow.to), notation.kind) : undefined;
      shaft.style.display = head.style.display = arrow ? "" : "none";
      if (!arrow) continue;
      const [start, bend] = arrow.curve;
      // The shaft stops inside the head, so a hollow head stays hollow.
      const last = arrow.head[arrow.head.length - 1];
      const second = arrow.head[1];
      const end = arrow.hollow ? last : { x: (second.x + last.x) / 2, y: (second.y + last.y) / 2 };
      shaft.setAttribute("d", `M${at(start)} Q${at(bend)} ${at(end)}`);
      head.setAttribute("d", `M${arrow.head.map(at).join(" L")} Z`);
    }
    if (this.turnOver) {
      const { width, height } = this.svg.getBoundingClientRect();
      const place = turnOverPlace(width, height);
      this.turnOver.setAttribute("transform", `translate(${at(place)})`);
    }
  }

  /** Pulses the target lines, once. */
  pulse(): void {
    for (const { lines } of this.drawn) {
      for (const line of lines) {
        line.classList.remove("pulse");
        // Reading the box restarts the animation when it is asked for again.
        void line.getBoundingClientRect();
        line.classList.add("pulse");
        line.addEventListener("animationend", () => line.classList.remove("pulse"), { once: true });
      }
    }
  }

  private add<K extends "line" | "path" | "g">(name: K, className: string): SVGElementTagNameMap[K] {
    const element = document.createElementNS(SVG, name);
    element.setAttribute("class", className);
    this.svg.append(element);
    return element;
  }
}

const at = (p: Pixel) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
