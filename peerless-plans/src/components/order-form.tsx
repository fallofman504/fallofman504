"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  detailsProblem, money, quote, readDetails, referenceProblem, scopeRows, SERVICE_NAME, TENANT_TYPES,
  type OrderDetails, type Service,
} from "@/lib/pricing";

const STEPS = ["Drawing", "Details", "Upload", "Scope check"];
const MAX_FILES = 8;
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL = 90 * 1024 * 1024;
const BLURB: Record<Service, [string, string]> = {
  spec: ["From $350 · 48 hours", "One marketing layout for a vacant suite."],
  prospect: ["From $490 · 24 to 48 hours", "Two options laid out to a named prospect's program, with one revision round."],
  exhibit: ["$175 each · 24 hours", "Premises outlined on the floor plan or site plan, ready to bind into a lease."],
};

type Fields = { building: string; suite: string; sf: string; tenant: string; program: string; exhibitType: string; exhibitTitle: string; rush: string; notes: string; dims: string };

export interface Editing { token: string; service: Service; details: OrderDetails; email: string; keptFiles: string[] }

export function OrderForm({ accept, editing }: { accept: string; editing?: Editing }) {
  const d0 = editing?.details;
  const [step, setStep] = useState(editing ? 2 : 1);
  const [service, setService] = useState<Service | null>(editing?.service ?? null);
  const [f, setF] = useState<Fields>({
    building: d0?.building ?? "", suite: d0?.suite ?? "", sf: d0?.sf ? String(d0.sf) : "", tenant: d0?.tenant ?? TENANT_TYPES[0],
    program: d0?.program ?? "", exhibitType: d0?.exhibitType ?? "single", exhibitTitle: d0?.exhibitTitle ?? "",
    rush: d0?.rush ? "1" : "0", notes: d0?.notes ?? "", dims: d0?.dims ?? "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [email, setEmail] = useState(editing?.email ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const kept = editing?.keptFiles.length ?? 0;
  const details = readDetails((k) => f[k as keyof Fields]);
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  function go(n: number) {
    setError("");
    setStep(n);
    window.scrollTo({ top: 0 });
  }

  function next() {
    let problem: string | null = null;
    if (step === 1 && !service) problem = "Choose the drawing you need.";
    if (step === 2) problem = detailsProblem(service!, details);
    if (step === 3) problem = referenceProblem(files.length + kept, details);
    if (problem) return setError(problem);
    go(step + 1);
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const merged = [...files];
    let problem = "";
    for (const file of Array.from(list)) {
      if (file.size > MAX_BYTES) problem = `"${file.name}" is larger than 50 MB.`;
      else if (merged.reduce((a, x) => a + x.size, 0) + file.size > MAX_TOTAL) problem = "Those files total more than 90 MB. Send the most useful ones; we will ask if we need more.";
      else if (merged.length + kept >= MAX_FILES) problem = `Send up to ${MAX_FILES} files per order.`;
      else if (!merged.some((x) => x.name === file.name && x.size === file.size)) merged.push(file);
    }
    setFiles(merged);
    setError(problem);
  }

  async function submit() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Add a valid email so we can send your preview.");
    if (!confirmed) return setError("Tick the box to confirm the scope is right.");
    setError("");
    setSending(true);
    const body = new FormData();
    body.set("service", service!);
    Object.entries(f).forEach(([k, v]) => body.set(k, v));
    body.set("email", email.trim());
    if (editing) body.set("token", editing.token);
    files.forEach((file) => body.append("files", file));
    try {
      const res = await fetch("/api/orders", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error || "Something went wrong sending your order. Please try again.");
      window.location.assign(json.url);
    } catch (e) {
      setSending(false);
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
  }

  const q = service ? quote(service, details) : null;
  const hasCad = files.some((x) => /\.(dwg|dxf)$/i.test(x.name)) || editing?.keptFiles.some((n) => /\.(dwg|dxf)$/i.test(n));

  return (
    <>
      <ol className="progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i + 1 < step ? "done" : i + 1 === step ? "now" : ""}>{i + 1} <span>{s}</span></li>
        ))}
        <li>5 <span>Preview and price</span></li>
      </ol>

      {step === 1 && (
        <div className="panel">
          <h2>What do you need drawn?</h2>
          <div className="choices" role="radiogroup" aria-label="Drawing type">
            {(Object.keys(SERVICE_NAME) as Service[]).map((s) => (
              <label className="choice" key={s}>
                <input type="radio" name="service" checked={service === s} onChange={() => { setService(s); setError(""); }} />
                <b>{SERVICE_NAME[s]}</b><span className="from">{BLURB[s][0]}</span><span className="d">{BLURB[s][1]}</span>
              </label>
            ))}
          </div>
          <p className="note">Need an area audit, building onboarding or a 3D leasing map? <Link href="/#owners">See owner services</Link>.</p>
          <p className="err" role="alert">{error}</p>
          <div className="actions"><span className="spacer" /><button className="btn" onClick={next}>Continue</button></div>
        </div>
      )}

      {step === 2 && service && (
        <div className="panel">
          <h2>Tell us about the space</h2>
          <div className="row2">
            <div><label htmlFor="bldg">Building name or address</label><input id="bldg" type="text" value={f.building} onChange={set("building")} /></div>
            <div><label htmlFor="suite">Floor and suite</label><input id="suite" type="text" placeholder="Floor 4, Suite 410" value={f.suite} onChange={set("suite")} /></div>
          </div>
          {service !== "exhibit" && (
            <div className="row2">
              <div><label htmlFor="sf">Suite size <small>(SF)</small></label><input id="sf" type="number" min="1" inputMode="numeric" placeholder="4200" value={f.sf} onChange={set("sf")} /></div>
              {service === "spec" && (
                <div><label htmlFor="tenant">Tenant type to show</label>
                  <select id="tenant" value={f.tenant} onChange={set("tenant")}>{TENANT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
              )}
            </div>
          )}
          {service === "prospect" && (
            <>
              <label htmlFor="program">Prospect&apos;s program <small>(headcount, room list, special rooms, preferences)</small></label>
              <textarea id="program" value={f.program} onChange={set("program")} placeholder="22 people. 6 private offices, 14 workstations, 1 conference room for 10, break room, reception. Wants offices on the window wall." />
            </>
          )}
          {service === "exhibit" && (
            <div className="row2">
              <div><label htmlFor="exType">Exhibit</label>
                <select id="exType" value={f.exhibitType} onChange={set("exhibitType")}>
                  <option value="single">Single exhibit · $175</option>
                  <option value="set">Exhibit set (premises, site plan, signage or parking) · $450</option>
                </select></div>
              <div><label htmlFor="exTitle">Exhibit title <small>(exactly as it should print)</small></label><input id="exTitle" type="text" placeholder="Exhibit A – Premises" value={f.exhibitTitle} onChange={set("exhibitTitle")} /></div>
            </div>
          )}
          <div className="row2">
            <div><label htmlFor="speed">Turnaround</label>
              <select id="speed" value={f.rush} onChange={set("rush")}><option value="0">Standard</option><option value="1">Same-day rush (+50%)</option></select></div>
            <div><label htmlFor="notes">Anything else? <small>(optional)</small></label><input id="notes" type="text" value={f.notes} onChange={set("notes")} /></div>
          </div>
          <p className="err" role="alert">{error}</p>
          <div className="actions">
            {editing ? <Link className="btn ghost" href={`/o/${editing.token}`}>Cancel</Link> : <button className="btn ghost" onClick={() => go(1)}>Back</button>}
            <span className="spacer" /><button className="btn" onClick={next}>Continue</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="panel">
          <h2>Upload what you have</h2>
          <p>CAD files, PDFs, marketing flyers, photos, or a hand sketch with dimensions. If you have no drawing at all, type the dimensions and describe the space below.</p>
          <div
            className={`drop${over ? " over" : ""}`} tabIndex={0} role="button" aria-label="Choose files to upload"
            onClick={() => input.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
          >
            <b>Drop files here or click to choose</b><br /><span className="note">DWG, DXF, PDF, JPG, PNG · up to {MAX_FILES} files, 90 MB in total</span>
            <input ref={input} type="file" multiple hidden accept={accept} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>
          <ul className="files">
            {editing?.keptFiles.map((n) => <li key={`kept-${n}`}><span>{n}</span><span className="note" style={{ margin: 0 }}>already sent</span></li>)}
            {files.map((file, i) => (
              <li key={`${file.name}-${file.size}`}><span>{file.name}</span>
                <button type="button" className="linkbtn" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button></li>
            ))}
          </ul>
          <label htmlFor="dims">Dimensions and description <small>(optional if you uploaded a dimensioned drawing)</small></label>
          <textarea id="dims" value={f.dims} onChange={set("dims")} placeholder="Rectangular suite, 60 ft along the window wall by 70 ft deep. Entry door on the corridor side, 12 ft from the east corner. Columns at 30 ft on center." />
          <p className="err" role="alert">{error}</p>
          <div className="actions"><button className="btn ghost" onClick={() => go(2)}>Back</button><span className="spacer" /><button className="btn" onClick={next}>Continue</button></div>
        </div>
      )}

      {step === 4 && service && q && (
        <div className="panel">
          <h2>Here is what we understand</h2>
          <p>Check this before we draft. If anything is off, go back and fix it.</p>
          <ul className="scope">
            {scopeRows(service, details, files.length + kept).map(([k, v]) => <li key={k}><span>{k}</span><span>{v}</span></li>)}
            <li><span>Price</span><span><b>{money(q.totalCents)}</b>, paid only after you have seen the preview</span></li>
          </ul>
          {!hasCad && <div className="flag">No CAD file supplied. We will draft from your other material, and the sheet will say the scale is not verified unless two known dimensions check out.</div>}
          <label htmlFor="email">Where should we send your preview?</label>
          <input id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> <span>This scope is right.</span></label>
          <p className="err" role="alert">{error}</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => go(3)} disabled={sending}>Back</button><span className="spacer" />
            <button className="btn" onClick={submit} disabled={sending}>{sending ? "Sending your files…" : editing ? "Send my changes" : "Send for my preview"}</button>
          </div>
        </div>
      )}
    </>
  );
}
