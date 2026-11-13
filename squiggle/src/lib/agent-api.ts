import "server-only";
import { getUser, isAgentRequest } from "./auth";
import { findUser, listFiles, listMessages, listOrders, listQuotes } from "./data";
import { appUrl } from "./payments";
import { describePrintSpec } from "./print-options";
import type { DesignRequest } from "./types";

/** Back-end endpoints accept either the agents' API key or a signed-in admin. */
export async function isStaff(req: Request): Promise<boolean> {
  if (isAgentRequest(req)) return true;
  return (await getUser())?.role === "admin";
}

export const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

/** Everything an agent needs to work a request. */
export function describeRequest(r: DesignRequest) {
  const customer = findUser(r.user_id);
  return {
    id: r.id,
    ref: r.ref,
    kind: r.kind,
    title: r.title,
    prompt: r.prompt,
    intent: r.intent,
    print_spec: r.print_spec,
    print_spec_summary: r.print_spec && describePrintSpec(r.print_spec).map((row) => `${row.label}: ${row.value}`),
    status: r.status,
    created_at: new Date(r.created_at).toISOString(),
    quote_due_at: new Date(r.created_at + 3600_000).toISOString(),
    customer: customer && { name: customer.name, email: customer.email },
    files: listFiles(r.id).map((f) => ({
      id: f.id,
      kind: f.kind,
      filename: f.filename,
      mime: f.mime,
      size: f.size,
      url: `${appUrl()}/api/files/${f.id}`,
    })),
    messages: listMessages(r.id).map((m) => ({ sender: m.sender, body: m.body, at: new Date(m.created_at).toISOString() })),
    quotes: listQuotes(r.id),
    orders: listOrders(r.id).map((o) => ({ ref: o.ref, type: o.type, status: o.status, fulfillment: o.fulfillment, total_cents: o.total_cents })),
  };
}
