/**
 * The print-settings menu, generated from Creality Print's own source code by
 * scripts/extract_creality_print.py. Categories, groups, fields, order, dropdown choices, the
 * simple/advanced split, and the stock profile defaults all come from that file, so what a customer
 * picks here is exactly what the shop sees in the slicer.
 */
import raw from "./creality-print.json";

export type FieldType = "bool" | "int" | "float" | "percent" | "floatOrPercent" | "enum";
export type Field = {
  key: string;
  label: string;
  type: FieldType;
  /** "s": shown in simple mode. "a": shown only with the Advanced switch on. */
  mode: "s" | "a";
  unit?: string;
  tip?: string;
  min?: number;
  max?: number;
  options?: [value: string, label: string][];
  /** The slicer's built-in default, used when the profile doesn't set this field. */
  def?: string;
};
export type Group = { title: string; fields: Field[] };
export type Page = { title: string; groups: Group[] };
export type Profile = { id: string; name: string; values: Record<string, string> };
export type Printer = { id: string; name: string; profiles: Profile[] };

const data = raw as unknown as { slicer: string; version: string; printers: Printer[]; pages: Page[] };

export const SLICER = `${data.slicer} ${data.version}`;
export const PAGES = data.pages;
export const PRINTERS = data.printers;
export const FIELDS: Record<string, Field> = Object.fromEntries(PAGES.flatMap((p) => p.groups.flatMap((g) => g.fields.map((f) => [f.key, f]))));

/** Printers customers can order on today. The K2 (full-color) profiles are ready but not switched on yet. */
export const ENABLED_PRINTERS = ["k1"];
export const DEFAULT_PRINTER = "k1";
export const DEFAULT_PROFILE = "0.20";

export const getPrinter = (id: string) => PRINTERS.find((p) => p.id === id);
export const getProfile = (printerId: string, profileId: string) => getPrinter(printerId)?.profiles.find((p) => p.id === profileId);

/** A field's value before the customer changes anything: the profile's value, else the slicer default. */
export function defaultValue(profile: Profile, key: string): string {
  const field = FIELDS[key];
  const v = profile.values[key] ?? field?.def ?? "";
  if (field?.type === "enum" && !field.options?.some((o) => o[0] === v)) return "";
  return v;
}

/** Where a field lives, for showing it to people: "Strength › Infill". */
export const FIELD_PATH: Record<string, string> = Object.fromEntries(
  PAGES.flatMap((p) => p.groups.flatMap((g) => g.fields.map((f) => [f.key, `${p.title} › ${g.title}`]))),
);

/** How a stored value reads to a person: "15%", "Gyroid", "On", "0.2 mm". */
export function displayValue(field: Field, value: string): string {
  if (value === "") return "profile default";
  if (field.type === "bool") return value === "1" ? "On" : "Off";
  if (field.type === "enum") return field.options?.find((o) => o[0] === value)?.[1].trim() ?? value;
  if (field.type === "percent") return value.endsWith("%") ? value : `${value}%`;
  return field.unit && !value.endsWith("%") ? `${value} ${field.unit}` : value;
}

const NUM = /^-?\d{1,7}(\.\d{1,5})?$/;

/** Returns the cleaned value in the slicer's own format, or null if it isn't valid for this field. */
export function cleanValue(field: Field, input: string): string | null {
  const v = input.trim();
  const inRange = (n: number) => (field.min === undefined || n >= field.min) && (field.max === undefined || n <= field.max);
  switch (field.type) {
    case "bool":
      return v === "1" || v === "0" ? v : null;
    case "enum":
      return field.options?.some((o) => o[0] === v) ? v : null;
    case "int":
      return /^-?\d{1,7}$/.test(v) && inRange(Number(v)) ? String(Number(v)) : null;
    case "float":
      return NUM.test(v) && inRange(Number(v)) ? String(Number(v)) : null;
    case "percent": {
      const n = v.replace(/%$/, "");
      return NUM.test(n) && inRange(Number(n)) ? `${Number(n)}%` : null;
    }
    case "floatOrPercent": {
      const pct = v.endsWith("%"), n = v.replace(/%$/, "");
      return NUM.test(n) && Number(n) >= 0 ? `${Number(n)}${pct ? "%" : ""}` : null;
    }
  }
}

export const MAX_OVERRIDES = 200;

/**
 * Checks the settings a customer changed. Only known fields with valid values are accepted, and values equal
 * to the profile's own are dropped, so what's stored is exactly the list of changes from the stock profile.
 */
export function cleanOverrides(profile: Profile, input: unknown): Record<string, string> | string {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return "Print settings were not in the expected format.";
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > MAX_OVERRIDES) return "Too many settings were changed.";
  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    const field = FIELDS[key];
    if (!field) return `"${key}" isn't a setting we recognize.`;
    const cleaned = cleanValue(field, String(value ?? ""));
    if (cleaned === null) return `"${field.label}" has a value we can't use.`;
    if (cleaned !== defaultValue(profile, key)) out[key] = cleaned;
  }
  return out;
}
