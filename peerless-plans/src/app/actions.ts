"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email";
import { addLead, getOrder, getOrderByToken, listFiles, updateOrder } from "@/lib/orders";
import { appUrl, markPaid, mockPaymentsAllowed, orderUrl, startCheckout } from "@/lib/payments";
import { serviceTitle } from "@/lib/pricing";
import { ADMIN_COOKIE, adminPasscode, adminToken, isAdmin, passcodeMatches } from "@/lib/staff";

export type FormState = { error?: string; ok?: string } | null;

export async function buyOrder(token: string, _prev: FormState, form: FormData): Promise<FormState> {
  const order = getOrderByToken(token);
  if (!order || order.status !== "preview_ready") return { error: "This order isn't ready to buy. Refresh the page." };
  if (form.get("concept") !== "on") return { error: "Tick the box above to continue." };
  let url: string;
  try {
    url = await startCheckout(order);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Checkout could not be started. Try again." };
  }
  redirect(url);
}

export async function cancelOrder(token: string) {
  const order = getOrderByToken(token);
  if (order && (order.status === "drafting" || order.status === "preview_ready")) updateOrder(order.id, { status: "cancelled" });
  redirect("/order");
}

/** Development only: stands in for Stripe when no key is configured. */
export async function mockPay(token: string) {
  const order = getOrderByToken(token);
  if (!order || !mockPaymentsAllowed()) redirect("/");
  markPaid(order.id, { method: "mock" });
  redirect(`/o/${order.token}`);
}

export async function requestSnapshot(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const email = String(form.get("email") ?? "").trim().slice(0, 200);
  const building = String(form.get("building") ?? "").trim().slice(0, 200);
  const sf = Math.round(Number(form.get("sf")));
  if (!name || !building || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please add your name, a valid email, and the building." };
  addLead({ name, email, building, sf: sf > 0 ? sf : null });
  if (process.env.ADMIN_EMAIL) {
    void sendEmail({ to: process.env.ADMIN_EMAIL, subject: `Snapshot request: ${building}`, text: `${name} <${email}>\n${building}${sf > 0 ? `\n${sf.toLocaleString("en-US")} SF` : ""}\n\n${appUrl()}/admin` });
  }
  return { ok: "Thanks. We will email you to collect the plans and the rent roll." };
}

export async function adminLogin(_prev: FormState, form: FormData): Promise<FormState> {
  const passcode = adminPasscode();
  if (!passcode) return { error: "Set ADMIN_PASSCODE in the site's settings to turn on the review queue." };
  if (!passcodeMatches(String(form.get("passcode") ?? ""))) return { error: "That passcode isn't right." };
  (await cookies()).set(ADMIN_COOKIE, adminToken(passcode), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  redirect("/admin");
}

export async function adminLogout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

/** The founder's sign-off. Only this releases final files to the customer. */
export async function signOff(orderId: string, _prev: FormState, form: FormData): Promise<FormState> {
  if (!(await isAdmin())) return { error: "Sign in again." };
  const order = getOrder(orderId);
  if (!order) return { error: "Order not found." };
  if (order.status !== "paid") return { error: "Only a paid order can be signed and released." };
  if (!listFiles(order.id, "deliverable").length) return { error: "Add the final files before signing." };
  const name = String(form.get("signed_by") ?? "").trim().slice(0, 80);
  if (!name) return { error: "Add your name as it appears in the title block." };
  if (form.get("checked") !== "on") return { error: "Tick the box to confirm you checked the sheet." };
  updateOrder(order.id, { status: "delivered", signed_by: name, delivered_at: Date.now() });
  void sendEmail({
    to: order.email,
    subject: `Your drawing is ready (${order.ref})`,
    text: `Your ${serviceTitle(order.service, order.details).toLowerCase()} for ${order.details.building}, ${order.details.suite} has been checked and signed by ${name}.\n\nDownload your files here:\n${orderUrl(order)}\n\nPeerless Plans`,
  });
  revalidatePath(`/admin/orders/${order.id}`);
  return { ok: "Signed and released." };
}
