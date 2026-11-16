import { notFound } from "next/navigation";
import { mockPay } from "@/app/actions";
import { getOrderByToken } from "@/lib/orders";
import { mockPaymentsAllowed } from "@/lib/payments";
import { money } from "@/lib/pricing";

export const metadata = { title: "Simulated checkout" };

/** Stands in for Stripe Checkout while no Stripe key is set. Never available on the live site. */
export default async function MockPay({ params }: { params: Promise<{ token: string }> }) {
  const order = getOrderByToken((await params).token);
  if (!order || !mockPaymentsAllowed() || order.status !== "preview_ready") notFound();
  return (
    <main className="order">
      <div className="wrap">
        <div className="panel">
          <p className="eyebrow">Simulated checkout · no Stripe key set</p>
          <h2>Pay {money(order.price_cents)} for {order.ref}</h2>
          <p>This page stands in for Stripe while you build. No card is charged.</p>
          <form action={mockPay.bind(null, order.token)} className="actions">
            <button className="btn">Simulate a successful payment</button>
            <a className="btn ghost" href={`/o/${order.token}`}>Cancel</a>
          </form>
        </div>
      </div>
    </main>
  );
}
