import { isStaff, unauthorized } from "@/lib/agent-api";
import { createQuote, getRequest, newQuoteId } from "@/lib/data";
import { checkUpload, saveUpload, UploadError } from "@/lib/storage";
import type { LineItem } from "@/lib/types";

const bad = (error: string) => Response.json({ error }, { status: 400 });

function cents(fd: FormData, key: string): number | null | "invalid" {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 10_000_000 ? n : "invalid";
}

/**
 * POST multipart/form-data — deliver the quote for a request.
 *   items            JSON [{ "label": "Material (PLA, 180g)", "amount_cents": 1400 }, ...]  (print price breakdown)
 *   stl_price_cents  price to buy just the model file (omit if not offered)
 *   shipping_cents   shipping fee (omit if shipping isn't offered)
 *   delivery_cents   Houston local delivery fee (omit if not offered)
 *   lead_time_days   estimated production days
 *   note             message shown to the customer with the quote
 *   turntable        mp4/webm turntable video        render   png/jpg/webp render
 *   model            stl/3mf/obj — released to the customer only after they pay for the STL
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isStaff(req))) return unauthorized();
  const request = getRequest((await params).id);
  if (!request) return Response.json({ error: "Not found" }, { status: 404 });
  if (request.status === "closed") return bad("This request is closed.");

  const fd = await req.formData();
  let items: LineItem[];
  try {
    const parsed: unknown = JSON.parse(String(fd.get("items") || "[]"));
    if (!Array.isArray(parsed)) throw new Error();
    items = parsed.map((i) => ({ label: String(i.label ?? "").trim().slice(0, 120), amount_cents: Number(i.amount_cents) }));
  } catch {
    return bad("items must be a JSON array of { label, amount_cents }.");
  }
  if (items.some((i) => !i.label || !Number.isInteger(i.amount_cents) || i.amount_cents < 0)) {
    return bad("Each item needs a label and a whole-number amount_cents of 0 or more.");
  }

  const stl = cents(fd, "stl_price_cents"), shipping = cents(fd, "shipping_cents"), delivery = cents(fd, "delivery_cents");
  if (stl === "invalid" || shipping === "invalid" || delivery === "invalid") return bad("Prices must be whole numbers of cents.");
  const printTotal = items.reduce((s, i) => s + i.amount_cents, 0);
  if (items.length && printTotal < 50) return bad("Print total must be at least $0.50.");
  if (stl != null && stl < 50) return bad("STL price must be at least $0.50.");
  if (request.kind === "print_only" && stl != null) return bad("This customer supplied their own model, so there's no STL to sell. Send a print price breakdown only.");
  if (!items.length && stl == null) return bad("A quote needs a print price breakdown, an STL price, or both.");

  const leadRaw = String(fd.get("lead_time_days") ?? "").trim();
  const lead = leadRaw ? Number(leadRaw) : null;
  if (lead != null && (!Number.isInteger(lead) || lead < 0 || lead > 365)) return bad("lead_time_days must be a whole number.");

  const uploads = (["turntable", "render", "model"] as const).flatMap((kind) => {
    const f = fd.get(kind);
    return f instanceof File && f.size > 0 ? [{ kind, file: f }] : [];
  });
  if (stl != null && !uploads.some((u) => u.kind === "model")) return bad("Attach the model file when offering an STL price.");

  const quoteId = newQuoteId();
  try {
    uploads.forEach((u) => checkUpload(u.file, u.kind));
    const quote = createQuote(quoteId, request.id, {
      items,
      stl_price_cents: stl,
      shipping_cents: shipping,
      delivery_cents: delivery,
      lead_time_days: lead,
      note: String(fd.get("note") ?? "").trim().slice(0, 4000),
    });
    for (const u of uploads) await saveUpload(u.file, { requestId: request.id, kind: u.kind, quoteId });
    return Response.json({ quote });
  } catch (e) {
    if (e instanceof UploadError) return bad(e.message);
    throw e;
  }
}
