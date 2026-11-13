import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getUser, safeNext } from "@/lib/auth";

export const metadata = { title: "Create account" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getUser()) redirect(safeNext(next));
  return <AuthForm mode="signup" next={next ? safeNext(next) : undefined} />;
}
