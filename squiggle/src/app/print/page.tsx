import Link from "next/link";
import { NewRequestForm } from "@/components/new-request-form";
import { requireUser } from "@/lib/auth";
import { MAX_FILE_BYTES, MAX_REFERENCE_FILES, PRINTABLE_ACCEPT } from "@/lib/storage";

export const metadata = { title: "Print my model" };

/** For customers who already have a 3D model and only need it printed. */
export default async function PrintMyModel() {
  await requireUser("/print");
  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <p className="eyebrow">3D printing service</p>
      <h1 className="mt-2 text-4xl font-extrabold">Print my model</h1>
      <p className="mt-2 text-muted">Upload your file, pick your settings, and we&apos;ll send a price in about an hour.</p>
      <p className="mt-1 mb-8 text-sm text-muted">
        Don&apos;t have a model yet? <Link href="/requests/new" className="font-semibold text-ink underline">Have us design one</Link>.
      </p>
      <NewRequestForm mode="print" accept={PRINTABLE_ACCEPT} maxFiles={MAX_REFERENCE_FILES} maxBytes={MAX_FILE_BYTES} />
    </div>
  );
}
