"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  clearLoginFailures, createPasswordReset, endSession, hashPassword, loginPauseMinutes, LOGIN_PAUSE_MINUTES, MAX_LOGIN_FAILS,
  recordLoginFailure, requireAdmin, requireUser, RESET_LINK_MINUTES, resetPassword, roleForEmail, safeNext, startSession, verifyPassword,
} from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import * as data from "@/lib/data";
import { appUrl, markPaid, mockPaymentsAllowed, startCheckout } from "@/lib/payments";
import type { Address, Fulfillment, Order, User } from "@/lib/types";

export type FormState = { error?: string; notice?: string } | undefined;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// ---------- accounts ----------
export async function signup(_: FormState, fd: FormData): Promise<FormState> {
  const name = str(fd, "name"), email = str(fd, "email").toLowerCase(), phone = str(fd, "phone"), password = String(fd.get("password") ?? "");
  if (!name) return { error: "Please tell us your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (data.findUserByEmail(email)) return { error: "There's already an account with that email. Try logging in." };
  const id = data.createUser({ email, name, phone: phone || null, password_hash: hashPassword(password), role: roleForEmail(email) });
  await startSession(id);
  redirect(safeNext(fd.get("next")));
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase(), password = String(fd.get("password") ?? "");
  const paused = loginPauseMinutes(email);
  if (paused) return { error: `Too many failed attempts. Login is paused for ${paused} more minute${paused === 1 ? "" : "s"}. You can reset your password below.` };
  const user = data.findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    const fails = recordLoginFailure(email);
    if (fails >= MAX_LOGIN_FAILS) return { error: `Too many failed attempts. Login is paused for ${LOGIN_PAUSE_MINUTES} minutes. You can reset your password below.` };
    if (fails === MAX_LOGIN_FAILS - 1) return { error: `Wrong email or password. One more failed attempt will pause login for ${LOGIN_PAUSE_MINUTES} minutes.` };
    return { error: "Wrong email or password." };
  }
  clearLoginFailures(email);
  const role = roleForEmail(email);
  if (role === "admin" && user.role !== "admin") data.setUserRole(user.id, "admin");
  await startSession(user.id);
  const next = safeNext(fd.get("next"));
  redirect(role === "admin" && next === "/dashboard" ? "/admin" : next);
}

export async function requestPasswordReset(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right." };
  const user = data.findUserByEmail(email);
  const token = user && createPasswordReset(user.id);
  if (user && token) {
    const link = `${appUrl()}/reset-password?token=${token}`;
    await sendEmail({
      to: user.email,
      subject: "Reset your Squiggle password",
      text: `Hi ${user.name},\n\nUse this link to choose a new password. It works once and expires in ${RESET_LINK_MINUTES} minutes:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email — your password hasn't changed.\n\n— Squiggle`,
    });
  }
  // Same answer whether or not the account exists, so this form can't be used to find out who has one.
  return { notice: `If there's an account for ${email}, a reset link is on its way. It expires in ${RESET_LINK_MINUTES} minutes.` };
}

export async function choosePassword(_: FormState, fd: FormData): Promise<FormState> {
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "Those passwords don't match." };
  if (!resetPassword(str(fd, "token"), password)) return { error: "This reset link has expired or was already used. Request a new one." };
  redirect("/login?reset=1");
}

export async function logout() {
  await endSession();
  redirect("/");
}

// ---------- shared guards ----------
function ownedRequest(user: User, requestId: string) {
  const request = data.getRequest(requestId);
  if (!request || (request.user_id !== user.id && user.role !== "admin")) redirect("/dashboard");
  return request;
}
function ownedOrder(user: User, orderId: string): Order {
  const order = data.getOrder(orderId);
  if (!order || order.user_id !== user.id) redirect("/dashboard");
  return order;
}

// ---------- conversation ----------
export async function sendMessage(requestId: string, fd: FormData) {
  const user = await requireUser();
  const request = ownedRequest(user, requestId);
  const body = str(fd, "body").slice(0, 4000);
  if (body) data.addMessage({ request_id: request.id, sender: user.role === "admin" ? "squiggle" : "customer", body });
  revalidatePath(`/requests/${request.id}`);
  revalidatePath(`/admin/requests/${request.id}`);
}

