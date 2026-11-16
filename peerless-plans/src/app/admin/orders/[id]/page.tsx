import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SignOffForm, StaffUpload } from "@/components/admin-bits";
import { getOrder, listFiles, type FileRow } from "@/lib/orders";
import { money, scopeRows, serviceTitle } from "@/lib/pricing";
import { isAdmin } from "@/lib/staff";
import { DELIVERABLE_ACCEPT, DRAFT_ACCEPT } from "@/lib/storage";

export const metadata = { title: "Order", robots: { index: false } };

const STATUS = {
  drafting: "Waiting for a preview",
  preview_ready: "Preview sent, not bought yet",
  paid: "Paid, waiting for your sign-off",
  delivered: "Delivered",
  cancelled: "Cancelled by the customer",
};

function FileList({ files, empty }: { files: FileRow[]; empty: string }) {
  if (!files.length) return <p className="note">{empty}</p>;
  return (
    <ul className="files">
      {files.map((f) => <li key={f.id}><span>{f.filename}</span><a href={`/api/files/${f.id}`} target="_blank">Open</a></li>)}
    </ul>
  );
}

export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const order = getOrder((await params).id);
  if (!order) notFound();
  const files = listFiles(order.id);
  const of = (k: FileRow["kind"]) => files.filter((f) => f.kind === k);
  const open = order.status === "drafting" || order.status === "preview_ready";
  return (
    <main className="order">
      <div className="wrap">
        <p><Link href="/admin">← Review queue</Link></p>
        <p className="eyebrow">{order.ref} · {STATUS[order.status]}</p>
        <h2>{serviceTitle(order.service, order.details)} · {money(order.price_cents)}</h2>
        <p>Customer: <a href={`mailto:${order.email}`}>{order.email}</a> · <a href={`/o/${order.token}`} target="_blank">customer&apos;s order page</a></p>

        <div className="panel">
          <h3>Scope</h3>
          <ul className="scope">{scopeRows(order.service, order.details, of("reference").length).map(([k, v]) => <li key={k}><span>{k}</span><span>{v}</span></li>)}</ul>
          <h3 style={{ marginTop: 24 }}>Customer&apos;s reference files</h3>
          <FileList files={of("reference")} empty="None. The customer typed dimensions instead." />
        </div>

        <div className="panel" style={{ marginTop: 20 }}>
          <h3>Draft sheet and preview</h3>
          <FileList files={[...of("draft"), ...of("preview")]} empty="No draft yet." />
          {open && (
            <StaffUpload url={`/api/agent/orders/${order.id}/preview`} field="sheet" accept={DRAFT_ACCEPT}
              label="Upload the full draft sheet (PNG or JPG). The site crops and watermarks it, then emails the customer." />
          )}
        </div>

        <div className="panel" style={{ marginTop: 20 }}>
          <h3>Final files</h3>
          <FileList files={of("deliverable")} empty="No final files yet." />
          {order.status !== "delivered" && order.status !== "cancelled" && (
            <StaffUpload url={`/api/agent/orders/${order.id}/deliverables`} field="files" accept={DELIVERABLE_ACCEPT} multiple
              label="Add final files (PDF, DWG, QA sheet). A file with the same name replaces the earlier one." />
          )}
        </div>

        {order.status === "paid" && (
          <div className="panel" style={{ marginTop: 20 }}>
            <h3>Sign-off</h3>
            <p>The customer can download the final files only after you sign here.</p>
            <SignOffForm orderId={order.id} defaultName={process.env.FOUNDER_NAME ?? ""} />
          </div>
        )}
        {order.status === "delivered" && <p style={{ marginTop: 20 }}>Signed by <b>{order.signed_by}</b> and released.</p>}
      </div>
    </main>
  );
}
