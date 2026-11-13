import { NewRequestForm } from "@/components/new-request-form";
import { requireUser } from "@/lib/auth";
import { MAX_FILE_BYTES, MAX_REFERENCE_FILES, REFERENCE_ACCEPT } from "@/lib/storage";

export const metadata = { title: "New project" };

export default async function NewRequest() {
  await requireUser("/requests/new");
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <p className="eyebrow">New project</p>
      <h1 className="mt-2 text-4xl font-extrabold">Tell us what to make</h1>
      <p className="mt-2 mb-8 text-muted">A sentence is enough. A photo or sketch helps. A 3D file is great if you have one.</p>
      <NewRequestForm accept={REFERENCE_ACCEPT} maxFiles={MAX_REFERENCE_FILES} maxBytes={MAX_FILE_BYTES} />
    </div>
  );
}
