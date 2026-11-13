"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fileSize } from "@/lib/format";
import { PrintOptionsFields } from "./print-options";

const INTENTS = [
  { value: "print", title: "Print it for me", body: "Squiggle makes it. Pickup, Houston delivery, or shipping." },
  { value: "stl", title: "Just the STL", body: "I'll download the file and print it myself." },
  { value: "undecided", title: "Not sure yet", body: "Show me both prices and I'll decide." },
];

/**
 * mode "custom": describe an idea and Squiggle designs it.
 * mode "print": the customer already has a 3D model and only needs it printed.
 */
export function NewRequestForm({ mode, accept, maxFiles, maxBytes }: { mode: "custom" | "print"; accept: string; maxFiles: number; maxBytes: number }) {
  const printOnly = mode === "print";
  const [intent, setIntent] = useState("undecided");
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > maxBytes) return setError(`"${f.name}" is larger than ${fileSize(maxBytes)}.`);
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    if (next.length > maxFiles) return setError(`You can attach up to ${maxFiles} files.`);
    setError("");
    setFiles(next);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (printOnly && files.length === 0) return setError("Attach the 3D model you want printed.");
    fd.delete("files");
    files.forEach((f) => fd.append("files", f));
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/requests", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Something went wrong. Please try again.");
      router.push(`/requests/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <input type="hidden" name="kind" value={printOnly ? "print_only" : "custom"} />
      <div>
        <label className="label" htmlFor="title">{printOnly ? "Name this print" : "Project name"}</label>
        <input className="input" id="title" name="title" maxLength={120} placeholder={printOnly ? "Replacement dishwasher wheel" : "Sleepy armadillo desk planter"} required />
      </div>

      {!printOnly && (
        <div>
          <label className="label" htmlFor="prompt">What do you want to make?</label>
          <textarea className="input min-h-36" id="prompt" name="prompt" maxLength={5000}
            placeholder="Describe it like you'd tell a friend: what it is, roughly how big, what it's for, colors or materials you have in mind…" />
        </div>
      )}

      <div>
        <span className="label">{printOnly ? "Your 3D model" : <>Photos, sketches, or 3D files <span className="font-normal text-muted">(optional)</span></>}</span>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${dragging ? "border-coral bg-coral/10" : "border-line bg-white"}`}
        >
          <p className="font-semibold">Drop files here</p>
          <p className="mt-1 text-sm text-muted">{printOnly ? "STL, 3MF, OBJ, or STEP" : "Images, PDF, STL, OBJ, 3MF, STEP"} · up to {maxFiles} files, {fileSize(maxBytes)} each</p>
          <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={() => picker.current?.click()}>Choose files</button>
          <input ref={picker} type="file" name="files" multiple accept={accept} className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>
        {files.length > 0 && (
          <ul className="mt-3 space-y-2">
            {files.map((f, i) => (
              <li key={f.name + f.size} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-2 text-sm">
                <span className="min-w-0 truncate font-medium">{f.name}</span>
                <span className="flex shrink-0 items-center gap-3 text-muted">
                  {fileSize(f.size)}
                  <button type="button" className="cursor-pointer font-semibold text-coral-dark" onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    aria-label={`Remove ${f.name}`}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {printOnly ? (
        <>
          <fieldset>
            <legend className="mb-3 text-2xl font-bold">Print settings</legend>
            <PrintOptionsFields />
          </fieldset>
          <div>
            <label className="label" htmlFor="prompt">Anything we should know? <span className="font-normal text-muted">(optional)</span></label>
            <textarea className="input min-h-24" id="prompt" name="prompt" maxLength={5000}
              placeholder="Size or scale, which way up, parts that need to fit together, a deadline…" />
          </div>
        </>
      ) : (
        <>
          <fieldset>
            <legend className="label">What are you after?</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {INTENTS.map((o) => (
                <label key={o.value} className="cursor-pointer rounded-2xl border-2 border-line bg-white p-4 transition has-checked:border-ink has-checked:bg-sun/40">
                  <input type="radio" name="intent" value={o.value} checked={intent === o.value} onChange={() => setIntent(o.value)} className="sr-only" />
                  <span className="block font-bold">{o.title}</span>
                  <span className="mt-1 block text-sm text-muted">{o.body}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {intent === "print" && (
            <fieldset>
              <legend className="mb-1 text-2xl font-bold">Print settings</legend>
              <p className="mb-3 text-sm text-muted">We&apos;ll price your print with these. You can ask for changes after you see the quote.</p>
              <PrintOptionsFields />
            </fieldset>
          )}
        </>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-coral px-7 py-3.5 text-base" disabled={busy}>{busy ? "Sending…" : printOnly ? "Get my print quote" : "Send it to Squiggle"}</button>
      <p className="text-sm text-muted">
        {printOnly
          ? "No payment now. You'll get a price in about an hour, then choose pickup, delivery, or shipping."
          : "No payment now. You'll get a quote, render, and turntable video in about an hour."}
      </p>
    </form>
  );
}
