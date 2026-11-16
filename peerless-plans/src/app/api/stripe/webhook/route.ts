import { recordSession, stripe } from "@/lib/payments";

/** Stripe calls this when a checkout completes, so payments are recorded even if the customer closes the tab. */
export async function POST(req: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return new Response("Stripe is not configured", { status: 503 });

  let event;
  try {
    event = s.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    recordSession(event.data.object);
  }
  return Response.json({ received: true });
}