// ---------- ordering ----------
export async function placeOrder(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const request = data.getRequest(str(fd, "requestId"));
  if (!request || request.user_id !== user.id) redirect("/dashboard");
  const quote = data.latestQuote(request.id);
  if (!quote) return { error: "This request hasn't been quoted yet." };
  const type = str(fd, "type") === "stl" ? "stl" : "print";

  let fulfillment: Fulfillment | undefined;
  let address: Address | null = null;
  if (type === "print") {
    const f = str(fd, "fulfillment");
    if (f !== "pickup" && f !== "delivery" && f !== "shipping") return { error: "Choose pickup, delivery, or shipping." };
    fulfillment = f;
    if (data.fulfillmentFee(quote, f) == null) return { error: "That option isn't available for this quote." };
    if (f !== "pickup") {
      address = { name: str(fd, "name"), line1: str(fd, "line1"), line2: str(fd, "line2"), city: str(fd, "city"), state: str(fd, "state").toUpperCase(), zip: str(fd, "zip"), phone: str(fd, "phone") };
      if (!address.name || !address.line1 || !address.city) return { error: "Please fill in the full address." };
      if (!/^[A-Z]{2}$/.test(address.state)) return { error: "Use the 2-letter state code (e.g. TX)." };
      if (!/^\d{5}(-\d{4})?$/.test(address.zip)) return { error: "ZIP code should be 5 digits." };
      if (f === "delivery" && address.state !== "TX") return { error: "Local delivery is only available in the Houston, TX area." };
    }
  }

  // One order per type per request. Replace an unpaid attempt; never duplicate a paid one.
  for (const existing of data.listOrders(request.id).filter((o) => o.type === type && o.status !== "cancelled")) {
    if (existing.status !== "awaiting_payment") redirect(`/requests/${request.id}`);
    data.deleteOrder(existing.id);
  }

  let url: string;
  try {
    const order = data.createOrder({ request, quote, type, fulfillment, address });
    const payment = data.createPayment(order.id, type === "stl" ? "full" : "deposit", type === "stl" ? order.total_cents : order.deposit_cents);
    url = await startCheckout(payment, user);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong starting checkout." };
  }
  redirect(url);
}

/** Continue an unpaid first payment, or pay the remaining balance on a print order. */
export async function payOrder(orderId: string) {
  const user = await requireUser();
  const order = ownedOrder(user, orderId);
  const payments = data.listPayments(order.id);
  let payment = payments.find((p) => p.status === "pending");
  if (!payment) {
    const due = order.total_cents - data.paidAmount(order.id);
    if (order.type !== "print" || due <= 0 || order.status === "cancelled") redirect(`/requests/${order.request_id}`);
    payment = data.createPayment(order.id, "balance", due);
  }
  redirect(await startCheckout(payment, user));
}

export async function cancelUnpaidOrder(orderId: string) {
  const user = await requireUser();
  const order = ownedOrder(user, orderId);
  if (order.status === "awaiting_payment") data.deleteOrder(order.id);
  revalidatePath(`/requests/${order.request_id}`);
}

/** Development-only stand-in for Stripe Checkout. */
export async function mockPay(paymentId: string) {
  const user = await requireUser();
  if (!mockPaymentsAllowed()) redirect("/dashboard");
  const payment = data.getPayment(paymentId);
  if (!payment) redirect("/dashboard");
  const order = ownedOrder(user, payment.order_id);
  markPaid(payment.id, { method: "mock" });
  redirect(`/requests/${order.request_id}?paid=1`);
}

// ---------- admin ----------
export async function adminUpdateOrder(orderId: string, fd: FormData) {
  await requireAdmin();
  const order = data.getOrder(orderId);
  if (!order) return;
  const action = str(fd, "action");
  const due = order.total_cents - data.paidAmount(order.id);
  const say = (body: string) => data.addMessage({ request_id: order.request_id, sender: "system", body });

  if (action === "ready" && order.status === "in_production") {
    data.updateOrder(order.id, { status: "ready" });
    const handoff = order.fulfillment === "pickup" ? "ready for pickup" : order.fulfillment === "delivery" ? "ready for delivery" : "ready to ship";
    say(`Order ${order.ref} is printed and ${handoff}.${due > 0 ? " Please pay the remaining balance to complete your order." : ""}`);
  } else if (action === "record_balance" && due > 0 && order.status !== "awaiting_payment") {
    const pending = data.listPayments(order.id).find((p) => p.status === "pending" && p.kind === "balance");
    markPaid((pending ?? data.createPayment(order.id, "balance", due)).id, { method: "in_person" });
  } else if (action === "complete" && order.status === "ready" && due <= 0) {
    const tracking = str(fd, "tracking") || null;
    data.updateOrder(order.id, { status: "completed", tracking });
    say(
      order.fulfillment === "shipping"
        ? `Order ${order.ref} has shipped.${tracking ? ` Tracking: ${tracking}` : ""}`
        : order.fulfillment === "delivery"
          ? `Order ${order.ref} has been delivered. Enjoy!`
          : `Order ${order.ref} has been picked up. Enjoy!`,
    );
  }
  revalidatePath(`/admin/requests/${order.request_id}`);
}

export async function adminSetRequestStatus(requestId: string, status: "closed" | "submitted") {
  await requireAdmin();
  const request = data.getRequest(requestId);
  if (!request) return;
  // Reopening returns the request to wherever its history puts it.
  const reopened = data.listOrders(requestId).some((o) => o.status !== "awaiting_payment") ? "ordered" : data.latestQuote(requestId) ? "quoted" : "submitted";
  data.setRequestStatus(requestId, status === "closed" ? "closed" : reopened);
  revalidatePath(`/admin/requests/${requestId}`);
}
