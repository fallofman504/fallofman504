import { describeRequest, isStaff, unauthorized } from "@/lib/agent-api";
import { getRequest } from "@/lib/data";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isStaff(req))) return unauthorized();
  const request = getRequest((await params).id);
  if (!request) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(describeRequest(request));
}
