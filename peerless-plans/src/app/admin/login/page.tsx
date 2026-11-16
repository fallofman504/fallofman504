import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin-bits";
import { isAdmin } from "@/lib/staff";

export const metadata = { title: "Review queue sign-in", robots: { index: false } };

export default async function AdminLogin() {
  if (await isAdmin()) redirect("/admin");
  return (
    <main className="order">
      <div className="wrap" style={{ maxWidth: 460 }}>
        <div className="panel"><h2>Review queue</h2><LoginForm /></div>
      </div>
    </main>
  );
}
