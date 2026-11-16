"use client";

import { useActionState } from "react";
import { requestSnapshot } from "@/app/actions";

export function SnapshotForm() {
  const [state, action, pending] = useActionState(requestSnapshot, null);
  if (state?.ok) return <p role="status"><b>{state.ok}</b></p>;
  return (
    <form action={action}>
      <div className="row2">
        <div><label htmlFor="sName">Your name</label><input id="sName" name="name" type="text" autoComplete="name" required /></div>
        <div><label htmlFor="sEmail">Work email</label><input id="sEmail" name="email" type="email" autoComplete="email" required /></div>
      </div>
      <div className="row2">
        <div><label htmlFor="sBldg">Building name or address</label><input id="sBldg" name="building" type="text" required /></div>
        <div><label htmlFor="sSf">Approximate building size <small>(SF)</small></label><input id="sSf" name="sf" type="number" min="0" inputMode="numeric" /></div>
      </div>
      <p className="err" role="alert">{state?.error}</p>
      <div className="actions"><button className="btn" disabled={pending}>{pending ? "Sending…" : "Request my Snapshot"}</button></div>
    </form>
  );
}
