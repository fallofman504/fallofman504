import { isStaff, unauthorized } from "@/lib/agent-api";
import { addMessage, getRequest } from "@/lib/data";

/** POST { "body": "..." } — send the customer a message (e.g. a clarifying question). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isStaff(req))) return unauthorized();
  const request = getRequest((await params).id);
  if (!request) return Response.json({ error: "Not found" }, { status: 404 });
  const body = String((await req.json().catch(() => ({})))?.body ?? "").trim().slice(0, 4000);
  if (!body) return Response.json({ error: "body is required" }, { status: 400 });
  addMessage({ request_id: request.id, sender: "squiggle", body });
  return Response.json({ ok: true });
}
