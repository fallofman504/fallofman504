import "server-only";
import Stripe from "stripe";
import { db } from "./db";
import { sendEmail } from "./email";
import { getOrder, updateOrder, type Order } from "./orders";
import { money, quote, serviceTitle } from "./pricing";

let stripeClient: Stripe | null = null;
export function stripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return (stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY));
}

/** Simulated checkout is for development only; production must have Stripe configured. */
export function mockPaymentsAllowed(): boolean {
  if (process.env.STRIPE_SECRET_KEY) return false;
  return process.env.NODE_ENV !== "production" || process.env.PEERLESS_MOCK_PAYMENTS === "1";
}

export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
export const orderUrl = (order: Order) => `${appUrl()}/o/${order.token}`;

/** Returns the URL the customer should be sent to in order to pay. */
export async function startCheckout(order: Order): Promise<string> {
  const s = stripe();
  if (!s) {
    if (!mockPaymentsAllowed()) throw new Error("Payments aren't configured yet. Please contact Peerless Plans.");
    return `/dev/pay/${order.token}`;
  }
  if (order.stripe_session_id) {
    // Reuse a checkout the customer already opened rather than creating duplicates.
    const existing = await s.checkout.sessions.retrieve(order.stripe_session_id);
    if (existing.status === "open" && existing.url && existing.amount_total === order.price_cents) return existing.url;
  }
  const session = await s.checkout.sessions.create({
    mode: "payment",
    customer_email: order.email,
    client_reference_id: order.id,
    metadata: { order_id: order.id, order_ref: order.ref },
    payment_intent_data: { metadata: { order_id: order.id, order_ref: order.ref } },
    line_items: quote(order.service, order.details).lines.map((l) => ({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: l.cents,
        product_data: { name: l.label, description: `Peerless Plans job ${order.ref} · ${order.details.building}, ${order.details.suite}` },
      },
    })),
    success_url: `${appUrl()}/pay/return?order=${order.token}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: orderUrl(order),
  });
  updateOrder(order.id, { stripe_session_id: session.id });
  return session.url!;
}

/** Idempotent: marks an order paid and puts it in the sign-off queue. Safe to call from both the webhook and the return page. */
export function markPaid(orderId: string, via: { method: "stripe" | "mock"; paymentIntent?: string | null }) {
  let paid: Order | null = null;
  db().transaction(() => {
    const order = getOrder(orderId);
    if (!order || order.status !== "preview_ready") return;
    updateOrder(order.id, { status: "paid", pay_method: via.method, stripe_payment_intent: via.paymentIntent ?? null, paid_at: Date.now() });
    paid = getOrder(orderId);
  })();
  const order = paid as Order | null;
  if (!order) return;
  const q = quote(order.service, order.details);
  void sendEmail({
    to: order.email,
    subject: `Payment received for ${order.ref}`,
    text: `Thank you. We received ${money(order.price_cents)} for your ${serviceTitle(order.service, order.details).toLowerCase()} (${order.ref}).\n\nA person now checks and signs the sheet. Turnaround: ${q.turnaround.toLowerCase()}. We will email you when your files are ready.\n\nYour order page: ${orderUrl(order)}\n\nPeerless Plans`,
  });
  if (process.env.ADMIN_EMAIL) {
    void sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `Sign-off needed: ${order.ref} (${q.turnaround.toLowerCase()})`,
      text: `${order.ref} is paid (${money(order.price_cents)}) and waiting for your sign-off.\n\n${appUrl()}/admin/orders/${order.id}`,
    });
  }
}

/** Checks a Stripe Checkout Session and records the payment if it has been paid. */
export async function syncStripeSession(sessionId: string): Promise<void> {
  const s = stripe();
  if (!s) return;
  recordSession(await s.checkout.sessions.retrieve(sessionId));
}

export function recordSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id;
  if (!orderId || session.payment_status !== "paid") return;
  const order = getOrder(orderId);
  // Sessions only come from our own Stripe account; still require the amount we asked for.
  if (!order || session.amount_total !== order.price_cents) return;
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  markPaid(orderId, { method: "stripe", paymentIntent: pi });
}
