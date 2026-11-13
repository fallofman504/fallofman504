import { ForgotPasswordForm } from "@/components/password-forms";

export const metadata = { title: "Forgot password" };

export default function ForgotPassword() {
  return (
    <div className="mx-auto max-w-md px-5 py-14">
      <h1 className="text-4xl font-extrabold">Forgot your password?</h1>
      <p className="mt-2 text-muted">Enter your account email and we&apos;ll send you a link to choose a new one.</p>
      <ForgotPasswordForm />
    </div>
  );
}
