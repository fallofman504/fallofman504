"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { buyOrder, cancelOrder } from "@/app/actions";

/** Re-checks the order while the customer waits, so the preview or the files appear without a manual refresh. */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

export function BuyForm({ token, note }: { token: string; note: string }) {
  const [state, action, pending] = useActionState(buyOrder.bind(null, token), null);
  return (
    <form action={action}>
      <label className="check"><input type="checkbox" name="concept" /> <span>{note}</span></label>
      <p className="err" role="alert">{state?.error}</p>
      <div className="actions"><button className="btn" disabled={pending}>{pending ? "Opening checkout…" : "Buy this drawing"}</button></div>
    </form>
  );
}

export function StartOver({ token }: { token: string }) {
  return (
    <form
      action={cancelOrder.bind(null, token)}
      onSubmit={(e) => { if (!confirm("Start over? This request and its preview will be discarded.")) e.preventDefault(); }}
      style={{ display: "inline" }}
    >
      <button className="linkbtn">Start over</button>
    </form>
  );
}
