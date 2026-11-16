// The published price list. Shared by the public pages, the order form and the server,
// so a quote on screen always matches what checkout charges.
export type Service = "spec" | "prospect" | "exhibit";

export const SERVICE_NAME: Record<Service, string> = {
  spec: "Spec test fit",
  prospect: "Prospect test fit",
  exhibit: "Lease exhibit",
};

export const BANDS = [
  { max: 3000, label: "Up to 3,000 SF", spec: 350, prospect: 490 },
  { max: 7500, label: "3,001 to 7,500 SF", spec: 600, prospect: 840 },
  { max: 15000, label: "7,501 to 15,000 SF", spec: 950, prospect: 1330 },
  { max: 30000, label: "15,001 to 30,000 SF", spec: 1600, prospect: 2240 },
];
export const OVER_PER_SF = { spec: 0.05, prospect: 0.07 };
export const EXHIBIT = { single: 175, set: 450 };
export const RUSH_RATE = 0.5;
export const TENANT_TYPES = ["General office", "Medical", "Law", "Creative", "Retail"];

export interface OrderDetails {
  building: string;
  suite: string;
  sf: number | null;
  tenant: string;
  program: string;
  exhibitType: "single" | "set";
  exhibitTitle: string;
  rush: boolean;
  notes: string;
  dims: string;
}

export const isService = (s: unknown): s is Service => s === "spec" || s === "prospect" || s === "exhibit";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

/** Builds clean details from whatever a form sent. */
export function readDetails(get: (key: string) => unknown): OrderDetails {
  const sf = Math.round(Number(get("sf")));
  return {
    building: clip(get("building"), 200),
    suite: clip(get("suite"), 120),
    sf: sf > 0 && sf < 5_000_000 ? sf : null,
    tenant: TENANT_TYPES.includes(String(get("tenant"))) ? String(get("tenant")) : TENANT_TYPES[0],
    program: clip(get("program"), 4000),
    exhibitType: get("exhibitType") === "set" ? "set" : "single",
    exhibitTitle: clip(get("exhibitTitle"), 200),
    rush: get("rush") === "1" || get("rush") === true,
    notes: clip(get("notes"), 2000),
    dims: clip(get("dims"), 6000),
  };
}

/** Returns a message for the first thing missing, or null when the details are complete. */
export function detailsProblem(service: Service, d: OrderDetails): string | null {
  if (!d.building) return "Add the building name or address.";
  if (!d.suite) return "Add the floor and suite.";
  if (service !== "exhibit" && !d.sf) return "Add the suite size in square feet. An estimate is fine; we confirm it from your files.";
  if (service === "prospect" && d.program.length < 10) return "Describe the prospect's program: headcount and the rooms they need.";
  if (service === "exhibit" && !d.exhibitTitle) return "Add the exhibit title exactly as it should print.";
  return null;
}

export function referenceProblem(fileCount: number, d: OrderDetails): string | null {
  if (!fileCount && d.dims.length < 20) return "Upload at least one file, or type the dimensions and a description of the space.";
  return null;
}

export function quote(service: Service, d: OrderDetails) {
  const lines: { label: string; cents: number }[] = [];
  let base: number;
  if (service === "exhibit") {
    base = EXHIBIT[d.exhibitType];
    lines.push({ label: d.exhibitType === "set" ? "Lease exhibit set" : "Lease exhibit", cents: base * 100 });
  } else {
    const sf = d.sf ?? 0;
    const band = BANDS.find((b) => sf <= b.max);
    base = band ? band[service] : sf * OVER_PER_SF[service];
    const size = band ? band.label.replace(/^Up/, "up") : `${sf.toLocaleString("en-US")} SF at $${OVER_PER_SF[service].toFixed(2)} / SF`;
    lines.push({ label: `${SERVICE_NAME[service]}, ${size}`, cents: Math.round(base * 100) });
  }
  if (d.rush) lines.push({ label: "Same-day rush (+50%)", cents: Math.round(base * RUSH_RATE * 100) });
  const turnaround = d.rush ? "Same day" : service === "exhibit" ? "24 hours" : service === "spec" ? "48 hours" : "24 to 48 hours";
  return { lines, totalCents: lines.reduce((a, l) => a + l.cents, 0), turnaround };
}

export const serviceTitle = (service: Service, d: OrderDetails) =>
  service === "exhibit" && d.exhibitType === "set" ? "Lease exhibit set" : SERVICE_NAME[service];

/** The scope restated in plain words, for the customer to confirm and for the order page. */
export function scopeRows(service: Service, d: OrderDetails, fileCount: number): [string, string][] {
  const rows: [string, string][] = [
    ["Drawing", serviceTitle(service, d)],
    ["Building", d.building],
    ["Floor and suite", d.suite],
  ];
  if (service !== "exhibit" && d.sf) rows.push(["Suite size", `${d.sf.toLocaleString("en-US")} SF (as you stated)`]);
  if (service === "spec") rows.push(["Tenant type", d.tenant]);
  if (service === "prospect") rows.push(["Program", d.program], ["Options", "Two layouts, one revision round"]);
  if (service === "exhibit") rows.push(["Exhibit title", d.exhibitTitle]);
  rows.push(["Turnaround", `${quote(service, d).turnaround} after payment`]);
  const files = fileCount ? `${fileCount} file${fileCount > 1 ? "s" : ""}` : "No files";
  rows.push(["Reference material", files + (d.dims ? ", plus typed dimensions" : "")]);
  if (d.dims) rows.push(["Dimensions and description", d.dims]);
  if (d.notes) rows.push(["Notes", d.notes]);
  return rows;
}

export const deliverableFormats = (service: Service) => (service === "exhibit" ? ["PDF", "QA sheet"] : ["PDF", "DWG", "QA sheet"]);

export const conceptNote = (service: Service) =>
  service === "exhibit"
    ? "I understand the exhibit is drawn as I instruct, from the drawings I provide, and is not field verified."
    : "I understand this is a conceptual space plan for discussion only, not for construction or permit.";

export const money = (cents: number) =>
  "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
