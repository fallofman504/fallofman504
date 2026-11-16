"use client";

import { useActionState } from "react";
import { enterPreview } from "@/app/actions";
import { PasswordInput, SubmitButton } from "./ui";

export function PreviewForm({ next }: { next?: string }) {
  const [state, action] = useActionState(enterPreview, undefined);
  return (
    <form action={action} className="card mt-7 space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label className="label" htmlFor="passcode">Passcode</label>
        <PasswordInput id="passcode" name="passcode" autoComplete="off" required />
      </div>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      <SubmitButton className="btn btn-primary w-full py-3">Enter</SubmitButton>
    </form>
  );
}
