import { describeOrder } from "@/lib/agent-api";
import { setPreview } from "@/lib/jobs";
import { getOrder } from "@/lib/orders";
import { isStaff, unauthorized } from "@/lib/staff";
import { formFiles, UploadError } from "@/lib/storage";

/** Send the full draft sheet as an image in the "sheet" field. The site crops and watermarks it for the customer. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isStaff(req))) return unauthorized();
  const order = getOrder((await params).id);
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });
  const [sheet] = formFiles(await req.formData(), "sheet");
  if (!sheet) return Response.json({ error: 'Send the draft sheet as a PNG or JPG in a form field named "sheet".' }, { status: 400 });
  try {
    await setPreview(order, sheet);
  } catch (e) {
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return Response.json(describeOrder(getOrder(order.id)!));
}
