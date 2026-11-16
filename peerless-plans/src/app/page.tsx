import Link from "next/link";
import { SamplePlan } from "@/components/plan";
import { SnapshotForm } from "@/components/snapshot-form";
import { BANDS, OVER_PER_SF } from "@/lib/pricing";

const SERVICES = [
  ["Spec test fit", "One marketing layout for a vacant suite, as PDF and DWG", ["From $350"], "48 hours"],
  ["Prospect test fit", "Layout to a named prospect's program, two options, one revision round", ["From $490"], "24 to 48 hours"],
  ["Lease exhibit", "Premises outlined on the floor plan or site plan, lease-ready PDF", ["$175 each", "$450 a set"], "24 hours"],
  ["Building onboarding", "Raw DWGs cleaned and standardized, suite outlines, area table by suite and floor", ["$0.02 / SF", "$750 min."], "3 to 5 business days"],
  ["Area audit", "Suite by suite: lease SF against CAD SF against rent roll, with variance in SF and annual dollars", ["$0.03 / SF", "$1,500 min."], "5 business days"],
  ["Interactive 3D leasing map", "Web-based 3D model built from the CAD, showing suites and availability", ["$4,500 setup", "+ $250 / mo"], "2 to 3 weeks"],
] as const;

const GATES = [
  ["Intake", "We confirm the files open, the units are known, and the scale checks against a stated dimension."],
  ["Normalize", "Layers cleaned, units set, every suite outline closed, saved to the building's base file."],
  ["Produce", "The producing agent calculates the areas, draws the test fit, or drafts the exhibit."],
  ["Independent QA", "A separate agent that did not produce the work runs the full checklist."],
  ["Human sign-off", "A named person reviews the sheet and the QA report, then initials the title block."],
  ["Deliver and archive", "You receive the PDF, the DWG, and a one-page QA sheet."],
];

const TIERS = [
  ["Desk", "$1,250", ["1 building or up to 250,000 SF", "6 deliverables a month", "48-hour turnaround", "Rent roll reconciliation once a year", "3-month minimum"]],
  ["Portfolio", "$3,500", ["Up to 5 buildings or 1M SF", "20 deliverables a month", "24-hour turnaround", "Quarterly reconciliation", "3D leasing map hosting for one property", "6-month minimum"]],
  ["Enterprise", "From $7,500", ["Custom coverage", "Unlimited deliverables within fair use", "24-hour turnaround, same-day rush included", "Reconciliation quarterly and at each acquisition", "12-month minimum"]],
] as const;

const usd = (n: number) => "$" + n.toLocaleString("en-US");

