import { redirect } from "next/navigation";
import { PreviewForm } from "@/components/preview-form";
import { previewPasscode } from "@/lib/preview";

export const metadata = { title: "Private preview", robots: { index: false, follow: false } };

/** The passcode screen shown while the site is in private preview. */
export default async function Preview({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!previewPasscode()) redirect("/");
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <p className="eyebrow">Private preview</p>
      <h1 className="mt-3 text-4xl font-bold">We&apos;re still building</h1>
      <p className="mt-2 text-muted">Squiggle isn&apos;t open to the public yet. If you were given a passcode, enter it to look around.</p>
      <PreviewForm next={next} />
    </div>
  );
}
