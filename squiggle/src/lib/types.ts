import type { PrintSpec } from "./print-options";

export type Role = "customer" | "admin";
export type User = { id: string; email: string; name: string; phone: string | null; role: Role };

export type RequestStatus = "submitted" | "quoted" | "ordered" | "closed";
export type Intent = "stl" | "print" | "undecided";
/** "custom": Squiggle designs it. "print_only": the customer supplied a finished model. */
export type RequestKind = "custom" | "print_only";
export type DesignRequest = {
  kind: RequestKind;
  print_spec: PrintSpec | null;
  id: string;
  ref: string;
  user_id: string;
  title: string;
  prompt: string;
  intent: Intent;
  status: RequestStatus;
  created_at: number;
  quoted_at: number | null;
};

export type FileKind = "reference" | "turntable" | "render" | "model";
export type FileRow = {
  id: string;
  request_id: string;
  quote_id: string | null;
  kind: FileKind;
  filename: string;
  mime: string;
  size: number;
  created_at: number;
};

export type LineItem = { label: string; amount_cents: number };
export type Quote = {
  id: string;
  /** "draft": posted by an agent and waiting for staff approval; the customer can't see it yet. */
  status: "draft" | "sent";
  request_id: string;
  items: LineItem[];
  print_total_cents: number | null;
  stl_price_cents: number | null;
  shipping_cents: number | null;
  delivery_cents: number | null;
  lead_time_days: number | null;
  note: string;
  created_at: number;
};

export type Message = {
  id: string;
  request_id: string;
  sender: "customer" | "squiggle" | "system";
  body: string;
  quote_id: string | null;
  created_at: number;
};

export type OrderType = "stl" | "print";
export type Fulfillment = "pickup" | "delivery" | "shipping";
export type OrderStatus =
  | "awaiting_payment" // nothing paid yet (STL price or print deposit)
  | "in_production" // deposit paid, being printed
  | "ready" // printed; balance due before hand-off
  | "completed" // STL paid, or print handed off / shipped
  | "cancelled";
export type Address = { name: string; line1: string; line2: string; city: string; state: string; zip: string; phone: string };
export type Order = {
  id: string;
  ref: string;
  request_id: string;
  quote_id: string;
  user_id: string;
  type: OrderType;
  fulfillment: Fulfillment | null;
  address: Address | null;
  subtotal_cents: number;
  fulfillment_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  status: OrderStatus;
  tracking: string | null;
  created_at: number;
  updated_at: number;
};

export type PaymentKind = "full" | "deposit" | "balance";
export type Payment = {
  id: string;
  order_id: string;
  kind: PaymentKind;
  amount_cents: number;
  status: "pending" | "paid";
  method: "stripe" | "mock" | "in_person" | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  created_at: number;
  paid_at: number | null;
};

export const FULFILLMENT_LABEL: Record<Fulfillment, string> = {
  pickup: "Local pickup (Houston)",
  delivery: "Local delivery (Houston area)",
  shipping: "Shipping",
};
