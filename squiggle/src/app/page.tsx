import Link from "next/link";
import { getUser } from "@/lib/auth";

const steps = [
  { n: "1", title: "Show us or tell us", body: "Upload a photo, sketch, or 3D file — or just type what's in your head. No CAD skills needed.", color: "bg-sun" },
  { n: "2", title: "Get a quote in about an hour", body: "We build the 3D model and message you a price breakdown, a finished-product render, and a turntable video.", color: "bg-mint" },
  { n: "3", title: "Download it or let us make it", body: "Buy the STL and print it yourself, or have Squiggle print it for pickup, Houston delivery, or shipping.", color: "bg-coral/40" },
];

export default async function Home() {
  const user = await getUser();
  const start = user ? "/requests/new" : "/signup";
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-14 pb-16 md:grid-cols-[1.15fr_1fr] md:pt-24">
        <div>
          <p className="eyebrow">3D print & custom fabrication · Houston, TX</p>
          <h1 className="mt-4 text-5xl font-extrabold sm:text-7xl">
            If you can imagine it,{" "}
            <span className="relative inline-block">
              we can make it.
              <svg className="absolute -bottom-3 left-0 w-full" viewBox="0 0 300 14" fill="none" preserveAspectRatio="none" aria-hidden>
                <path d="M3 9c20-9 30 7 50 0s30-8 50 0 30 7 50 0 30-8 50 0 30 7 50 0 30-6 44-2" stroke="var(--color-coral)" strokeWidth="5" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-8 max-w-xl text-lg text-muted">
            Send a photo, a sketch, a model, or a single sentence. Squiggle turns it into a real 3D design — with a price, a render, and a
            turntable video — in about an hour.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={start} className="btn btn-coral px-7 py-3.5 text-base">
              Start a project
            </Link>
            <a href="#how" className="btn btn-ghost px-7 py-3.5 text-base">
              How it works
            </a>
          </div>
        </div>

        <div className="card relative rotate-1 shadow-[8px_8px_0_0_var(--color-ink)]">
          <p className="text-sm font-semibold text-muted">You</p>
          <p className="mt-1 rounded-2xl rounded-tl-sm bg-sun/50 px-4 py-3 text-[15px]">
            A desk planter shaped like a sleepy armadillo, about 5 inches long. Here&apos;s a doodle 🖍️
          </p>
          <p className="mt-5 text-sm font-semibold text-muted">Squiggle · 42 min later</p>
          <div className="mt-1 rounded-2xl rounded-tl-sm border border-line bg-white p-4">
            <div className="flex aspect-[16/9] items-center justify-center rounded-xl bg-gradient-to-br from-mint to-sun/60">
              <svg width="150" height="70" viewBox="0 0 150 70" fill="none" aria-hidden>
                <path d="M8 44c14-44 28-44 38 0s24 44 34 0 24-44 34 0 18 20 28-10" stroke="var(--color-ink)" strokeWidth="7" strokeLinecap="round" />
              </svg>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Design & modeling</dt><dd>$35.00</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Material & print time</dt><dd>$22.00</dd></div>
              <div className="flex justify-between border-t border-line pt-1 font-bold"><dt>Printed & finished</dt><dd>$57.00</dd></div>
              <div className="flex justify-between text-muted"><dt>Or just the STL</dt><dd>$18.00</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section id="how" className="border-y-2 border-ink bg-card">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-4xl font-extrabold">How it works</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="card">
                <span className={`flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink font-display text-xl font-extrabold ${s.color}`}>{s.n}</span>
                <h3 className="mt-4 text-2xl font-bold">{s.title}</h3>
                <p className="mt-2 text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-16 md:grid-cols-2">
        <div className="card bg-blue text-white">
          <p className="text-xs font-bold tracking-[0.14em] uppercase opacity-80">Option A</p>
          <h3 className="mt-2 text-3xl font-extrabold">Just the file</h3>
          <p className="mt-3 opacity-90">Have your own printer? Pay once and download the print-ready STL the moment your payment clears.</p>
        </div>
        <div className="card bg-sun">
          <p className="text-xs font-bold tracking-[0.14em] uppercase opacity-70">Option B</p>
          <h3 className="mt-2 text-3xl font-extrabold">We print it for you</h3>
          <p className="mt-3">
            50% deposit to start. Pay the rest when it&apos;s ready — at pickup in Houston, before local delivery, or before we ship it to your
            door.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5">
        <div className="card flex flex-wrap items-center justify-between gap-5 bg-ink text-paper">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Got an idea rattling around?</h2>
          <Link href={start} className="btn btn-coral border-paper px-7 py-3.5 text-base">
            Get a quote in an hour
          </Link>
        </div>
      </section>
    </>
  );
}
