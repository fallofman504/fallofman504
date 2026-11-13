import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { addMessage, createRequest } from "@/lib/data";
import { parsePrintSpec, type PrintSpec } from "@/lib/print-options";
import { checkUpload, isPrintable, MAX_REFERENCE_FILES, saveUpload, UploadError } from "@/lib/storage";
import type { Intent } from "@/lib/types";

/** A customer submits a new design request: a text prompt and/or reference files. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

  const fd = await req.formData();
  const title = String(fd.get("title") ?? "").trim().slice(0, 120);
  const prompt = String(fd.get("prompt") ?? "").trim().slice(0, 5000);
  const intentRaw = String(fd.get("intent") ?? "");
  const printOnly = fd.get("kind") === "print_only";
  const intent: Intent = printOnly ? "print" : intentRaw === "stl" || intentRaw === "print" ? intentRaw : "undecided";
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  if (!title) return NextResponse.json({ error: "Give your project a short name." }, { status: 400 });
  if (printOnly) {
    if (files.length === 0) return NextResponse.json({ error: "Attach the 3D model you want printed." }, { status: 400 });
    const wrong = files.find((f) => !isPrintable(f.name));
    if (wrong) return NextResponse.json({ error: `"${wrong.name}" isn't a 3D model we can print. Use STL, 3MF, OBJ, or STEP.` }, { status: 400 });
  } else if (!prompt && files.length === 0) {
    return NextResponse.json({ error: "Describe what you want made, or attach a photo or model." }, { status: 400 });
  }
  // Print settings are required for print-only requests and optional when a custom design will be printed.
  let printSpec: PrintSpec | null = null;
  if (printOnly || (intent === "print" && fd.has("process"))) {
    const parsed = parsePrintSpec((k) => String(fd.get(k) ?? "").trim());
    if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });
    printSpec = parsed;
  }
  if (files.length > MAX_REFERENCE_FILES) {
    return NextResponse.json({ error: `Attach up to ${MAX_REFERENCE_FILES} files.` }, { status: 400 });
  }
  try {
    files.forEach((f) => checkUpload(f, "reference"));
    const request = createRequest({ user_id: user.id, title, prompt, intent, kind: printOnly ? "print_only" : "custom", print_spec: printSpec });
    for (const f of files) await saveUpload(f, { requestId: request.id, kind: "reference" });
    if (prompt) addMessage({ request_id: request.id, sender: "customer", body: prompt });
    return NextResponse.json({ id: request.id });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
