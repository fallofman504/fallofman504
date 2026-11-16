import { describeOrder } from "@/lib/agent-api";
import { getOrder } from "@/lib/orders";
import { isStaff, unauthorized } from "@/lib/staff";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isStaff(req))) return unauthorized();
  const order = getOrder((await params).id);
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(describeOrder(order));
}
