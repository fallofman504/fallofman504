import "server-only";
import crypto from "node:crypto";
import { db } from "./db";
import type { OrderDetails, Service } from "./pricing";

/**
 * drafting       submitted; the agents are preparing the preview
 * preview_ready  the watermarked preview and price are waiting for the customer
 * paid           paid; waiting for the founder to check and sign the sheet
 * delivered      signed and released; the customer can download the files
 * cancelled      the customer started over before paying
 */
export type OrderStatus = "drafting" | "preview_ready" | "paid" | "delivered" | "cancelled";
/** reference: sent by the customer. draft: the full unchecked sheet (staff only). preview: watermarked crop. deliverable: final files. */
export type FileKind = "reference" | "draft" | "preview" | "deliverable";

export interface Order {
  id: string;
  ref: string;
  token: string;
  service: Service;
  details: OrderDetails;
  email: string;
  price_cents: number;
  status: OrderStatus;
  pay_method: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  signed_by: string | null;
  created_at: number;
  updated_at: number;
  preview_at: number | null;
  paid_at: number | null;
  delivered_at: number | null;
}
export interface FileRow {
  id: string;
  order_id: string;
  kind: FileKind;
  filename: string;
  mime: string;
  size: number;
  created_at: number;
}
export interface Lead {
  id: string;
  name: string;
  email: string;
  building: string;
  sf: number | null;
  created_at: number;
}

type Raw = Omit<Order, "details"> & { details_json: string };
const hydrate = (r: Raw | undefined): Order | null => {
  if (!r) return null;
  const { details_json, ...rest } = r;
  return { ...rest, details: JSON.parse(details_json) };
};

export const getOrder = (id: string) => hydrate(db().prepare("SELECT * FROM orders WHERE id = ?").get(id) as Raw | undefined);
export const getOrderByToken = (token: string) =>
  hydrate(db().prepare("SELECT * FROM orders WHERE token = ?").get(token) as Raw | undefined);

export function listOrders(status?: OrderStatus): Order[] {
  const rows = status
    ? db().prepare("SELECT * FROM orders WHERE status = ? ORDER BY created_at").all(status)
    : db().prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500").all();
  return (rows as Raw[]).map((r) => hydrate(r)!);
}

/** Job IDs follow the studio's job log: PP-YYMM-###, counted within the month. */
function nextRef(now: Date): string {
  const prefix = `PP-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}-`;
  const last = db().prepare("SELECT ref FROM orders WHERE ref LIKE ? ORDER BY ref DESC LIMIT 1").get(prefix + "%") as { ref: string } | undefined;
  const n = last ? parseInt(last.ref.slice(prefix.length), 10) + 1 : 1;
  return prefix + String(n).padStart(3, "0");
}

export function createOrder(input: { service: Service; details: OrderDetails; email: string; priceCents: number }): Order {
  const now = new Date();
  const id = crypto.randomUUID();
  db().transaction(() => {
    db()
      .prepare(
        `INSERT INTO orders (id, ref, token, service, details_json, email, price_cents, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'drafting', ?, ?)`,
      )
      .run(id, nextRef(now), crypto.randomBytes(24).toString("base64url"), input.service, JSON.stringify(input.details), input.email, input.priceCents, now.getTime(), now.getTime());
  })();
  return getOrder(id)!;
}

export function updateOrder(id: string, fields: Partial<Omit<Order, "id" | "ref" | "token" | "details">> & { details?: OrderDetails }) {
  const { details, ...rest } = fields;
  const set: Record<string, unknown> = { ...rest, updated_at: Date.now() };
  if (details) set.details_json = JSON.stringify(details);
  const cols = Object.keys(set);
  db()
    .prepare(`UPDATE orders SET ${cols.map((c) => `${c} = @${c}`).join(", ")} WHERE id = @id`)
    .run({ ...set, id });
}

export const getFile = (id: string) => db().prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRow | undefined;
export function listFiles(orderId: string, kind?: FileKind): FileRow[] {
  return (
    kind
      ? db().prepare("SELECT * FROM files WHERE order_id = ? AND kind = ? ORDER BY created_at").all(orderId, kind)
      : db().prepare("SELECT * FROM files WHERE order_id = ? ORDER BY created_at").all(orderId)
  ) as FileRow[];
}

export function addLead(input: { name: string; email: string; building: string; sf: number | null }) {
  db()
    .prepare("INSERT INTO leads (id, name, email, building, sf, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), input.name, input.email, input.building, input.sf, Date.now());
}
export const listLeads = () => db().prepare("SELECT * FROM leads ORDER BY created_at DESC LIMIT 200").all() as Lead[];
