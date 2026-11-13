import Link from "next/link";
import { notFound } from "next/navigation";
import { adminSetRequestStatus, adminUpdateOrder } from "@/app/actions";
import { QuoteForm } from "@/components/quote-form";
import { MessageForm, ReferenceFiles, Thread } from "@/components/request-view";
import { OrderBadge, RequestBadge } from "@/components/status";
import { SubmitButton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { findUser, getRequest, listFiles, listMessages, listOrders, listPayments, listQuotes } from "@/lib/data";
import { dateTime, money } from "@/lib/format";
import { FULFILLMENT_LABEL, type Order } from "@/lib/types";

export const metadata = { title: "Request" };

export default async function AdminRequest({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const request = getRequest(id);
  if (!request) notFound();
  const customer = findUser(request.user_id)!;
  const files = listFiles(id);
  const quotes = listQuotes(id);
  const orders = listOrders(id);
  const closed = request.status === "closed";

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/admin" className="text-sm font-semibold text-muted hover:text-ink">← Shop queue</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-4xl font-extrabold">{request.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {request.ref} · {customer.name} · <a className="underline" href={`mailto:${customer.email}`}>{customer.email}</a>
            {customer.phone && ` · ${customer.phone}`} · {dateTime(request.created_at)} · wants: {request.intent}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RequestBadge status={request.status} />
          <form action={adminSetRequestStatus.bind(null, id, closed ? "submitted" : "closed")}>
            <button className="cursor-pointer text-sm font-semibold text-muted underline hover:text-ink">{closed ? "Reopen" : "Close request"}</button>
          </form>
        </div>
      </div>

      {files.some((f) => f.kind === "reference") && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Reference files</h2>
          <ReferenceFiles files={files.filter((f) => f.kind === "reference")} />
        </section>
      )}

      {orders.map((o) => <AdminOrder key={o.id} order={o} />)}

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold">Conversation</h2>
        <Thread messages={listMessages(id)} quotes={quotes} files={files} viewer="squiggle" />
        {files.filter((f) => f.kind === "model").length > 0 && (
          <p className="mt-4 text-sm text-muted">
            Model files:{" "}
            {files.filter((f) => f.kind === "model").map((f) => (
              <a key={f.id} className="mr-3 font-semibold text-ink underline" href={`/api/files/${f.id}`}>{f.filename}</a>
            ))}
          </p>
        )}
      </section>

      {!closed && (
        <>
          <section className="mt-6">
            <MessageForm requestId={id} placeholder="Message the customer…" />
          </section>
          <section className="mt-10">
            <QuoteForm requestId={id} revision={quotes.length > 0} />
          </section>
        </>
      )}
    </div>
  );
}

function AdminOrder({ order }: { order: Order }) {
  const payments = listPayments(order.id);
  const paid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount_cents, 0);
  const due = order.total_cents - paid;
  const act = adminUpdateOrder.bind(null, order.id);
  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Order {order.ref}</p>
          <h2 className="mt-1 text-2xl font-bold">
            {order.type === "stl" ? "STL file" : `Print · ${FULFILLMENT_LABEL[order.fulfillment!]}`}
          </h2>
        </div>
        <OrderBadge order={order} due={due} />
      </div>
      <p className="mt-3 text-[15px]">
        Total <b>{money(order.total_cents)}</b> · paid <b>{money(paid)}</b>{due > 0 && <> · owed <b>{money(due)}</b></>}
      </p>
      {order.address && (
        <p className="mt-1 text-sm text-muted">
          {order.address.name}, {order.address.line1}{order.address.line2 && `, ${order.address.line2}`}, {order.address.city}, {order.address.state} {order.address.zip}
          {order.address.phone && ` · ${order.address.phone}`}
        </p>
      )}
      <ul className="mt-3 space-y-1 text-sm text-muted">
        {payments.map((p) => (
          <li key={p.id}>
            {p.kind} · {money(p.amount_cents)} · {p.status === "paid" ? `paid ${dateTime(p.paid_at!)} (${p.method === "in_person" ? "in person" : p.method})` : "not paid yet"}
          </li>
        ))}
      </ul>
      {order.tracking && <p className="mt-2 text-sm">Tracking: <b>{order.tracking}</b></p>}

      {order.type === "print" && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {order.status === "in_production" && (
            <form action={act}>
              <input type="hidden" name="action" value="ready" />
              <SubmitButton className="btn btn-coral">Mark printed &amp; ready</SubmitButton>
            </form>
          )}
          {(order.status === "in_production" || order.status === "ready") && due > 0 && (
            <form action={act}>
              <input type="hidden" name="action" value="record_balance" />
              <SubmitButton className="btn btn-ghost">Record {money(due)} paid in person</SubmitButton>
            </form>
          )}
          {order.status === "ready" && due <= 0 && (
            <form action={act} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="action" value="complete" />
              {order.fulfillment === "shipping" && (
                <label>
                  <span className="label">Tracking number</span>
                  <input className="input" name="tracking" />
                </label>
              )}
              <SubmitButton className="btn btn-coral">
                {order.fulfillment === "shipping" ? "Mark shipped" : order.fulfillment === "delivery" ? "Mark delivered" : "Mark picked up"}
              </SubmitButton>
            </form>
          )}
          {order.status === "ready" && due > 0 && <p className="text-sm text-muted">Hand-off unlocks once the balance is paid.</p>}
        </div>
      )}
    </section>
  );
}
