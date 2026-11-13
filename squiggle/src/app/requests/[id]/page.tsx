import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelUnpaidOrder, payOrder, placeOrder } from "@/app/actions";
import { MessageForm, ReferenceFiles, Thread } from "@/components/request-view";
import { OrderBadge, RequestBadge } from "@/components/status";
import { AutoRefresh, SubmitButton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getRequest, listFiles, listMessages, listOrders, listPayments, listQuotes } from "@/lib/data";
import { dateTime, money } from "@/lib/format";
import { FULFILLMENT_LABEL, type Order } from "@/lib/types";

export const metadata = { title: "Project" };

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/requests/${id}`);
  const request = getRequest(id);
  if (!request || request.user_id !== user.id) notFound();

  const files = listFiles(id);
  const quotes = listQuotes(id);
  const quote = quotes.at(-1);
  const orders = listOrders(id).filter((o) => o.status !== "cancelled");
  const stlOrder = orders.find((o) => o.type === "stl");
  const printOrder = orders.find((o) => o.type === "print");
  const model = quote && files.find((f) => f.kind === "model" && f.quote_id === quote.id);
  const open = request.status !== "closed";

  async function buyStl() {
    "use server";
    const fd = new FormData();
    fd.set("requestId", id);
    fd.set("type", "stl");
    await placeOrder(undefined, fd);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      {request.status === "submitted" && <AutoRefresh />}
      <Link href="/dashboard" className="text-sm font-semibold text-muted hover:text-ink">← My projects</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-4xl font-extrabold">{request.title}</h1>
          <p className="mt-1 text-sm text-muted">{request.ref} · sent {dateTime(request.created_at)}</p>
        </div>
        <RequestBadge status={request.status} />
      </div>

      {request.status === "submitted" && (
        <div className="card mt-6 bg-sun/40">
          <h2 className="text-2xl font-bold">We&apos;re on it ✏️</h2>
          <p className="mt-1">
            Your 3D model, price breakdown, render, and turntable video will show up right here — usually within an hour. This page updates on its
            own, so feel free to leave it open.
          </p>
        </div>
      )}

      {files.some((f) => f.kind === "reference") && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Your reference files</h2>
          <ReferenceFiles files={files.filter((f) => f.kind === "reference")} />
        </section>
      )}

      {orders.map((o) => <OrderCard key={o.id} order={o} modelId={stlOrder?.status === "completed" ? model?.id : undefined} />)}

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold">Conversation</h2>
        <Thread messages={listMessages(id)} quotes={quotes} files={files} viewer="customer" />
      </section>

      {quote && open && (!stlOrder || !printOrder) && (
        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          {quote.print_total_cents != null && !printOrder && (
            <div className="card bg-sun/40">
              <h3 className="text-2xl font-bold">Have us print it</h3>
              <p className="mt-1 text-3xl font-extrabold tabular-nums">{money(quote.print_total_cents)}</p>
              <p className="mt-2 text-sm">Pay a 50% deposit today, the rest when it&apos;s ready. Pickup, Houston delivery, or shipping.</p>
              <Link href={`/requests/${id}/order`} className="btn btn-coral mt-4">Choose pickup or delivery</Link>
            </div>
          )}
          {quote.stl_price_cents != null && !stlOrder && (
            <form action={buyStl} className="card">
              <h3 className="text-2xl font-bold">Just the STL</h3>
              <p className="mt-1 text-3xl font-extrabold tabular-nums">{money(quote.stl_price_cents)}</p>
              <p className="mt-2 text-sm text-muted">Pay once and download the print-ready file right away.</p>
              <SubmitButton className="btn mt-4" pendingText="Opening checkout…">Buy &amp; download</SubmitButton>
            </form>
          )}
        </section>
      )}

      {open && (
        <section className="mt-8">
          <MessageForm requestId={id} placeholder={quote ? "Want a change? Ask a question or request a tweak…" : "Add a detail or ask a question…"} />
        </section>
      )}
    </div>
  );
}

function OrderCard({ order, modelId }: { order: Order; modelId?: string }) {
  const payments = listPayments(order.id);
  const paid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount_cents, 0);
  const due = order.total_cents - paid;
  const unpaid = order.status === "awaiting_payment";
  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Order {order.ref}</p>
          <h2 className="mt-1 text-2xl font-bold">{order.type === "stl" ? "STL file" : "Printed by Squiggle"}</h2>
        </div>
        <OrderBadge order={order} due={due} />
      </div>

      <dl className="mt-4 space-y-1.5 text-[15px]">
        {order.type === "print" && (
          <>
            <Row label="Print">{money(order.subtotal_cents)}</Row>
            <Row label={FULFILLMENT_LABEL[order.fulfillment!]}>{order.fulfillment_cents ? money(order.fulfillment_cents) : "Free"}</Row>
          </>
        )}
        <Row label="Total" bold>{money(order.total_cents)}</Row>
        {paid > 0 && <Row label="Paid">{money(paid)}</Row>}
        {order.type === "print" && due > 0 && <Row label={paid ? "Balance due" : "Deposit due today (50%)"} bold>{money(paid ? due : order.deposit_cents)}</Row>}
      </dl>

      {order.address && (
        <p className="mt-3 text-sm text-muted">
          {order.fulfillment === "delivery" ? "Deliver" : "Ship"} to: {order.address.name}, {order.address.line1}
          {order.address.line2 && `, ${order.address.line2}`}, {order.address.city}, {order.address.state} {order.address.zip}
        </p>
      )}
      {order.tracking && <p className="mt-2 text-sm">Tracking: <span className="font-semibold">{order.tracking}</span></p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {modelId && order.type === "stl" && <a href={`/api/files/${modelId}`} className="btn btn-coral">Download STL</a>}
        {unpaid && (
          <>
            <form action={payOrder.bind(null, order.id)}>
              <SubmitButton className="btn btn-coral" pendingText="Opening checkout…">
                {order.type === "stl" ? `Pay ${money(order.total_cents)}` : `Pay ${money(order.deposit_cents)} deposit`}
              </SubmitButton>
            </form>
            <form action={cancelUnpaidOrder.bind(null, order.id)}>
              <button className="cursor-pointer text-sm font-semibold text-muted underline hover:text-ink">Cancel</button>
            </form>
          </>
        )}
        {!unpaid && order.type === "print" && due > 0 && (
          <>
            <form action={payOrder.bind(null, order.id)}>
              <SubmitButton className={order.status === "ready" ? "btn btn-coral" : "btn btn-ghost"} pendingText="Opening checkout…">
                Pay remaining {money(due)}
              </SubmitButton>
            </form>
            <p className="text-sm text-muted">
              {order.fulfillment === "pickup" ? "Or pay the balance when you pick it up." : "The balance is due before we send it out."}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Row({ label, bold, children }: { label: string; bold?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? "font-bold" : ""}`}>
      <dt className={bold ? "" : "text-muted"}>{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}
