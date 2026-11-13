import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getUser, safeNext } from "@/lib/auth";

export const metadata = { title: "Log in" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getUser()) redirect(safeNext(next));
  return <AuthForm mode="login" next={next ? safeNext(next) : undefined} />;
}
