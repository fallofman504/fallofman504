/**
 * Squiggle's print menu: every choice a customer can make when setting up a print.
 * Edit this file to match what the shop actually stocks — the forms, validation,
 * and what the agents receive all follow from it.
 */

import { cleanOverrides, DEFAULT_PRINTER, DEFAULT_PROFILE, defaultValue, displayValue, ENABLED_PRINTERS, FIELD_PATH, FIELDS, getPrinter, getProfile, SLICER } from "./slicer";

export type Option = { id: string; label: string };
type Material = Option & { colors: string[] };
type Process = {
  label: string;
  materials: Material[];
  layers: Option[];
  defaultLayer: string;
  supports: Option[];
  /** For filament these three are only used to read requests made before the slicer-matched settings existed. */
  infill: Option[] | null;
  defaultInfill: string | null;
  fuzzySkin: Option[] | null;
};

/** Parts smaller than this (longest side on the bed, in inches) automatically get a brim. */
export const BRIM_THRESHOLD_IN = 0.5;
export const BRIM_NOTICE = `Small parts — anything under ${BRIM_THRESHOLD_IN} inch (${(BRIM_THRESHOLD_IN * 25.4).toFixed(1)} mm) — automatically get a brim added for print stability.`;

export const MAX_QUANTITY = 100;

const FILAMENT_COLORS = ["Black", "White", "Gray", "Red", "Blue", "Yellow", "Green"];
const RESIN_COLORS = ["White", "Gray"];

export const PROCESSES = {
  filament: {
    label: "Filament (FDM)",
    materials: [
      { id: "pla", label: "PLA — everyday prints", colors: FILAMENT_COLORS },
      { id: "petg", label: "PETG — tougher, handles heat and moisture", colors: FILAMENT_COLORS },
      { id: "abs", label: "ABS / ASA — heat and outdoor resistant", colors: FILAMENT_COLORS },
      { id: "tpu", label: "TPU — flexible, rubber-like", colors: FILAMENT_COLORS },
    ],
    layers: [
      { id: "0.28", label: "Draft — 0.28 mm (fastest, visible layers)" },
      { id: "0.24", label: "Fast — 0.24 mm" },
      { id: "0.20", label: "Standard — 0.20 mm" },
      { id: "0.12", label: "Fine — 0.12 mm" },
      { id: "0.08", label: "Extra fine — 0.08 mm (slowest, smoothest)" },
    ],
    defaultLayer: "0.20",
    supports: [
      { id: "auto", label: "Not sure — let Squiggle decide" },
      { id: "none", label: "No supports" },
      { id: "classic", label: "Yes — classic supports" },
      { id: "tree", label: "Yes — tree supports" },
    ],
    infill: [
      { id: "10", label: "10% — light, decorative" },
      { id: "15", label: "15% — standard" },
      { id: "25", label: "25% — sturdy" },
      { id: "40", label: "40% — strong" },
      { id: "60", label: "60% — very strong" },
      { id: "100", label: "100% — solid" },
    ],
    defaultInfill: "15",
    fuzzySkin: [
      { id: "none", label: "None — smooth walls" },
      { id: "outer", label: "Outer walls only" },
      { id: "all", label: "All walls" },
    ],
  },
  resin: {
    label: "Resin (SLA)",
    materials: [
      { id: "standard", label: "Standard resin — fine detail", colors: RESIN_COLORS },
      { id: "tough", label: "Tough resin — ABS-like strength", colors: RESIN_COLORS },
      { id: "flexible", label: "Flexible resin — rubber-like", colors: RESIN_COLORS },
      { id: "clear", label: "Clear resin — translucent", colors: ["Clear (uncolored)"] },
    ],
    layers: [
      { id: "0.10", label: "Draft — 0.10 mm" },
      { id: "0.05", label: "Standard — 0.05 mm" },
      { id: "0.03", label: "Fine — 0.03 mm (slowest, smoothest)" },
    ],
    defaultLayer: "0.05",
    supports: [
      { id: "auto", label: "Not sure — let Squiggle decide" },
      { id: "none", label: "No supports" },
      { id: "yes", label: "Yes — add supports" },
    ],
    infill: null,
    defaultInfill: null,
    fuzzySkin: null,
  },
} satisfies Record<string, Process>;

export type ProcessId = keyof typeof PROCESSES;
const processes: Record<string, Process> = PROCESSES;

