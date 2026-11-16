import { notFound, redirect } from "next/navigation";
import { OrderForm } from "@/components/order-form";
import { getOrderByToken, listFiles } from "@/lib/orders";
import { REFERENCE_ACCEPT } from "@/lib/storage";

export const metadata = { title: "Adjust your request", robots: { index: false } };

export default async function EditOrder({ params }: { params: Promise<{ token: string }> }) {
  const order = getOrderByToken((await params).token);
  if (!order) notFound();
  if (order.status !== "drafting" && order.status !== "preview_ready") redirect(`/o/${order.token}`);
  return (
    <main className="order">
      <div className="wrap">
        <p className="eyebrow">Adjusting {order.ref}</p>
        <OrderForm
          accept={REFERENCE_ACCEPT}
          editing={{ token: order.token, service: order.service, details: order.details, email: order.email, keptFiles: listFiles(order.id, "reference").map((f) => f.filename) }}
        />
      </div>
    </main>
  );
}
