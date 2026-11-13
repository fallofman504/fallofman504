import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getOrder, getPayment } from "@/lib/data";
import { syncStripeSession } from "@/lib/payments";

/** Where Stripe sends the customer after checkout. Confirms the payment, then returns them to their project. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const payment = getPayment(url.searchParams.get("payment") ?? "");
  const order = payment && getOrder(payment.order_id);
  const user = await getUser();
  if (!payment || !order || order.user_id !== user?.id) redirect("/dashboard");
  const sessionId = url.searchParams.get("session_id") ?? payment.stripe_session_id;
  if (sessionId && payment.status !== "paid") await syncStripeSession(sessionId).catch(() => {});
  redirect(`/requests/${order.request_id}`);
}
