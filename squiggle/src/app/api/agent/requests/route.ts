import { describeRequest, isStaff, unauthorized } from "@/lib/agent-api";
import { listRequests, requestIdsWithDrafts } from "@/lib/data";

/**
 * GET /api/agent/requests?status=submitted — the work queue, oldest first.
 * Requests whose draft quote is waiting for staff approval are left out, so agents don't quote them twice.
 */
export async function GET(req: Request) {
  if (!(await isStaff(req))) return unauthorized();
  const status = new URL(req.url).searchParams.get("status") ?? "submitted";
  const drafted = requestIdsWithDrafts();
  const rows = listRequests(status === "all" ? undefined : status).filter((r) => status !== "submitted" || !drafted.has(r.id));
  return Response.json({ requests: rows.map(describeRequest) });
}
