import "server-only";
import { sendEmail } from "./email";
import { getOrder, listFiles, updateOrder, type Order } from "./orders";
import { money, serviceTitle } from "./pricing";
import { orderUrl } from "./payments";
import { checkUpload, deleteFiles, deleteKind, saveBuffer, saveUpload, UploadError } from "./storage";
import { makePreview } from "./watermark";

/** Stores the full draft sheet (staff only), builds the watermarked preview from it, and tells the customer. */
export async function setPreview(order: Order, sheet: File) {
  if (order.status !== "drafting" && order.status !== "preview_ready") throw new UploadError("This order is no longer waiting for a preview.");
  checkUpload(sheet, "draft");
  const buf = Buffer.from(await sheet.arrayBuffer());
  let preview: Buffer;
  try {
    preview = await makePreview(buf);
  } catch {
    throw new UploadError(`"${sheet.name}" could not be read as an image. Send the sheet as a PNG or JPG.`);
  }
  deleteKind(order.id, "draft");
  deleteKind(order.id, "preview");
  await saveBuffer(buf, sheet.name, { orderId: order.id, kind: "draft" });
  await saveBuffer(preview, `${order.ref}-preview.jpg`, { orderId: order.id, kind: "preview" });
  const first = order.status === "drafting";
  updateOrder(order.id, { status: "preview_ready", preview_at: Date.now() });
  if (first) {
    void sendEmail({
      to: order.email,
      subject: `Your preview is ready (${order.ref})`,
      text: `The preview of your ${serviceTitle(order.service, order.details).toLowerCase()} for ${order.details.building}, ${order.details.suite} is ready.\n\nSee it and your price (${money(order.price_cents)}) here:\n${orderUrl(order)}\n\nFrom that page you can buy the drawing, adjust your request, or start over.\n\nPeerless Plans`,
    });
  }
}

/** Adds final files to a job. A file with the same name replaces the earlier one. Nothing reaches the customer until sign-off. */
export async function addDeliverables(order: Order, files: File[]) {
  if (order.status === "cancelled") throw new UploadError("This order was cancelled.");
  if (order.status === "delivered") throw new UploadError("This order has already been signed and released.");
  if (!files.length) throw new UploadError("No files were sent.");
  for (const f of files) checkUpload(f, "deliverable");
  const existing = listFiles(order.id, "deliverable");
  for (const f of files) {
    const saved = await saveUpload(f, { orderId: order.id, kind: "deliverable" });
    deleteFiles(existing.filter((e) => e.filename === saved.filename));
  }
  return getOrder(order.id)!;
}
