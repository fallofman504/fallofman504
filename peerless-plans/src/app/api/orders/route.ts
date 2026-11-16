import { sendEmail } from "@/lib/email";
import { createOrder, getOrderByToken, listFiles, updateOrder } from "@/lib/orders";
import { orderUrl } from "@/lib/payments";
import { detailsProblem, isService, money, quote, readDetails, referenceProblem, serviceTitle } from "@/lib/pricing";
import { checkUpload, deleteKind, formFiles, MAX_REFERENCE_FILES, saveUpload, UploadError } from "@/lib/storage";

const bad = (error: string) => Response.json({ error }, { status: 400 });

/**
 * Places a new order, or, when a token is sent, adjusts one that hasn't been paid for.
 * The price is always worked out here from the published list, never taken from the browser.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("That upload could not be read. Try again with smaller files.");
  }
  const service = form.get("service");
  if (!isService(service)) return bad("Choose the drawing you need.");
  const details = readDetails((k) => form.get(k));
  const email = String(form.get("email") ?? "").trim().slice(0, 200);
  const files = formFiles(form, "files");

  const token = String(form.get("token") ?? "");
  const existing = token ? getOrderByToken(token) : null;
  if (token && !existing) return bad("That order could not be found.");
  if (existing && existing.status !== "drafting" && existing.status !== "preview_ready") return bad("This order can no longer be changed.");
  const kept = existing ? listFiles(existing.id, "reference").length : 0;

  const problem = detailsProblem(service, details) ?? referenceProblem(files.length + kept, details);
  if (problem) return bad(problem);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Add a valid email so we can send your preview.");
  if (files.length + kept > MAX_REFERENCE_FILES) return bad(`Send up to ${MAX_REFERENCE_FILES} files per order.`);
  if (files.reduce((a, f) => a + f.size, 0) > 90 * 1024 * 1024) return bad("Those files total more than 90 MB. Send the most useful ones; we will ask if we need more.");
  try {
    for (const f of files) checkUpload(f, "reference");
  } catch (e) {
    if (e instanceof UploadError) return bad(e.message);
    throw e;
  }

  const priceCents = quote(service, details).totalCents;
  let order;
  if (existing) {
    // A changed request needs a new draft, so the old preview and files go.
    deleteKind(existing.id, "preview");
    deleteKind(existing.id, "draft");
    deleteKind(existing.id, "deliverable");
    updateOrder(existing.id, { service, details, email, price_cents: priceCents, status: "drafting", preview_at: null, stripe_session_id: null });
    order = existing;
  } else {
    order = createOrder({ service, details, email, priceCents });
    void sendEmail({
      to: email,
      subject: `We have your request (${order.ref})`,
      text: `We received your request for a ${serviceTitle(service, details).toLowerCase()} at ${details.building}, ${details.suite}.\n\nPrice: ${money(priceCents)}. You pay nothing until you have seen the preview.\n\nWe will email you when the preview is ready. You can also check here:\n${orderUrl(order)}\n\nPeerless Plans`,
    });
  }
  for (const f of files) await saveUpload(f, { orderId: order.id, kind: "reference" });
  if (process.env.ADMIN_EMAIL && !existing) {
    void sendEmail({ to: process.env.ADMIN_EMAIL, subject: `New order ${order.ref}: ${serviceTitle(service, details)}`, text: `${details.building}, ${details.suite}\n${money(priceCents)}\n${email}` });
  }
  return Response.json({ url: `/o/${order.token}` });
}
