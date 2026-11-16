import { describeOrder } from "@/lib/agent-api";
import { addDeliverables } from "@/lib/jobs";
import { getOrder } from "@/lib/orders";
import { isStaff, unauthorized } from "@/lib/staff";
import { formFiles, UploadError } from "@/lib/storage";

/** Send the final files (PDF, DWG, QA sheet) in "files" fields. They wait for the founder's sign-off before the customer can download them. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isStaff(req))) return unauthorized();
  const order = getOrder((await params).id);
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    return Response.json(describeOrder(await addDeliverables(order, formFiles(await req.formData(), "files"))));
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