export default function Home() {
  return (
    <main id="top">
      <section className="hero">
        <div className="wrap">
          <div>
            <p className="eyebrow">Houston, Texas · Commercial real estate drafting</p>
            <h1><span>AI-drafted.</span><span>Human-verified.</span><span className="accent">On your desk tomorrow.</span></h1>
            <p className="lede">
              Send us a floor plan, a sketch or a set of dimensions. We send back a lease-ready test fit or exhibit in 24 to 48 hours, at a flat
              price you can see before you order.
            </p>
            <div className="cta">
              <Link className="btn" href="/order">Order a drawing</Link>
              <Link className="btn ghost" href="/#prices">See prices</Link>
            </div>
            <ul className="facts">
              <li><b>24–48 hrs</b>standard turnaround</li>
              <li><b>From $175</b>flat, published prices</li>
              <li><b>Every sheet</b>checked by a person</li>
            </ul>
          </div>
          <div className="sheet">
            <SamplePlan />
            <div className="titleblock">
              <div><small>DRAWING</small>SPEC TEST FIT · SAMPLE SUITE</div>
              <div><small>DRAFTED BY</small>PEERLESS PLANS AI AGENTS</div>
              <div><small>CHECKED BY</small>SIGNED BEFORE DELIVERY</div>
            </div>
          </div>
        </div>
      </section>

      <section id="start">
        <div className="wrap">
          <div className="doors">
            <div className="door">
              <p className="eyebrow">One drawing, right now</p>
              <h2>Order a drawing</h2>
              <p>Tell us the project, upload what you have, and see a watermarked preview with your price before you pay.</p>
              <ul>
                <li>Spec test fits for vacant suites</li>
                <li>Prospect test fits to a tenant&apos;s program</li>
                <li>Lease exhibits and exhibit sets</li>
              </ul>
              <Link className="btn" href="/order">Start an order</Link>
            </div>
            <div className="door alt">
              <p className="eyebrow">A building or a portfolio</p>
              <h2>For owners and brokers</h2>
              <p>We keep your building&apos;s drawings of record, so every lease event becomes a one-email request.</p>
              <ul>
                <li>Free Variance Snapshot: lease SF against CAD SF</li>
                <li>Area audits tied to your rent roll</li>
                <li>Monthly retainers and 3D leasing maps</li>
              </ul>
              <Link className="btn" href="/#owners">See owner services</Link>
            </div>
          </div>
        </div>
      </section>

      <section id="how">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2>From napkin sketch to signed sheet in four steps</h2>
          <div className="grid4">
            <div className="step"><span className="n">01</span><h3>Describe</h3><p>Pick the drawing you need and give us the building, the suite and the program.</p></div>
            <div className="step"><span className="n">02</span><h3>Upload</h3><p>CAD files, PDFs, photos, hand sketches with dimensions, or typed measurements. Any of them works.</p></div>
            <div className="step"><span className="n">03</span><h3>Preview and price</h3><p>We confirm the scope back to you, then email you a watermarked section of the draft with your flat price.</p></div>
            <div className="step"><span className="n">04</span><h3>Buy and download</h3><p>Once you pay, a person checks and signs the sheet. Your files arrive inside the stated turnaround.</p></div>
          </div>
        </div>
      </section>

      <section id="prices">
        <div className="wrap">
          <p className="eyebrow">Public price list</p>
          <h2>Flat prices. No sales call.</h2>
          <p className="lede">Every price is posted. The 24 to 48 hour turnaround is the offer.</p>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Service</th><th>What you get</th><th>Price</th><th>Turnaround</th></tr></thead>
              <tbody>
                {SERVICES.map(([name, what, price, time]) => (
                  <tr key={name}>
                    <td><b>{name}</b></td>
                    <td>{what}</td>
                    <td className="price">{price.map((p) => <div key={p}>{p}</div>)}</td>
                    <td>{time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">An exhibit set covers premises, site plan, and signage or parking. Onboarding is waived on retainer.</p>

          <h3 style={{ marginTop: 40 }}>Test fit prices by suite size</h3>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Suite size</th><th>Spec test fit</th><th>Prospect test fit</th></tr></thead>
              <tbody>
                {BANDS.map((b) => (
                  <tr key={b.max}><td>{b.label}</td><td className="price">{usd(b.spec)}</td><td className="price">{usd(b.prospect)}</td></tr>
                ))}
                <tr><td>Over 30,000 SF</td><td className="price">${OVER_PER_SF.spec.toFixed(2)} / SF</td><td className="price">${OVER_PER_SF.prospect.toFixed(2)} / SF</td></tr>
              </tbody>
            </table>
          </div>
          <p className="note">Same-day rush adds 50%.</p>
          <div className="cta"><Link className="btn" href="/order">Order a drawing</Link></div>
        </div>
      </section>

      <section id="qa">
        <div className="wrap">
          <p className="eyebrow">How the AI and QA work</p>
          <h2>Fast because AI agents draft it. Trusted because a person signs it.</h2>
          <p className="lede">
            We say it plainly: trained AI agents do the drafting. That is why the price is flat and the turnaround is a day. Every job then passes
            the same six gates.
          </p>
          <ol className="gates">{GATES.map(([t, d]) => <li key={t}><b>{t}</b>{d}</li>)}</ol>
          <div className="grid3">
            <div className="card"><h3>The QA sheet</h3><p>Every deliverable ships with one page listing the source files used, the measurement method, the checks run, and what was not verified.</p></div>
            <div className="card"><h3>Your files stay yours</h3><p>Client drawings, rent rolls, and leases stay confidential, are not used to train models, and are deleted on request.</p></div>
            <div className="card"><h3>What we are not</h3><p>Test fits are conceptual space plans, not for construction or permit. Areas are calculated from the drawings you provide unless a field check is ordered.</p></div>
          </div>
        </div>
      </section>

      <section className="guarantee">
        <div className="wrap">
          <p className="eyebrow">The guarantee</p>
          <h2>On time, or it&apos;s free.</h2>
          <p>Standard orders arrive on time or they are free, and drafting errors are corrected at no charge.</p>
        </div>
      </section>

      <section id="owners">
        <div className="wrap">
          <p className="eyebrow">For owners and brokers</p>
          <h2>Start with a Free Variance Snapshot</h2>
          <p className="lede">
            Send one building&apos;s plans and its rent roll. In 48 hours you get floor-level totals of lease SF against CAD SF, at no cost. If the
            numbers disagree, the paid area audit shows where, suite by suite, in square feet and annual dollars.
          </p>
          <h3 style={{ marginTop: 40 }}>Retainers</h3>
          <div className="grid3">
            {TIERS.map(([name, price, items]) => (
              <div className="card" key={name}>
                <p className="eyebrow">{name}</p>
                <p className="big">{price}<small style={{ fontSize: 15, fontWeight: 400 }}> / month</small></p>
                <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
          <p className="note">
            Base file upkeep is included in every tier. One deliverable is a test fit up to 7,500 SF or one exhibit set; a larger test fit counts
            as two. Unused deliverables roll over for one month.
          </p>
          <div className="panel" style={{ marginTop: 34 }}>
            <h3>Request a Free Variance Snapshot</h3>
            <SnapshotForm />
          </div>
        </div>
      </section>
    </main>
  );
}
