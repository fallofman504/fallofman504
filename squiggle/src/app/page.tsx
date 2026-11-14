import Link from "next/link";
import { getUser } from "@/lib/auth";

const steps = [
  { n: "01", title: "Show us or tell us", body: "Upload a 3D file, a photo, or a sketch — or just type what's in your head. No CAD skills needed." },
  { n: "02", title: "Get a quote in about an hour", body: "We message you a price breakdown. For custom designs you also get a render and a turntable video." },
  { n: "03", title: "Download it or let us make it", body: "Buy the STL and print it yourself, or have Squiggle print it for pickup, Houston delivery, or shipping." },
];

/** A printed object drawn as stacked layers. */
function Layers({ count = 30 }: { count?: number }) {
  return (
    <div className="flex w-full flex-col-reverse items-center gap-[2px]">
      {Array.from({ length: count }, (_, i) => {
        const t = i / (count - 1);
        const width = 34 + 30 * Math.sin(t * Math.PI * 1.15 + 0.5) + 22 * t;
        return <i key={i} className="block h-[4px] rounded-[1px] bg-accent opacity-90" style={{ width: `${width.toFixed(1)}%` }} />;
      })}
    </div>
  );
}

const PROFILE = [
  ["Printer", "K1"],
  ["Material", "PLA"],
  ["Layer height", "0.20 mm"],
  ["Infill", "15%"],
  ["Walls", "3"],
  ["Supports", "Tree"],
  ["Brim", "Auto"],
];

/** Decorative: the hero graphic, styled like a slicer program with a model on the build plate. */
function SlicerWindow() {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-card font-mono text-[11px] text-muted" data-solid aria-hidden>
      {/* title bar */}
      <div className="flex items-center gap-2 border-b border-line bg-paper px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="ml-2 truncate tracking-[0.06em]">SQUIGGLE SLICER — vase.stl</span>
      </div>
      {/* tabs */}
      <div className="flex gap-5 border-b border-line px-4 pt-2 tracking-[0.08em] uppercase">
        <span className="pb-2">Prepare</span>
        <span className="border-b-2 border-accent pb-2 text-accent">Preview</span>
        <span className="pb-2">Device</span>
      </div>
      <div className="grid grid-cols-[1fr_150px] sm:grid-cols-[1fr_176px]">
        {/* viewport */}
        <div className="relative flex min-h-[270px] items-end justify-center overflow-hidden bg-paper px-6 pt-6 pb-9">
          {/* build plate, drawn in perspective */}
          <svg className="absolute inset-x-0 bottom-0 h-[46%] w-full" viewBox="0 0 200 80" preserveAspectRatio="none">
            <path d="M30 14 H170 L196 76 H4 Z" fill="#12151a" stroke="#2b313a" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
            {[1, 2, 3, 4, 5, 6].map((i) => {
              const t = i / 7;
              return <line key={`v${i}`} x1={30 + 140 * t} y1="14" x2={4 + 192 * t} y2="76" stroke="#232830" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />;
            })}
            {[0.22, 0.42, 0.62, 0.82].map((t) => (
              <line key={`h${t}`} x1={30 - 26 * t} y1={14 + 62 * t} x2={170 + 26 * t} y2={14 + 62 * t} stroke="#232830" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          <div className="relative w-[42%] max-w-[120px]">
            <Layers />
          </div>
          {/* layer slider */}
          <div className="absolute top-5 right-3 bottom-9 flex w-3 flex-col items-center">
            <div className="h-full w-px bg-line" />
            <div className="absolute top-[26%] h-2.5 w-2.5 rounded-full border border-accent bg-paper" />
          </div>
          <span className="absolute top-3 left-3 tracking-[0.08em]">LAYER 034 / 212</span>
        </div>
        {/* print profile */}
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
          <div className="mt-3 rounded-sm bg-accent py-1.5 text-center font-bold tracking-[0.1em] text-black">SLICED</div>
        </div>
      </div>
      {/* status bar */}
      <div className="flex justify-between gap-3 border-t border-line bg-paper px-3 py-2 tracking-[0.06em]">
        <span>TIME 2H 14M</span>
        <span>FILAMENT 48 G</span>
        <span className="text-accent">READY</span>
      </div>
    </div>
  );
}

export default async function Home() {
  const user = await getUser();
  const start = user ? "/requests/new" : "/signup";
  const print = user ? "/print" : "/signup?next=%2Fprint";
  const services = [
    { tag: "Print service", title: "Already have a model?", body: "Upload your STL, 3MF, OBJ, or STEP file and pick material, color, resolution, and infill. Pickup, Houston delivery, or shipping.", href: print, cta: "Print my model" },
    { tag: "Custom design", title: "We design it for you", body: "Send the idea and we build the 3D model. Price breakdown, render, and turntable video in about an hour.", href: start, cta: "Start a design" },
    { tag: "Just the file", title: "Download the STL", body: "Have your own printer? Once we've designed it, pay once and download the print-ready file.", href: start, cta: "Get a file made" },
  ];
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-14 pb-20 md:grid-cols-[1.15fr_1fr] md:pt-20">
        <div>
          <p className="eyebrow">3D printing &amp; custom fabrication · Houston, TX</p>
          <h1 className="mt-4 text-5xl font-bold sm:text-7xl">
            If you can imagine it, <span className="text-accent">we can make it.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            Upload a model and we print it. Or send a photo, a sketch, or a sentence and we design it, with a quote in about an hour.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={print} className="btn btn-primary px-6 py-3.5">Print my 3D model</Link>
            <Link href={start} className="btn btn-ghost px-6 py-3.5">Start a custom design</Link>
          </div>
        </div>
        <SlicerWindow />
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 md:grid-cols-3">
        {services.map((s) => (
          <div key={s.tag} className="card flex flex-col">
            <p className="font-mono text-xs font-semibold tracking-[0.14em] text-accent uppercase">[ {s.tag} ]</p>
            <h3 className="mt-3 text-xl font-bold">{s.title}</h3>
            <p className="mt-2 flex-1 text-[15px] text-muted">{s.body}</p>
            <Link href={s.href} className="btn btn-sm mt-5 self-start">{s.cta}</Link>
          </div>
        ))}
      </section>

      <section id="how" className="mx-auto max-w-6xl px-5 pt-24">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-3 text-4xl font-bold">Three steps, about an hour</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="card">
              <span className="font-mono text-3xl font-semibold text-accent">{s.n}</span>
              <h3 className="mt-4 text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-[15px] text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-24">
        <div className="card flex flex-wrap items-center justify-between gap-5 border-accent/40 bg-tint">
          <div>
            <h2 className="text-3xl font-bold sm:text-4xl">Got an idea rattling around?</h2>
            <p className="mt-2 text-muted">Prints take a 50% deposit to start. Pay the rest at pickup or before we send it out.</p>
          </div>
          <Link href={start} className="btn btn-primary px-6 py-3.5">Get a quote in an hour</Link>
        </div>
      </section>

      <section className="mx-auto mt-16 flex max-w-6xl justify-center px-5">
        <p className="rounded-full border border-line bg-card px-6 py-3 text-center font-display text-xl font-bold" data-solid>
          Full-color Prints, coming soon!
        </p>
      </section>
    </>
  );
}
