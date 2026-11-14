import Link from "next/link";
import { OrderBadge, RequestBadge } from "@/components/status";
import { AutoRefresh } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { listActiveOrders, listRequests, paidAmount, quoteMinutesLeft, requestIdsWithDrafts } from "@/lib/data";
import { dateTime, money } from "@/lib/format";
import { FULFILLMENT_LABEL } from "@/lib/types";

export const metadata = { title: "Shop queue" };

function Due({ mins }: { mins: number }) {
  return mins >= 0 ? (
    <span className={`badge ${mins <= 15 ? "border-amber bg-amber text-black" : "border-amber/30 bg-amber/10 text-amber"}`}>Quote due in {mins} min</span>
  ) : (
    <span className="badge border-danger bg-danger text-black">Overdue by {-mins >= 120 ? `${Math.round(-mins / 60)} hr` : `${-mins} min`}</span>
  );
}

export default async function Admin() {
  await requireAdmin();
  const all = listRequests();
  const drafted = requestIdsWithDrafts();
  const toApprove = all.filter((r) => drafted.has(r.id) && r.status !== "closed").reverse();
  const waiting = all.filter((r) => r.status === "submitted" && !drafted.has(r.id)).reverse();
  const orders = listActiveOrders();
  const rest = all.filter((r) => r.status !== "submitted" && !toApprove.includes(r));

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <AutoRefresh seconds={30} />
      <p className="eyebrow">Squiggle shop</p>
      <h1 className="mt-2 text-4xl font-extrabold">Shop queue</h1>

      {toApprove.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-2xl font-bold">Drafts to approve <span className="text-muted">({toApprove.length})</span></h2>
          <ul className="space-y-3">
            {toApprove.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/requests/${r.id}`} className="card-soft flex flex-wrap items-center justify-between gap-3 border-accent/40 bg-tint hover:border-accent">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">{r.title}</p>
                    <p className="text-sm text-muted">{r.ref} · {r.customer_name} · {dateTime(r.created_at)} · agent quote ready to review</p>
                  </div>
                  {r.status === "submitted" ? <Due mins={quoteMinutesLeft(r)} /> : <span className="badge border-amber/30 bg-amber/10 text-amber">Revised quote</span>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-10 mb-3 text-2xl font-bold">Needs a quote <span className="text-muted">({waiting.length})</span></h2>
      {waiting.length === 0 && <p className="card-soft text-muted">All caught up — no requests waiting.</p>}
      <ul className="space-y-3">
        {waiting.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/requests/${r.id}`} className="card-soft flex flex-wrap items-center justify-between gap-3 hover:border-accent">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{r.title}</p>
                <p className="text-sm text-muted">{r.ref} · {r.customer_name} · {dateTime(r.created_at)} · {r.kind === "print_only" ? "print-only" : `custom, wants: ${r.intent}`}</p>
              </div>
              <Due mins={quoteMinutesLeft(r)} />
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 mb-3 text-2xl font-bold">Print orders in progress <span className="text-muted">({orders.length})</span></h2>
      {orders.length === 0 && <p className="card-soft text-muted">No prints in progress.</p>}
      <ul className="space-y-3">
        {orders.map((o) => {
          const due = o.total_cents - paidAmount(o.id);
          return (
            <li key={o.id}>
              <Link href={`/admin/requests/${o.request_id}`} className="card-soft flex flex-wrap items-center justify-between gap-3 hover:border-accent">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">{o.request_title}</p>
                  <p className="text-sm text-muted">
                    {o.ref} · {o.customer_name} · {FULFILLMENT_LABEL[o.fulfillment!]} · {money(o.total_cents)}{due > 0 && ` · ${money(due)} still owed`}
                  </p>
                </div>
                <OrderBadge order={o} due={due} />
              </Link>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-10 mb-3 text-2xl font-bold">Everything else</h2>
      {rest.length === 0 && <p className="card-soft text-muted">Nothing yet.</p>}
      <ul className="space-y-2">
        {rest.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/requests/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-card px-4 py-2.5 hover:border-accent">
              <span className="min-w-0 truncate"><span className="font-semibold">{r.title}</span> <span className="text-sm text-muted">· {r.ref} · {r.customer_name}</span></span>
              <RequestBadge status={r.status} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