/** Resin prints, and filament prints requested before the slicer-matched settings existed. */
export type BasicPrintSpec = {
  version?: undefined;
  process: ProcessId;
  material: string;
  color: string;
  layer: string;
  infill: string | null;
  supports: string;
  fuzzy_skin: string | null;
  quantity: number;
};

/**
 * Filament prints: a stock slicer profile plus only the settings the customer changed from it.
 * `overrides` is keyed by the slicer's own setting names with values in the slicer's own format,
 * so it can be applied directly in Creality Print.
 */
export type SlicerPrintSpec = {
  version: 2;
  process: "filament";
  material: string;
  color: string;
  quantity: number;
  slicer: string;
  printer: string;
  printer_name: string;
  profile: string;
  profile_name: string;
  mode: "simple" | "advanced";
  overrides: Record<string, string>;
};

export type PrintSpec = BasicPrintSpec | SlicerPrintSpec;

/** Validates form input against the menu. Returns the spec, or a message saying what's wrong. */
export function parsePrintSpec(get: (key: string) => string): PrintSpec | string {
  const p = processes[get("process")];
  if (!p) return "Choose resin or filament.";
  const material = p.materials.find((m) => m.id === get("material"));
  if (!material) return "Choose a material.";
  if (!material.colors.includes(get("color"))) return "Choose a color available for that material.";
  const quantity = Number(get("quantity") || "1");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return `Quantity must be between 1 and ${MAX_QUANTITY}.`;

  if (get("process") === "filament") {
    const printer = getPrinter(get("printer") || DEFAULT_PRINTER);
    if (!printer || !ENABLED_PRINTERS.includes(printer.id)) return "That printer isn't available yet.";
    const profile = getProfile(printer.id, get("print_profile") || DEFAULT_PROFILE);
    if (!profile) return "Choose a print profile.";
    let changed: unknown;
    try {
      changed = JSON.parse(get("print_overrides") || "{}");
    } catch {
      return "Print settings were not in the expected format.";
    }
    const overrides = cleanOverrides(profile, changed);
    if (typeof overrides === "string") return overrides;
    return {
      version: 2, process: "filament", material: material.id, color: get("color"), quantity,
      slicer: SLICER, printer: printer.id, printer_name: printer.name, profile: profile.id, profile_name: profile.name,
      mode: get("print_mode") === "advanced" ? "advanced" : "simple", overrides,
    };
  }

  if (!p.layers.some((o) => o.id === get("layer"))) return "Choose a layer resolution.";
  if (!p.supports.some((o) => o.id === get("supports"))) return "Choose a support option.";
  return { process: get("process") as ProcessId, material: material.id, color: get("color"), layer: get("layer"), infill: null, supports: get("supports"), fuzzy_skin: null, quantity };
}

/** Human-readable rows for showing a spec to customers, staff, and agents. */
export function describePrintSpec(spec: PrintSpec): { label: string; value: string }[] {
  const p = processes[spec.process];
  const find = (list: Option[] | null, id: string | null) => list?.find((o) => o.id === id)?.label ?? id ?? "";
  const rows = [
    { label: "Printing method", value: p?.label ?? spec.process },
    { label: "Material", value: find(p?.materials ?? null, spec.material) },
    { label: "Color", value: spec.color },
    { label: "Quantity", value: String(spec.quantity) },
  ];
  if (spec.version === 2) {
    rows.push({ label: "Slicer", value: spec.slicer }, { label: "Print profile", value: spec.profile_name });
    const profile = getProfile(spec.printer, spec.profile);
    for (const [key, value] of Object.entries(spec.overrides)) {
      const field = FIELDS[key];
      if (!field) { rows.push({ label: key, value }); continue; }
      const stock = profile ? displayValue(field, defaultValue(profile, key)) : "";
      rows.push({ label: `${FIELD_PATH[key]} › ${field.label}`, value: `${displayValue(field, value)}${stock ? ` (stock: ${stock})` : ""}` });
    }
    if (Object.keys(spec.overrides).length === 0) rows.push({ label: "Changes from the profile", value: "None" });
    return rows;
  }
  rows.splice(3, 0, { label: "Layer resolution", value: find(p?.layers ?? null, spec.layer) });
  if (spec.infill != null) rows.splice(4, 0, { label: "Infill density", value: find(p?.infill ?? null, spec.infill) });
  rows.push({ label: "Supports", value: find(p?.supports ?? null, spec.supports) });
  if (spec.fuzzy_skin != null) rows.push({ label: "Fuzzy skin", value: find(p?.fuzzySkin ?? null, spec.fuzzy_skin) });
  return rows;
}
