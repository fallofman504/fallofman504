"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { adminLogin, signOff } from "@/app/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(adminLogin, null);
  return (
    <form action={action}>
      <label htmlFor="passcode">Passcode</label>
      <input id="passcode" name="passcode" type="password" autoComplete="current-password" style={{ width: "100%", font: "16px var(--sans)", padding: "11px 12px", border: "1.5px solid var(--ink)" }} required />
      <p className="err" role="alert">{state?.error}</p>
      <div className="actions"><button className="btn" disabled={pending}>Sign in</button></div>
    </form>
  );
}

/** Sends files to one of the staff endpoints (the same ones the agents call) and refreshes the page. */
export function StaffUpload({ url, field, accept, multiple, label }: { url: string; field: string; accept: string; multiple?: boolean; label: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setMsg("");
    const res = await fetch(url, { method: "POST", body: new FormData(form) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setMsg(json.error || "Upload failed. Try again.");
    form.reset();
    router.refresh();
  }
  return (
    <form onSubmit={onSubmit}>
      <label>{label}<br /><input type="file" name={field} accept={accept} multiple={multiple} required style={{ marginTop: 6 }} /></label>
      <p className="err" role="alert">{msg}</p>
      <button className="btn small" disabled={busy}>{busy ? "Uploading…" : "Upload"}</button>
    </form>
  );
}

export function SignOffForm({ orderId, defaultName }: { orderId: string; defaultName: string }) {
  const [state, action, pending] = useActionState(signOff.bind(null, orderId), null);
  if (state?.ok) return <p role="status"><b>{state.ok}</b></p>;
  return (
    <form action={action}>
      <label htmlFor="signed_by">Checked by <small>(your name as it appears in the title block)</small></label>
      <input id="signed_by" name="signed_by" type="text" defaultValue={defaultName} required />
      <label className="check"><input type="checkbox" name="checked" /> <span>I reviewed the sheet and the QA report. Release these files to the customer.</span></label>
      <p className="err" role="alert">{state?.error}</p>
      <div className="actions"><button className="btn" disabled={pending}>Sign and release</button></div>
    </form>
  );
}
