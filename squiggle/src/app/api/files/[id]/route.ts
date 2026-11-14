import fs from "node:fs";
import { Readable } from "node:stream";
import { getUser, isAgentRequest } from "@/lib/auth";
import { getFile, getQuote, getRequest, hasPaidStl } from "@/lib/data";
import { filePath } from "@/lib/storage";

/**
 * Serves an uploaded or generated file to whoever is allowed to see it:
 * staff and agents see everything; a customer sees their own request's files,
 * and the 3D model only after paying for the STL.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = getFile(id);
  if (!file) return new Response("Not found", { status: 404 });

  if (!isAgentRequest(req)) {
    const user = await getUser();
    if (!user) return new Response("Not found", { status: 404 });
    if (user.role !== "admin") {
      const request = getRequest(file.request_id);
      if (request?.user_id !== user.id) return new Response("Not found", { status: 404 });
      if (file.quote_id && getQuote(file.quote_id)?.status !== "sent") return new Response("Not found", { status: 404 });
      if (file.kind === "model" && !hasPaidStl(file.request_id)) return new Response("Payment required", { status: 402 });
    }
  }

  const path = filePath(file.id);
  if (!fs.existsSync(path)) return new Response("Not found", { status: 404 });

  const inline = file.mime.startsWith("image/") || file.mime.startsWith("video/");
  const headers: Record<string, string> = {
    "Content-Type": file.mime,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.filename.replace(/"/g, "")}"`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
  };

  // Byte ranges, so the turntable video plays and scrubs in every browser.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? parseInt(range[1], 10) : file.size - parseInt(range[2], 10);
    let end = range[1] && range[2] ? parseInt(range[2], 10) : file.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, file.size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(path, { start, end })) as ReadableStream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${file.size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(path)) as ReadableStream, {
    headers: { ...headers, "Content-Length": String(file.size) },
  });
}
