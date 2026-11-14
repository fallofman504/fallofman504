"use client";

import { useActionState, useState } from "react";
import { placeOrder } from "@/app/actions";
import { money } from "@/lib/format";
import { FULFILLMENT_LABEL, type Fulfillment } from "@/lib/types";
import { SubmitButton } from "./ui";

const BLURB: Record<Fulfillment, string> = {
  pickup: "Grab it from our Houston shop. Pay the balance when you pick up.",
  delivery: "We bring it to your door in the Houston area.",
  shipping: "We pack it up and ship it to you.",
};

export function OrderForm({ requestId, printTotal, fees, defaults }: {
  requestId: string;
  printTotal: number;
  fees: Record<Fulfillment, number | null>;
  defaults: { name: string; phone: string };
}) {
  const [state, action] = useActionState(placeOrder, undefined);
  const [method, setMethod] = useState<Fulfillment>("pickup");
  const total = printTotal + (fees[method] ?? 0);
  const deposit = Math.ceil(total / 2);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="type" value="print" />

      <fieldset>
        <legend className="label">How do you want to get it?</legend>
        <div className="space-y-3">
          {(Object.keys(FULFILLMENT_LABEL) as Fulfillment[]).filter((m) => fees[m] != null).map((m) => (
            <label key={m} className="flex cursor-pointer items-center justify-between gap-4 rounded-md border-2 border-line bg-field p-4 transition has-checked:border-accent has-checked:bg-tint">
              <span>
                <input type="radio" name="fulfillment" value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
                <span className="block font-bold">{FULFILLMENT_LABEL[m]}</span>
                <span className="block text-sm text-muted">{BLURB[m]}</span>
              </span>
              <span className="font-bold tabular-nums">{fees[m] ? money(fees[m]!) : "Free"}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {method !== "pickup" && (
        <fieldset className="grid gap-4 sm:grid-cols-6">
          <legend className="label">{method === "delivery" ? "Delivery address" : "Shipping address"}</legend>
          <Field className="sm:col-span-4" name="name" label="Full name" autoComplete="name" defaultValue={defaults.name} />
          <Field className="sm:col-span-2" name="phone" label="Phone" autoComplete="tel" type="tel" defaultValue={defaults.phone} required={method === "delivery"} />
          <Field className="sm:col-span-6" name="line1" label="Street address" autoComplete="address-line1" />
          <Field className="sm:col-span-6" name="line2" label="Apt, suite, etc. (optional)" autoComplete="address-line2" required={false} />
          <Field className="sm:col-span-3" name="city" label="City" autoComplete="address-level2" defaultValue={method === "delivery" ? "Houston" : ""} />
          <Field className="sm:col-span-1" name="state" label="State" autoComplete="address-level1" maxLength={2} defaultValue={method === "delivery" ? "TX" : ""} />
          <Field className="sm:col-span-2" name="zip" label="ZIP" autoComplete="postal-code" inputMode="numeric" />
        </fieldset>
      )}

      <div className="card">
        <dl className="space-y-1.5">
          <div className="flex justify-between"><dt className="text-muted">Print</dt><dd className="tabular-nums">{money(printTotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">{FULFILLMENT_LABEL[method]}</dt><dd className="tabular-nums">{fees[method] ? money(fees[method]!) : "Free"}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 font-bold"><dt>Total</dt><dd className="tabular-nums">{money(total)}</dd></div>
          <div className="flex justify-between text-lg font-extrabold"><dt>Due today (50% deposit)</dt><dd className="tabular-nums">{money(deposit)}</dd></div>
          <div className="flex justify-between text-sm text-muted">
            <dt>{method === "pickup" ? "Due at pickup" : method === "delivery" ? "Due before delivery" : "Due before shipping"}</dt>
            <dd className="tabular-nums">{money(total - deposit)}</dd>
          </div>
        </dl>
        {state?.error && <p className="error mt-4" role="alert">{state.error}</p>}
        <SubmitButton className="btn btn-primary mt-5 w-full py-3.5 text-base" pendingText="Opening checkout…">Pay {money(deposit)} deposit</SubmitButton>
      </div>
    </form>
  );
}

function Field({ label, className, required = true, ...props }: { label: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={className}>
      <span className="label">{label}</span>
      <input className="input" required={required} {...props} />
    </label>
  );
}
