"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup } from "@/app/actions";
import { PasswordInput, SubmitButton } from "./ui";

export function AuthForm({ mode, next, notice }: { mode: "login" | "signup"; next?: string; notice?: string }) {
  const [state, action] = useActionState(mode === "login" ? login : signup, undefined);
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <div className="mx-auto max-w-md px-5 py-14">
      <h1 className="text-4xl font-extrabold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-2 text-muted">
        {mode === "login" ? "Log in to see your projects and quotes." : "It takes a few seconds, then you can send us your first idea."}
      </p>
      <form action={action} className="card mt-7 space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        {mode === "signup" && (
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input className="input" id="name" name="name" autoComplete="name" required />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        {mode === "signup" && (
          <div>
            <label className="label" htmlFor="phone">Phone <span className="font-normal text-muted">(optional, for pickup & delivery)</span></label>
            <input className="input" id="phone" name="phone" type="tel" autoComplete="tel" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="password">Password</label>
          <PasswordInput id="password" name="password" minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"} required />
        </div>
        {notice && !state?.error && <p className="notice" role="status">{notice}</p>}
        {state?.error && <p className="error" role="alert">{state.error}</p>}
        <SubmitButton className="btn btn-coral w-full py-3">{mode === "login" ? "Log in" : "Create account"}</SubmitButton>
        {mode === "login" && (
          <Link href="/forgot-password" className="btn btn-ghost w-full py-3">Forgot password?</Link>
        )}
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        {mode === "login" ? (
          <>New here? <Link className="font-semibold text-ink underline" href={`/signup${q}`}>Create an account</Link></>
        ) : (
          <>Already have an account? <Link className="font-semibold text-ink underline" href={`/login${q}`}>Log in</Link></>
        )}
      </p>
    </div>
  );
}
