import Link from "next/link";
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
      <p className="mt-2 text-muted">A sentence is enough. A photo or sketch helps. A 3D file is great if you have one.</p>
      <p className="mt-1 mb-8 text-sm text-muted">
        Already have a finished 3D model? <Link href="/print" className="font-semibold text-ink underline">Just get it printed</Link>.
      </p>
      <NewRequestForm mode="custom" accept={REFERENCE_ACCEPT} maxFiles={MAX_REFERENCE_FILES} maxBytes={MAX_FILE_BYTES} />
    </div>
  );
}
