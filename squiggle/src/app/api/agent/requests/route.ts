import { describeRequest, isStaff, unauthorized } from "@/lib/agent-api";
import { listRequests } from "@/lib/data";

/** GET /api/agent/requests?status=submitted — the work queue, oldest first. */
export async function GET(req: Request) {
  if (!(await isStaff(req))) return unauthorized();
  const status = new URL(req.url).searchParams.get("status") ?? "submitted";
  const rows = listRequests(status === "all" ? undefined : status);
  return Response.json({ requests: rows.map(describeRequest) });
}
