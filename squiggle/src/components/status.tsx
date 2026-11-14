import type { DesignRequest, Order } from "@/lib/types";

const tone = {
  wait: "border-amber/30 bg-amber/10 text-amber",
  go: "border-accent/30 bg-accent/10 text-accent",
  act: "border-accent bg-accent text-black",
  done: "bg-ink/5 text-muted",
};

export function RequestBadge({ status }: { status: DesignRequest["status"] }) {
  const map = {
    submitted: ["Quote in progress", tone.wait],
    quoted: ["Quote ready", tone.act],
    ordered: ["Ordered", tone.go],
    closed: ["Closed", tone.done],
  } as const;
  const [label, cls] = map[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function orderStatusLabel(o: Order, due: number): string {
  if (o.status === "awaiting_payment") return "Awaiting payment";
  if (o.status === "cancelled") return "Cancelled";
  if (o.type === "stl") return "Paid · download ready";
  if (o.status === "in_production") return "In production";
  if (o.status === "ready") return due > 0 ? "Ready · balance due" : o.fulfillment === "pickup" ? "Ready for pickup" : "Ready to go out";
  return o.fulfillment === "shipping" ? "Shipped" : o.fulfillment === "delivery" ? "Delivered" : "Picked up";
}

export function OrderBadge({ order, due }: { order: Order; due: number }) {
  const cls =
    order.status === "awaiting_payment" || (order.status === "ready" && due > 0)
      ? tone.act
      : order.status === "completed"
        ? tone.go
        : order.status === "cancelled"
          ? tone.done
          : tone.wait;
  return <span className={`badge ${cls}`}>{orderStatusLabel(order, due)}</span>;
}
