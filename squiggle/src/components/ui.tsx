"use client";

import { useEffect, useState } from "react";
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

/** A password box with an eye button that shows or hides what was typed. */
export function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className="input pr-12" />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-xl text-muted hover:text-ink"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}
