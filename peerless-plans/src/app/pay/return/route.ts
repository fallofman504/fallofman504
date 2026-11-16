import { redirect } from "next/navigation";
import { getOrderByToken } from "@/lib/orders";
import { syncStripeSession } from "@/lib/payments";

/** Where Stripe sends the customer after checkout. Confirms the payment, then returns them to their order page. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const order = getOrderByToken(url.searchParams.get("order") ?? "");
  if (!order) redirect("/");
  // Only this order's own checkout session counts, whatever the link says.
  if (order.stripe_session_id && order.status === "preview_ready") await syncStripeSession(order.stripe_session_id).catch(() => {});
  redirect(`/o/${order.token}`);
}
