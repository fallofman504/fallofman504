"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { money, parseDollars } from "@/lib/format";

type Item = { label: string; amount: string };
const STARTER: Item[] = [
  { label: "Design & modeling", amount: "" },
  { label: "Material", amount: "" },
  { label: "Print time", amount: "" },
  { label: "Finishing", amount: "" },
];

/** Staff version of the quote endpoint the agents call: POST /api/agent/requests/:id/quote */
export function QuoteForm({ requestId, revision }: { requestId: string; revision: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(STARTER);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const total = items.reduce((s, i) => s + (parseDollars(i.amount) ?? 0), 0);

  const update = (n: number, patch: Partial<Item>) => setItems(items.map((it, i) => (i === n ? { ...it, ...patch } : it)));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const filled = items.filter((i) => i.amount.trim());
    if (filled.some((i) => parseDollars(i.amount) == null || !i.label.trim())) return setError("Each line needs a label and a dollar amount like 12.50.");
    fd.set("items", JSON.stringify(filled.map((i) => ({ label: i.label.trim(), amount_cents: parseDollars(i.amount) }))));
    for (const key of ["stl_price", "shipping", "delivery"]) {
      const raw = String(fd.get(key) ?? "").trim();
      fd.delete(key);
      if (!raw) continue;
      const cents = parseDollars(raw);
      if (cents == null) return setError("Prices should be dollar amounts like 12.50.");
      fd.set(key === "stl_price" ? "stl_price_cents" : `${key}_cents`, String(cents));
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/agent/requests/${requestId}/quote`, { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error || "Couldn't send the quote.");
    form.reset();
    setItems(STARTER);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card space-y-5">
      <h2 className="text-2xl font-bold">{revision ? "Send a revised quote" : "Send the quote"}</h2>

      <div>
        <span className="label">Print price breakdown</span>
        <div className="space-y-2">
          {items.map((it, n) => (
            <div key={n} className="flex gap-2">
              <input className="input" value={it.label} onChange={(e) => update(n, { label: e.target.value })} placeholder="Line item" aria-label={`Item ${n + 1} label`} />
              <input className="input w-32 text-right" value={it.amount} onChange={(e) => update(n, { amount: e.target.value })} placeholder="0.00" inputMode="decimal" aria-label={`Item ${n + 1} amount`} />
              <button type="button" className="cursor-pointer px-1 text-muted hover:text-coral-dark" onClick={() => setItems(items.filter((_, i) => i !== n))} aria-label={`Remove item ${n + 1}`}>✕</button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems([...items, { label: "", amount: "" }])}>+ Add line</button>
          <span className="font-bold tabular-nums">Print total: {money(total)}</span>
        </div>
        <p className="mt-1 text-sm text-muted">Leave all amounts blank to offer the STL only.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Money name="stl_price" label="STL price" hint="Blank = not offered" />
        <Money name="delivery" label="Houston delivery fee" hint="Blank = not offered" />
        <Money name="shipping" label="Shipping fee" hint="Blank = not offered" />
        <label>
          <span className="label">Lead time (days)</span>
          <input className="input" name="lead_time_days" inputMode="numeric" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FileInput name="turntable" label="Turntable video" accept=".mp4,.webm" />
        <FileInput name="render" label="Render" accept=".png,.jpg,.jpeg,.webp" />
        <FileInput name="model" label="Model file (STL)" accept=".stl,.3mf,.obj" />
      </div>

      <label className="block">
        <span className="label">Message to the customer</span>
        <textarea className="input min-h-24" name="note" maxLength={4000} placeholder="Here's your design! We modeled it at 5 inches long in matte PLA…" />
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-coral" disabled={busy}>{busy ? "Sending…" : "Send quote to customer"}</button>
    </form>
  );
}

function Money({ name, label, hint }: { name: string; label: string; hint: string }) {
  return (
    <label>
      <span className="label">{label}</span>
      <input className="input" name={name} placeholder="0.00" inputMode="decimal" />
      <span className="mt-1 block text-xs text-muted">{hint}</span>
    </label>
  );
}

function FileInput({ name, label, accept }: { name: string; label: string; accept: string }) {
  return (
    <label>
      <span className="label">{label}</span>
      <input type="file" name={name} accept={accept} className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border-2 file:border-ink file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold" />
    </label>
  );
}
