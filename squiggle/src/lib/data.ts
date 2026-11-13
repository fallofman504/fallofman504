import "server-only";
import crypto from "node:crypto";
import { db } from "./db";
import type { PrintSpec } from "./print-options";
import type { Address, DesignRequest, FileRow, Fulfillment, Intent, LineItem, Message, Order, OrderType, Payment, Quote, RequestKind, User } from "./types";

const uid = () => crypto.randomUUID();
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ref = (prefix: string) =>
  `${prefix}-${Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join("")}`;

// ---------- users ----------
export function findUserByEmail(email: string) {
  return db().prepare("SELECT * FROM users WHERE email = ?").get(email) as (User & { password_hash: string }) | undefined;
}
export function findUser(id: string) {
  return db().prepare("SELECT id, email, name, phone, role FROM users WHERE id = ?").get(id) as User | undefined;
}
export function createUser(u: { email: string; name: string; phone: string | null; password_hash: string; role: string }): string {
  const id = uid();
  db()
    .prepare("INSERT INTO users (id, email, name, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, u.email, u.name, u.phone, u.password_hash, u.role, Date.now());
  return id;
}
export function setUserRole(id: string, role: string) {
  db().prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
}

// ---------- requests ----------
type RequestRow<T = DesignRequest> = Omit<T, "print_spec"> & { print_spec_json: string | null };
const toRequest = <T extends DesignRequest>({ print_spec_json, ...r }: RequestRow<T>) =>
  ({ ...r, print_spec: print_spec_json ? (JSON.parse(print_spec_json) as PrintSpec) : null }) as unknown as T;

export function createRequest(r: { user_id: string; title: string; prompt: string; intent: Intent; kind: RequestKind; print_spec: PrintSpec | null }): DesignRequest {
  const id = uid();
  db()
    .prepare("INSERT INTO requests (id, ref, user_id, title, prompt, intent, kind, print_spec_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)")
    .run(id, ref("SQ"), r.user_id, r.title, r.prompt, r.intent, r.kind, r.print_spec ? JSON.stringify(r.print_spec) : null, Date.now());
  return getRequest(id)!;
}
export function getRequest(id: string) {
  const row = db().prepare("SELECT * FROM requests WHERE id = ?").get(id) as RequestRow | undefined;
  return row && toRequest(row);
}
export function listRequestsForUser(userId: string) {
  return (db().prepare("SELECT * FROM requests WHERE user_id = ? ORDER BY created_at DESC").all(userId) as RequestRow[]).map(toRequest);
}
export type RequestWithCustomer = DesignRequest & { customer_name: string; customer_email: string };
export function listRequests(status?: string) {
  const sql = `SELECT r.*, u.name AS customer_name, u.email AS customer_email FROM requests r JOIN users u ON u.id = r.user_id`;
  return ((
    status
      ? db().prepare(`${sql} WHERE r.status = ? ORDER BY r.created_at ASC`).all(status)
      : db().prepare(`${sql} ORDER BY r.created_at DESC`).all()
  ) as RequestRow<RequestWithCustomer>[]).map(toRequest);
}
/** Minutes left on the one-hour quote promise (negative when overdue). */
export function quoteMinutesLeft(r: DesignRequest): number {
  return Math.round((r.created_at + 3600_000 - Date.now()) / 60_000);
}
export function setRequestStatus(id: string, status: string) {
  db().prepare("UPDATE requests SET status = ? WHERE id = ?").run(status, id);
}

// ---------- files ----------
export function getFile(id: string) {
  return db().prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRow | undefined;
}
export function listFiles(requestId: string) {
  return db().prepare("SELECT * FROM files WHERE request_id = ? ORDER BY created_at ASC").all(requestId) as FileRow[];
}

// ---------- messages ----------
export function addMessage(m: { request_id: string; sender: Message["sender"]; body: string; quote_id?: string }) {
  db()
    .prepare("INSERT INTO messages (id, request_id, sender, body, quote_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(uid(), m.request_id, m.sender, m.body, m.quote_id ?? null, Date.now());
}
export function listMessages(requestId: string) {
  return db().prepare("SELECT * FROM messages WHERE request_id = ? ORDER BY created_at ASC, rowid ASC").all(requestId) as Message[];
}

// ---------- quotes ----------
type QuoteRow = Omit<Quote, "items"> & { items_json: string };
const toQuote = ({ items_json, ...q }: QuoteRow): Quote => ({ ...q, items: JSON.parse(items_json) });

export type QuoteInput = {
  items: LineItem[];
  stl_price_cents: number | null;
  shipping_cents: number | null;
  delivery_cents: number | null;
  lead_time_days: number | null;
  note: string;
};

/** Reserve a quote id so its media files can be stored before the quote goes live. */
export const newQuoteId = uid;

export function createQuote(id: string, requestId: string, q: QuoteInput): Quote {
  const printTotal = q.items.length ? q.items.reduce((s, i) => s + i.amount_cents, 0) : null;
  const now = Date.now();
  db().transaction(() => {
    db()
      .prepare(
        `INSERT INTO quotes (id, request_id, items_json, print_total_cents, stl_price_cents, shipping_cents, delivery_cents, lead_time_days, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, requestId, JSON.stringify(q.items), printTotal, q.stl_price_cents, q.shipping_cents, q.delivery_cents, q.lead_time_days, q.note, now);
    db().prepare("UPDATE requests SET status = CASE WHEN status = 'submitted' THEN 'quoted' ELSE status END, quoted_at = COALESCE(quoted_at, ?) WHERE id = ?").run(now, requestId);
    addMessage({ request_id: requestId, sender: "squiggle", body: q.note || "Your quote is ready.", quote_id: id });
  })();
  return getQuote(id)!;
}
export function getQuote(id: string) {
  const row = db().prepare("SELECT * FROM quotes WHERE id = ?").get(id) as QuoteRow | undefined;
  return row && toQuote(row);
}
export function listQuotes(requestId: string) {
  return (db().prepare("SELECT * FROM quotes WHERE request_id = ? ORDER BY created_at ASC, rowid ASC").all(requestId) as QuoteRow[]).map(toQuote);
}
export function latestQuote(requestId: string) {
  return listQuotes(requestId).at(-1);
}

// ---------- orders ----------
type OrderRow = Omit<Order, "address"> & { address_json: string | null };
const toOrder = ({ address_json, ...o }: OrderRow): Order => ({ ...o, address: address_json ? JSON.parse(address_json) : null });

export function fulfillmentFee(quote: Quote, method: Fulfillment): number | null {
  if (method === "pickup") return 0;
  return method === "shipping" ? quote.shipping_cents : quote.delivery_cents;
}

export function createOrder(o: { request: DesignRequest; quote: Quote; type: OrderType; fulfillment?: Fulfillment; address?: Address | null }): Order {
  const id = uid();
  const now = Date.now();
  let subtotal: number, fee = 0, deposit = 0;
  if (o.type === "stl") {
    if (o.quote.stl_price_cents == null) throw new Error("This quote doesn't include an STL price.");
    subtotal = o.quote.stl_price_cents;
  } else {
    if (o.quote.print_total_cents == null) throw new Error("This quote doesn't include a print price.");
    const f = fulfillmentFee(o.quote, o.fulfillment!);
    if (f == null) throw new Error("That fulfillment option isn't available for this quote.");
    subtotal = o.quote.print_total_cents;
    fee = f;
    deposit = Math.ceil((subtotal + fee) / 2);
  }
  const total = subtotal + fee;
  db()
    .prepare(
      `INSERT INTO orders (id, ref, request_id, quote_id, user_id, type, fulfillment, address_json, subtotal_cents, fulfillment_cents,
         total_cents, deposit_cents, balance_cents, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?)`,
    )
    .run(id, ref("ORD"), o.request.id, o.quote.id, o.request.user_id, o.type, o.type === "print" ? o.fulfillment : null,
      o.address ? JSON.stringify(o.address) : null, subtotal, fee, total, deposit, o.type === "print" ? total - deposit : 0, now, now);
  return getOrder(id)!;
}
export function getOrder(id: string) {
  const row = db().prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
  return row && toOrder(row);
}
export function listOrders(requestId: string) {
  return (db().prepare("SELECT * FROM orders WHERE request_id = ? ORDER BY created_at ASC").all(requestId) as OrderRow[]).map(toOrder);
}
export type OrderWithContext = Order & { request_ref: string; request_title: string; customer_name: string };
export function listActiveOrders() {
  return (
    db()
      .prepare(
        `SELECT o.*, r.ref AS request_ref, r.title AS request_title, u.name AS customer_name FROM orders o
         JOIN requests r ON r.id = o.request_id JOIN users u ON u.id = o.user_id
         WHERE o.status IN ('in_production', 'ready') ORDER BY o.updated_at ASC`,
      )
      .all() as (OrderRow & { request_ref: string; request_title: string; customer_name: string })[]
  ).map((r) => toOrder(r) as OrderWithContext);
}
export function deleteOrder(id: string) {
  db().prepare("DELETE FROM orders WHERE id = ?").run(id);
}
export function updateOrder(id: string, patch: { status?: string; tracking?: string | null }) {
  const o = getOrder(id);
  if (!o) return;
  db()
    .prepare("UPDATE orders SET status = ?, tracking = ?, updated_at = ? WHERE id = ?")
    .run(patch.status ?? o.status, patch.tracking === undefined ? o.tracking : patch.tracking, Date.now(), id);
}

// ---------- payments ----------
export function createPayment(orderId: string, kind: Payment["kind"], amount: number): Payment {
  const id = uid();
  db().prepare("INSERT INTO payments (id, order_id, kind, amount_cents, created_at) VALUES (?, ?, ?, ?, ?)").run(id, orderId, kind, amount, Date.now());
  return getPayment(id)!;
}
export function getPayment(id: string) {
  return db().prepare("SELECT * FROM payments WHERE id = ?").get(id) as Payment | undefined;
}
export function listPayments(orderId: string) {
  return db().prepare("SELECT * FROM payments WHERE order_id = ? ORDER BY created_at ASC").all(orderId) as Payment[];
}
export function setStripeSession(paymentId: string, sessionId: string) {
  db().prepare("UPDATE payments SET stripe_session_id = ? WHERE id = ?").run(sessionId, paymentId);
}
export function paidAmount(orderId: string): number {
  const r = db().prepare("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payments WHERE order_id = ? AND status = 'paid'").get(orderId) as { n: number };
  return r.n;
}

/** Customer may download the model once an STL order for this request is paid. */
export function hasPaidStl(requestId: string): boolean {
  return !!db().prepare("SELECT 1 FROM orders WHERE request_id = ? AND type = 'stl' AND status = 'completed'").get(requestId);
}
