import { notFound } from "next/navigation";
import { mockPay } from "@/app/actions";
import { SubmitButton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getOrder, getPayment } from "@/lib/data";
import { money } from "@/lib/format";
import { mockPaymentsAllowed } from "@/lib/payments";

export const metadata = { title: "Simulated checkout" };

/** Stand-in for Stripe Checkout, used only while no Stripe key is configured. */
export default async function MockPay({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!mockPaymentsAllowed()) notFound();
  const payment = getPayment((await params).id);
  const order = payment && getOrder(payment.order_id);
  if (!payment || !order || order.user_id !== user.id || payment.status === "paid") notFound();
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <div className="card text-center">
        <p className="eyebrow">Test mode · no real charge</p>
        <h1 className="mt-2 text-3xl font-extrabold">Simulated checkout</h1>
        <p className="mt-2 text-muted">
          Stripe isn&apos;t connected yet, so this page stands in for the card form. Order {order.ref}, {payment.kind} payment.
        </p>
        <p className="mt-5 text-5xl font-extrabold tabular-nums">{money(payment.amount_cents)}</p>
        <form action={mockPay.bind(null, payment.id)} className="mt-6">
          <SubmitButton className="btn btn-coral w-full py-3.5 text-base">Simulate successful payment</SubmitButton>
        </form>
      </div>
    </div>
  );
}
