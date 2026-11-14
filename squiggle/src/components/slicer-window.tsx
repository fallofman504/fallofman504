"use client";

import { useEffect, useId, useMemo, useState } from "react";

const TOTAL = 212; // layers in the model
const BANDS = 106; // drawn bands (two layers each) so the lines stay crisp
const CX = 150, BASE = 222, HEIGHT = 190, MAX_HALF = 44;
const PROFILE = [
  ["Printer", "K1"],
  ["Material", "PLA"],
  ["Layer", "0.20 mm"],
  ["Infill", "15%"],
  ["Walls", "3"],
  ["Supports", "None"],
  ["Brim", "Auto"],
];

/** Half-width of the vase at a height t (0 = base, 1 = rim). */
const half = (t: number) => ((34 + 30 * Math.sin(t * Math.PI * 1.15 + 0.5) + 22 * t) / 82.4) * MAX_HALF;
const yAt = (layer: number) => BASE - (layer / TOTAL) * HEIGHT;

/**
 * Decorative hero graphic styled like a slicer's layer preview. The readout, the slider and the model always
 * agree: layers up to the current one are lit, everything above is a dim ghost of what's still to print.
 */
export function SlicerWindow() {
  const id = useId();
  const [layer, setLayer] = useState(148);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let hold = 0;
    const timer = setInterval(() => {
      setLayer((n) => {
        if (n < TOTAL) return n + 1;
        hold += 1;
        if (hold < 45) return n; // pause on the finished model
        hold = 0;
        return 1;
      });
    }, 55);
    return () => clearInterval(timer);
  }, []);

  // The vase is drawn once; only the clip line, cap and readout move.
  const bands = useMemo(() => {
    const pitch = HEIGHT / BANDS;
    return Array.from({ length: BANDS }, (_, i) => {
      const w = half((i + 0.5) / BANDS);
      return <rect key={i} x={CX - w} y={BASE - (i + 1) * pitch + pitch * 0.17} width={w * 2} height={pitch * 0.66} rx={0.4} />;
    });
  }, []);

  const y = yAt(layer), w = half(layer / TOTAL), done = layer >= TOTAL;
  const pct = Math.round((layer / TOTAL) * 100);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-card font-mono text-[11px] text-muted" data-solid aria-hidden>
      <div className="flex items-center gap-2 border-b border-line bg-paper px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="ml-2 truncate tracking-[0.06em]">SQUIGGLE SLICER — vase.stl</span>
      </div>
      <div className="flex gap-5 border-b border-line px-4 pt-2 tracking-[0.08em] uppercase">
        <span className="pb-2">Prepare</span>
        <span className="border-b-2 border-accent pb-2 text-accent">Preview</span>
        <span className="pb-2">Device</span>
      </div>

      <div className="grid grid-cols-[1fr_150px] sm:grid-cols-[1fr_176px]">
        <div className="relative bg-paper">
          <span className="absolute top-3 left-3 tracking-[0.08em]">
            LAYER <span className="text-accent">{String(layer).padStart(3, "0")}</span> / {TOTAL}
          </span>
          <svg viewBox="0 0 300 250" className="block h-full min-h-[270px] w-full">
            <defs>
              <linearGradient id={`${id}lit`} gradientUnits="userSpaceOnUse" x1={CX - MAX_HALF} x2={CX + MAX_HALF}>
                <stop offset="0" stopColor="#6c8a14" />
                <stop offset="0.32" stopColor="#e2ff7d" />
                <stop offset="0.58" stopColor="#c8ff2e" />
                <stop offset="1" stopColor="#566f10" />
              </linearGradient>
              <linearGradient id={`${id}dim`} gradientUnits="userSpaceOnUse" x1={CX - MAX_HALF} x2={CX + MAX_HALF}>
                <stop offset="0" stopColor="#1a1f18" />
                <stop offset="0.32" stopColor="#39432a" />
                <stop offset="1" stopColor="#171b14" />
              </linearGradient>
              <clipPath id={`${id}printed`}>
                <rect x="0" y={y} width="300" height={250 - y} />
              </clipPath>
              <filter id={`${id}glow`} x="-50%" y="-300%" width="200%" height="700%">
                <feGaussianBlur stdDeviation="2.4" />
              </filter>
            </defs>

            {/* build plate in perspective */}
            <path d="M62 198 H238 L284 246 H16 Z" fill="#12151a" stroke="#2b313a" strokeWidth="0.8" />
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <line key={`v${i}`} x1={62 + 22 * i} y1="198" x2={16 + 33.5 * i} y2="246" stroke="#232830" strokeWidth="0.7" />
            ))}
            {[0.2, 0.42, 0.68].map((t) => (
              <line key={`h${t}`} x1={62 - 46 * t} y1={198 + 48 * t} x2={238 + 46 * t} y2={198 + 48 * t} stroke="#232830" strokeWidth="0.7" />
            ))}
            <ellipse cx={CX} cy={BASE + 1} rx={half(0) + 7} ry="6" fill="#000" opacity="0.45" />

            {/* still to print: dim ghost */}
            <g fill={`url(#${id}dim)`}>{bands}</g>
            <ellipse cx={CX} cy={yAt(TOTAL)} rx={half(1)} ry={half(1) * 0.2} fill="none" stroke="#39432a" strokeWidth="0.8" />

            {/* printed so far: lit */}
            <ellipse cx={CX} cy={BASE} rx={half(0)} ry={half(0) * 0.2} fill={`url(#${id}lit)`} />
            <g fill={`url(#${id}lit)`} clipPath={`url(#${id}printed)`}>{bands}</g>

            {/* the layer being shown: glowing cut through the vase wall */}
            <ellipse cx={CX} cy={y} rx={w} ry={w * 0.2} fill="#c8ff2e" opacity="0.55" filter={`url(#${id}glow)`} />
            <ellipse cx={CX} cy={y} rx={w} ry={w * 0.2} fill="#161b0c" stroke="#efffb0" strokeWidth="1.3" />
            <ellipse cx={CX} cy={y} rx={w * 0.8} ry={w * 0.16} fill="#0d0f12" stroke="#c8ff2e" strokeWidth="0.7" opacity="0.9" />

            {/* layer slider, tied to the same height */}
            <line x1={CX + w + 6} y1={y} x2="279" y2={y} stroke="#c8ff2e" strokeWidth="0.6" opacity="0.35" />
            <line x1="286" y1={yAt(TOTAL)} x2="286" y2={BASE} stroke="#2b313a" strokeWidth="1.2" />
            <line x1="286" y1={y} x2="286" y2={BASE} stroke="#c8ff2e" strokeWidth="1.2" opacity="0.7" />
            <circle cx="286" cy={y} r="4.2" fill="#0d0f12" stroke="#c8ff2e" strokeWidth="1.4" />
          </svg>
        </div>

        <div className="border-l border-line px-3 py-3">
          <p className="mb-2 tracking-[0.1em] text-accent uppercase">Print profile</p>
          <dl className="space-y-1.5">
            {PROFILE.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-line/60 pb-1.5">
                <dt className="truncate">{k}</dt>
                <dd className="shrink-0 text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-line">
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 flex justify-between tracking-[0.06em]">
            <span>PROGRESS</span>
            <span className="text-ink">{String(pct).padStart(3, " ")}%</span>
          </p>
        </div>
      </div>

      <div className="flex justify-between gap-3 border-t border-line bg-paper px-3 py-2 tracking-[0.06em]">
        <span>TIME 2H 14M</span>
        <span>FILAMENT 48 G</span>
        <span className={done ? "text-accent" : ""}>{done ? "COMPLETE" : "PREVIEW"}</span>
      </div>
    </div>
  );
}
