import Link from "next/link";
import { getUser } from "@/lib/auth";

const steps = [
  { n: "01", title: "Show us or tell us", body: "Upload a 3D file, a photo, or a sketch — or just type what's in your head. No CAD skills needed." },
  { n: "02", title: "Get a quote in about an hour", body: "We message you a price breakdown. For custom designs you also get a render and a turntable video." },
  { n: "03", title: "Download it or let us make it", body: "Buy the STL and print it yourself, or have Squiggle print it for pickup, Houston delivery, or shipping." },
];

/** A printed object drawn as stacked layers. */
function Layers({ count = 34, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`mx-auto flex flex-col-reverse items-center gap-[3px] ${className}`} aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const t = i / (count - 1);
        const width = 34 + 30 * Math.sin(t * Math.PI * 1.15 + 0.5) + 22 * t;
        return <i key={i} className="block h-[7px] rounded-[1px] bg-accent opacity-90" style={{ width: `${width.toFixed(1)}%` }} />;
      })}
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
        <div className="card relative px-8 pt-12 pb-10" data-solid>
          <span className="absolute top-3.5 left-9 font-mono text-[10.5px] tracking-[0.08em] text-[#5d6672]">LAYER 034 / 212 · 0.20 MM · PLA</span>
          <Layers className="w-[58%] max-w-[230px]" />
        </div>
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
