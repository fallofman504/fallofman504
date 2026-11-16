import fs from "node:fs";
import { Readable } from "node:stream";
import { getFile, getOrder } from "@/lib/orders";
import { isStaff } from "@/lib/staff";
import { filePath } from "@/lib/storage";

/**
 * Serves a file to whoever is allowed to see it. Staff and agents see everything.
 * A customer, identified by their order link's token (?t=), sees their own reference files and
 * the watermarked preview, and the final files only once the order is signed and released.
 * The full unchecked draft never goes to a customer.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const file = getFile((await params).id);
  if (!file) return new Response("Not found", { status: 404 });

  if (!(await isStaff(req))) {
    const order = getOrder(file.order_id);
    const token = new URL(req.url).searchParams.get("t");
    if (!order || !token || token !== order.token) return new Response("Not found", { status: 404 });
    if (file.kind === "draft") return new Response("Not found", { status: 404 });
    if (file.kind === "deliverable" && order.status !== "delivered") return new Response("Not available yet", { status: 403 });
  }

  const path = filePath(file.id);
  if (!fs.existsSync(path)) return new Response("Not found", { status: 404 });
  const inline = file.mime.startsWith("image/");
  return new Response(Readable.toWeb(fs.createReadStream(path)) as ReadableStream, {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.filename.replace(/"/g, "")}"`,
      "Content-Length": String(file.size),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
