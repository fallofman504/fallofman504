import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderForm } from "@/components/order-form";
import { requireUser } from "@/lib/auth";
import { getRequest, latestQuote, listOrders } from "@/lib/data";

export const metadata = { title: "Order your print" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/requests/${id}/order`);
  const request = getRequest(id);
  if (!request || request.user_id !== user.id) notFound();
  const quote = latestQuote(id);
  const hasPrintOrder = listOrders(id).some((o) => o.type === "print" && o.status !== "cancelled" && o.status !== "awaiting_payment");
  if (!quote || quote.print_total_cents == null || hasPrintOrder || request.status === "closed") redirect(`/requests/${id}`);

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link href={`/requests/${id}`} className="text-sm font-semibold text-muted hover:text-ink">← {request.title}</Link>
      <h1 className="mt-3 mb-8 text-4xl font-extrabold">Order your print</h1>
      <OrderForm
        requestId={id}
        printTotal={quote.print_total_cents}
        fees={{ pickup: 0, delivery: quote.delivery_cents, shipping: quote.shipping_cents }}
        defaults={{ name: user.name, phone: user.phone ?? "" }}
      />
    </div>
  );
}
