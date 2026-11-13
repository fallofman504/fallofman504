import Link from "next/link";
import { ChoosePasswordForm } from "@/components/password-forms";
import { userIdForResetToken } from "@/lib/auth";

export const metadata = { title: "Choose a new password", referrer: "no-referrer" as const };

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const valid = !!token && !!userIdForResetToken(token);
  return (
    <div className="mx-auto max-w-md px-5 py-14">
      <h1 className="text-4xl font-extrabold">Choose a new password</h1>
      {valid ? (
        <ChoosePasswordForm token={token} />
      ) : (
        <div className="card mt-7">
          <p>This reset link has expired or was already used.</p>
          <Link href="/forgot-password" className="btn btn-coral mt-4">Get a new link</Link>
        </div>
      )}
    </div>
  );
}
