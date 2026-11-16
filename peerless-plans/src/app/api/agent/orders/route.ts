import { describeOrder } from "@/lib/agent-api";
import { listOrders, type OrderStatus } from "@/lib/orders";
import { isStaff, unauthorized } from "@/lib/staff";

const STATUSES = ["drafting", "preview_ready", "paid", "delivered", "cancelled"];

/** The work queue. Default: orders waiting for a preview, oldest first. */
export async function GET(req: Request) {
  if (!(await isStaff(req))) return unauthorized();
  const status = new URL(req.url).searchParams.get("status") ?? "drafting";
  if (status !== "all" && !STATUSES.includes(status)) return Response.json({ error: `Unknown status "${status}"` }, { status: 400 });
  const orders = status === "all" ? listOrders() : listOrders(status as OrderStatus);
  return Response.json({ orders: orders.map(describeOrder) });
}
