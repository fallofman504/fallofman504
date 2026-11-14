"use client";

import Link from "next/link";
import { useActionState } from "react";
import { choosePassword, requestPasswordReset } from "@/app/actions";
import { PasswordInput, SubmitButton } from "./ui";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="card mt-7 space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state?.notice && <p className="notice" role="status">{state.notice}</p>}
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      <SubmitButton className="btn btn-primary w-full py-3" pendingText="Sending…">Email me a reset link</SubmitButton>
      <Link href="/login" className="block text-center text-sm font-semibold text-muted underline hover:text-ink">Back to log in</Link>
    </form>
  );
}

export function ChoosePasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(choosePassword, undefined);
  return (
    <form action={action} className="card mt-7 space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">New password</label>
        <PasswordInput id="password" name="password" minLength={8} autoComplete="new-password" required />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Type it again</label>
        <PasswordInput id="confirm" name="confirm" minLength={8} autoComplete="new-password" required />
      </div>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      <SubmitButton className="btn btn-primary w-full py-3">Save new password</SubmitButton>
    </form>
  );
}
