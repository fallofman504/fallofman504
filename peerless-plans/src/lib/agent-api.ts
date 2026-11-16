import "server-only";
import { listFiles, type Order } from "./orders";
import { appUrl } from "./payments";
import { quote, scopeRows, serviceTitle } from "./pricing";

/** Everything an agent needs to work a job. */
export function describeOrder(o: Order) {
  const files = listFiles(o.id);
  return {
    id: o.id,
    ref: o.ref,
    status: o.status,
    service: o.service,
    title: serviceTitle(o.service, o.details),
    details: o.details,
    scope: scopeRows(o.service, o.details, files.filter((f) => f.kind === "reference").length).map(([label, value]) => ({ label, value })),
    turnaround: quote(o.service, o.details).turnaround,
    price_cents: o.price_cents,
    customer_email: o.email,
    created_at: new Date(o.created_at).toISOString(),
    paid_at: o.paid_at && new Date(o.paid_at).toISOString(),
    files: files.map((f) => ({ id: f.id, kind: f.kind, filename: f.filename, mime: f.mime, size: f.size, url: `${appUrl()}/api/files/${f.id}` })),
  };
}
