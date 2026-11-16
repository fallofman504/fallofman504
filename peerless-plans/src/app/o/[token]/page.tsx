import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh, BuyForm, StartOver } from "@/components/order-bits";
import { getOrderByToken, listFiles } from "@/lib/orders";
import { conceptNote, deliverableFormats, money, quote, scopeRows, serviceTitle } from "@/lib/pricing";

export const metadata = { title: "Your order", robots: { index: false } };

const when = (t: number) => new Date(t).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" });

export default async function OrderStatus({ params }: { params: Promise<{ token: string }> }) {
  const order = getOrderByToken((await params).token);
  if (!order) notFound();
  const files = listFiles(order.id);
  const refs = files.filter((f) => f.kind === "reference");
  const preview = files.find((f) => f.kind === "preview");
  const finals = files.filter((f) => f.kind === "deliverable");
  const q = quote(order.service, order.details);
  const title = serviceTitle(order.service, order.details);
  const t = `?t=${order.token}`;
  const stepNow = { drafting: 5, preview_ready: 5, paid: 6, delivered: 7, cancelled: 0 }[order.status];

  const scope = (
    <ul className="scope">
      {scopeRows(order.service, order.details, refs.length).map(([k, v]) => <li key={k}><span>{k}</span><span>{v}</span></li>)}
    </ul>
  );
  const lines = (
    <>
      <ul className="lines">{q.lines.map((l) => <li key={l.label}><span>{l.label}</span><span className="mono">{money(l.cents)}</span></li>)}</ul>
      <div className="total"><small>TOTAL</small><span>{money(order.price_cents)}</span></div>
    </>
  );

  return (
    <main className="order">
      <div className="wrap">
        <p className="eyebrow">Job {order.ref} · {title}</p>
        {order.status !== "cancelled" && (
          <ol className="progress">
            {["Request sent", "Preview and price", "Checked and signed", "Download"].map((s, i) => {
              const n = i + 4;
              const cls = order.status === "delivered" || n < stepNow ? "done" : n === stepNow ? "now" : "";
              return <li key={s} className={cls}><span>{s}</span></li>;
            })}
          </ol>
        )}

        {order.status === "drafting" && (
          <div className="panel">
            <AutoRefresh />
            <h2>Your preview is being drafted</h2>
            <p>We will email <b>{order.email}</b> when it is ready, and it will appear on this page. You pay nothing until you have seen it.</p>
            <div className="pq">
              <div>{scope}</div>
              <div className="quote">{lines}<p className="note">Delivered {q.turnaround.toLowerCase()} after payment.</p></div>
            </div>
            <div className="actions"><Link className="linkbtn" href={`/o/${order.token}/edit`}>Adjust my request</Link><StartOver token={order.token} /></div>
          </div>
        )}

        {order.status === "preview_ready" && (
          <div className="panel">
            <h2>Your preview and price</h2>
            <div className="pq">
              <div>
                {preview && (
                  <div className="preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${preview.id}${t}`} alt={`Watermarked preview of your ${title.toLowerCase()}`} />
                    <span className="tag">PREVIEW · CROPPED · UNCHECKED DRAFT</span>
                  </div>
                )}
                <p className="note">You are seeing part of the sheet, at low resolution and watermarked. The full drawing is checked and signed by a person after you buy.</p>
              </div>
              <div className="quote">
                {lines}
                <p className="note">Delivered {q.turnaround.toLowerCase()} after payment, once a person has checked and signed the sheet.</p>
                <p style={{ margin: "14px 0 4px" }}><b>You receive</b></p>
                <div className="fmt">{deliverableFormats(order.service).map((f) => <span key={f}>{f}</span>)}</div>
                <BuyForm token={order.token} note={conceptNote(order.service)} />
                <div className="actions" style={{ marginTop: 14 }}><Link className="linkbtn" href={`/o/${order.token}/edit`}>Adjust my request</Link><StartOver token={order.token} /></div>
              </div>
            </div>
            <details style={{ marginTop: 22 }}><summary>What we understood from your request</summary>{scope}</details>
          </div>
        )}

        {order.status === "paid" && (
          <div className="panel">
            <AutoRefresh seconds={60} />
            <h2>Payment received. Your sheet is being checked.</h2>
            <p>
              We received {money(order.price_cents)}{order.paid_at ? ` on ${when(order.paid_at)} (Houston time)` : ""}. A person now checks and signs the
              sheet. Turnaround: <b>{q.turnaround.toLowerCase()}</b>. We will email <b>{order.email}</b> when your files are ready, and they will appear
              on this page.
            </p>
            {scope}
          </div>
        )}

        {order.status === "delivered" && (
          <div className="panel">
            <h2>Your drawing is ready</h2>
            <p>Checked and signed by <b>{order.signed_by}</b>{order.delivered_at ? ` on ${when(order.delivered_at)} (Houston time)` : ""}.</p>
            <ul className="files">
              {finals.map((f) => (
                <li key={f.id}><span>{f.filename}</span><a className="btn small" href={`/api/files/${f.id}${t}`}>Download</a></li>
              ))}
            </ul>
            <p className="note">Keep this page&apos;s link: it is how you get back to your files. Found a drafting error? Reply to your delivery email and we correct it at no charge.</p>
            <details style={{ marginTop: 22 }}><summary>What was ordered</summary>{scope}</details>
          </div>
        )}

        {order.status === "cancelled" && (
          <div className="panel">
            <h2>This request was cancelled</h2>
            <p>Nothing was charged.</p>
            <div className="actions"><Link className="btn" href="/order">Start a new order</Link></div>
          </div>
        )}
      </div>
    </main>
  );
}
