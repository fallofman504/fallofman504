"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Page content that traces must keep clear of. */
const SOLID =
  "header, footer, main :is(h1, h2, h3, p, a, button, label, input, textarea, select, img, video, li, dl, figure, .card, .card-soft, .badge, [data-solid])";
const NS = "http://www.w3.org/2000/svg";
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/**
 * Decorative circuit traces drawn on the background layer. They are generated to fit each page:
 * every trace runs only through open space and ends in a solder dot clear of any text, button, or box.
 */
function draw(svg: SVGSVGElement, seedText: string) {
  const W = document.documentElement.clientWidth;
  const H = document.documentElement.scrollHeight;
  const small = W < 640;
  const G = small ? 12 : 16; // grid spacing
  const PAD = small ? 9 : 22; // clearance around content
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.replaceChildren();

  const cols = Math.ceil(W / G) + 1, rows = Math.ceil(H / G) + 1;
  const busy = new Uint8Array(cols * rows);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= cols || y >= rows ? 1 : busy[y * cols + x]);
  const mark = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < cols && y < rows) busy[y * cols + x] = 1; };

  document.querySelectorAll(SOLID).forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const top = r.top + window.scrollY;
    for (let y = Math.floor((top - PAD) / G); y <= Math.ceil((top + r.height + PAD) / G); y++)
      for (let x = Math.floor((r.left - PAD) / G); x <= Math.ceil((r.right + PAD) / G); x++) mark(x, y);
  });

  // Seeded by the page address so a page always gets the same pattern.
  let seed = 7;
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pick = (n: number) => Math.floor(rnd() * n);
  const free = (x: number, y: number, d: number) =>
    !at(x + DIRS[d][0], y + DIRS[d][1]) && !(d % 2 && (at(x + DIRS[d][0], y) || at(x, y + DIRS[d][1])));
  const add = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    svg.appendChild(e);
  };

  function walk(x: number, y: number, heading: number, maxLen: number, fromEdge: boolean) {
    if (at(x, y)) return;
    const pts = [[x, y]];
    mark(x, y);
    let d = heading, straight = 0;
    for (let i = 0; i < maxLen; i++) {
      let nd = d;
      if (straight > 2 && rnd() < 0.22) {
        nd = (d + (rnd() < 0.5 ? 1 : 7)) % 8;
        const off = (nd - heading + 8) % 8;
        if (off > 1 && off < 7) nd = d;
      }
      if (!free(x, y, nd)) {
        if (nd !== d && free(x, y, d)) nd = d;
        else {
          const alt = [(d + 1) % 8, (d + 7) % 8].filter((c) => {
            const o = (c - heading + 8) % 8;
            return (o <= 1 || o >= 7) && free(x, y, c);
          });
          if (!alt.length) break;
          nd = alt[pick(alt.length)];
        }
      }
      if (nd % 2) { mark(x + DIRS[nd][0], y); mark(x, y + DIRS[nd][1]); }
      straight = nd === d ? straight + 1 : 0;
      d = nd;
      x += DIRS[d][0];
      y += DIRS[d][1];
      mark(x, y);
      pts.push([x, y]);
    }
    if (pts.length < 5) return;
    const opacity = 0.26 + rnd() * 0.32;
    const P = pts.map((p) => [p[0] * G, p[1] * G]);
    add("path", { d: "M" + P.map((p) => p.join(",")).join(" L"), fill: "none", stroke: "#c8ff2e", "stroke-width": 1.5, "stroke-linejoin": "round", opacity: opacity.toFixed(2) });
    const dot = (p: number[]) => add("circle", { cx: p[0], cy: p[1], r: small ? 3 : 3.6, fill: "#0d0f12", stroke: "#c8ff2e", "stroke-width": 1.5, opacity: Math.min(1, opacity + 0.25).toFixed(2) });
    dot(P[P.length - 1]);
    if (!fromEdge) dot(P[0]);
  }

  // Buses entering from both page edges, a few lines side by side.
  for (let y = 5; y < rows - 4; ) {
    const n = 2 + pick(4);
    for (const side of [0, 1]) {
      if (rnd() < 0.2) continue;
      for (let k = 0; k < n; k++) walk(side ? cols - 1 : 0, y + k, side ? 4 : 0, 10 + pick(40), true);
    }
    y += n + 2 + pick(5);
  }
  // Shorter runs seeded in the open gaps between sections.
  const tries = Math.min(4000, Math.round(cols * rows * 0.09));
  for (let i = 0; i < tries; i++) {
    const x = 2 + pick(cols - 4), y = 5 + pick(rows - 8);
    if (at(x, y) || at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) continue;
    walk(x, y, [0, 2, 4, 6][pick(4)], 6 + pick(26), false);
  }
}

export function CircuitBackdrop() {
  const ref = useRef<SVGSVGElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    let timer: ReturnType<typeof setTimeout>;
    const redraw = () => {
      clearTimeout(timer);
      // Shrink first so the old drawing doesn't hold the page taller than its content.
      timer = setTimeout(() => { svg.setAttribute("height", "0"); draw(svg, pathname); }, 120);
    };
    redraw();
    document.fonts?.ready.then(redraw);
    window.addEventListener("resize", redraw);
    // Redraw when the content changes size (a form section opening, a quote arriving).
    const main = document.querySelector("main");
    const observer = new ResizeObserver(redraw);
    if (main) observer.observe(main);
    return () => { clearTimeout(timer); window.removeEventListener("resize", redraw); observer.disconnect(); };
  }, [pathname]);

  return <svg ref={ref} aria-hidden className="pointer-events-none absolute top-0 left-0 z-0" width="0" height="0" />;
}
