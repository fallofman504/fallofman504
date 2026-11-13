"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

export function SubmitButton({ children, className = "btn", pendingText = "Working…" }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Re-fetches the page on an interval, e.g. while waiting for a quote to arrive. */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
