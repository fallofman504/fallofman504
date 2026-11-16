import Link from "next/link";
import { redirect } from "next/navigation";
import { adminLogout } from "@/app/actions";
import { listLeads, listOrders, type Order } from "@/lib/orders";
import { money, quote, serviceTitle } from "@/lib/pricing";
import { isAdmin } from "@/lib/staff";

export const metadata = { title: "Review queue", robots: { index: false } };

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`;
};

function Queue({ title, orders, stamp, empty }: { title: string; orders: Order[]; stamp: (o: Order) => number; empty: string }) {
  return (
    <>
      <h3>{title} ({orders.length})</h3>
      <ul className="adminlist">
        {orders.length === 0 && <li className="empty">{empty}</li>}
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/admin/orders/${o.id}`}>
              <span className="mono">{o.ref}</span>
              <span>{serviceTitle(o.service, o.details)} · {o.details.building}, {o.details.suite}</span>
              <span>{o.details.rush && <span className="badge hot">Rush</span>} <span className="badge">{quote(o.service, o.details).turnaround}</span></span>
              <span className="note" style={{ margin: 0 }}>{money(o.price_cents)} · {ago(stamp(o))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function Admin() {
  if (!(await isAdmin())) redirect("/admin/login");
  const all = listOrders();
  const by = (s: Order["status"]) => all.filter((o) => o.status === s).reverse();
  const leads = listLeads();
  return (
    <main className="order">
      <div className="wrap">
        <div className="actions" style={{ marginTop: 0, marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>Review queue</h2><span className="spacer" />
          <form action={adminLogout}><button className="linkbtn">Sign out</button></form>
        </div>
        <Queue title="Paid, waiting for your sign-off" orders={by("paid")} stamp={(o) => o.paid_at ?? o.updated_at} empty="Nothing is waiting for you." />
        <Queue title="Waiting for a preview" orders={by("drafting")} stamp={(o) => o.updated_at} empty="No orders are waiting on the agents." />
        <Queue title="Preview sent, not bought yet" orders={by("preview_ready")} stamp={(o) => o.preview_at ?? o.updated_at} empty="No previews are out." />
        <Queue title="Delivered" orders={by("delivered").reverse().slice(0, 30)} stamp={(o) => o.delivered_at ?? o.updated_at} empty="Nothing delivered yet." />
        <h3>Free Variance Snapshot requests ({leads.length})</h3>
        <ul className="adminlist">
          {leads.length === 0 && <li className="empty">No requests yet.</li>}
          {leads.map((l) => (
            <li key={l.id}><a href={`mailto:${l.email}`}><span className="mono">{ago(l.created_at)}</span><span>{l.building}{l.sf ? ` · ${l.sf.toLocaleString("en-US")} SF` : ""}</span><span>{l.name}</span><span className="note" style={{ margin: 0 }}>{l.email}</span></a></li>
          ))}
        </ul>
      </div>
    </main>
  );
}
