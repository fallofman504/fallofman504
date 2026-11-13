import "server-only";
import Stripe from "stripe";
import { db } from "./db";
import { addMessage, getOrder, getPayment, getRequest, setRequestStatus, setStripeSession, updateOrder } from "./data";
import { money } from "./format";
import type { Payment, User } from "./types";

let stripeClient: Stripe | null = null;
export function stripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return (stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY));
}

/** Simulated checkout is for development only; production must have Stripe configured. */
export function mockPaymentsAllowed(): boolean {
  if (process.env.STRIPE_SECRET_KEY) return false;
  return process.env.NODE_ENV !== "production" || process.env.SQUIGGLE_MOCK_PAYMENTS === "1";
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

const KIND_LABEL = { full: "3D model file (STL)", deposit: "50% deposit", balance: "Remaining balance" } as const;

/** Returns the URL the customer should be sent to in order to pay. */
export async function startCheckout(payment: Payment, user: User): Promise<string> {
  const order = getOrder(payment.order_id)!;
  const request = getRequest(order.request_id)!;
  const s = stripe();
  if (!s) {
    if (!mockPaymentsAllowed()) throw new Error("Payments aren't configured yet. Please contact Squiggle.");
    return `/dev/pay/${payment.id}`;
  }
  if (payment.stripe_session_id) {
    // Reuse a checkout the customer already opened rather than creating duplicates.
    const existing = await s.checkout.sessions.retrieve(payment.stripe_session_id);
    if (existing.status === "open" && existing.url) return existing.url;
  }
  const session = await s.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    client_reference_id: payment.id,
    metadata: { payment_id: payment.id, order_ref: order.ref, request_ref: request.ref },
    payment_intent_data: { metadata: { payment_id: payment.id, order_ref: order.ref } },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: payment.amount_cents,
          product_data: { name: `${request.title} — ${KIND_LABEL[payment.kind]}`, description: `Squiggle order ${order.ref}` },
        },
      },
    ],
    success_url: `${appUrl()}/pay/return?payment=${payment.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/requests/${request.id}`,
  });
  setStripeSession(payment.id, session.id);
  return session.url!;
}

/** Idempotent: marks a payment paid and advances the order. Safe to call from both the webhook and the return page. */
export function markPaid(paymentId: string, via: { method: "stripe" | "mock" | "in_person"; paymentIntent?: string | null }) {
  db().transaction(() => {
    const payment = getPayment(paymentId);
    if (!payment || payment.status === "paid") return;
    db()
      .prepare("UPDATE payments SET status = 'paid', method = ?, stripe_payment_intent = ?, paid_at = ? WHERE id = ?")
      .run(via.method, via.paymentIntent ?? null, Date.now(), paymentId);
    const order = getOrder(payment.order_id)!;
    const where = via.method === "in_person" ? " in person" : "";
    if (payment.kind === "full") {
      updateOrder(order.id, { status: "completed" });
      addMessage({ request_id: order.request_id, sender: "system", body: `Payment of ${money(payment.amount_cents)} received. Your STL is ready to download.` });
    } else if (payment.kind === "deposit") {
      updateOrder(order.id, { status: "in_production" });
      addMessage({ request_id: order.request_id, sender: "system", body: `Deposit of ${money(payment.amount_cents)} received — order ${order.ref} is in the print queue.` });
    } else {
      updateOrder(order.id, {});
      addMessage({ request_id: order.request_id, sender: "system", body: `Balance of ${money(payment.amount_cents)} received${where}. Order ${order.ref} is paid in full.` });
    }
    setRequestStatus(order.request_id, "ordered");
  })();
}

/** Checks a Stripe Checkout Session and records the payment if it has been paid. */
export async function syncStripeSession(sessionId: string): Promise<void> {
  const s = stripe();
  if (!s) return;
  const session = await s.checkout.sessions.retrieve(sessionId);
  recordSession(session);
}

export function recordSession(session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.payment_id;
  if (!paymentId || session.payment_status !== "paid") return;
  const payment = getPayment(paymentId);
  // Sessions only come from our own Stripe account; still require the amount we asked for.
  if (!payment || session.amount_total !== payment.amount_cents) return;
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  markPaid(paymentId, { method: "stripe", paymentIntent: pi });
}
