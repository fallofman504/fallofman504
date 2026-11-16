"use client";

import { useMemo, useState } from "react";
import { cleanValue, DEFAULT_PRINTER, DEFAULT_PROFILE, defaultValue, ENABLED_PRINTERS, getPrinter, PAGES, PRINTERS, SLICER, type Field } from "@/lib/slicer";
import { isShown, supportStyleChoices } from "@/lib/slicer/visibility";

/**
 * Print settings laid out like Creality Print's process panel: a stock profile, a Simple/Advanced switch,
 * and the same categories, groups, fields and choices in the same order. Only what the customer changes
 * from the stock profile is submitted.
 */
export function SlicerSettings() {
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE);
  const [advanced, setAdvanced] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [tab, setTab] = useState(PAGES[0].title);

  const printer = getPrinter(DEFAULT_PRINTER)!;
  const profile = printer.profiles.find((p) => p.id === profileId) ?? printer.profiles[0];
  const get = (key: string) => overrides[key] ?? defaultValue(profile, key);
  const visible = (f: Field) => (advanced || f.mode === "s") && isShown(f.key, get);

  // Like the slicer, a category with nothing to show in the current mode is left out.
  const pages = PAGES.map((p) => ({ ...p, groups: p.groups.map((g) => ({ ...g, fields: g.fields.filter(visible) })).filter((g) => g.fields.length) })).filter((p) => p.groups.length);
  const page = pages.find((p) => p.title === tab) ?? pages[0];

  function set(key: string, value: string) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === defaultValue(profile, key)) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  const changed = Object.keys(overrides).filter((k) => overrides[k] !== defaultValue(profile, k));
  const submitted = useMemo(() => JSON.stringify(Object.fromEntries(changed.map((k) => [k, overrides[k]]))), [changed, overrides]);
  const invalid = changed.filter((k) => cleanValue(fieldOf(k), overrides[k]) === null);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-card">
      <input type="hidden" name="printer" value={printer.id} />
      <input type="hidden" name="print_profile" value={profile.id} />
      <input type="hidden" name="print_mode" value={advanced ? "advanced" : "simple"} />
      <input type="hidden" name="print_overrides" value={submitted} />

      {/* printer: single color today, full color when the K2 goes live */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-4 py-3 text-xs">
        <span className="mr-1 font-mono tracking-[0.1em] text-muted uppercase">Printer</span>
        {PRINTERS.map((p) => {
          const enabled = ENABLED_PRINTERS.includes(p.id);
          return (
            <button key={p.id} type="button" disabled={!enabled} aria-pressed={p.id === printer.id}
              title={enabled ? undefined : "Full-color printing isn't available yet"}
              className={`rounded border px-3 py-1.5 font-semibold ${p.id === printer.id ? "border-accent bg-tint text-accent" : "border-line text-muted"} ${enabled ? "" : "cursor-not-allowed opacity-50"}`}>
              {p.id === "k2" ? "Full color · K2 Combo" : "Single color · K1"}
              {!enabled && <span className="ml-2 rounded-full border border-line px-1.5 py-0.5 text-[10px] font-normal">coming soon</span>}
            </button>
          );
        })}
      </div>

      {/* process profile + Advanced switch */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3">
        <label className="min-w-0 flex-1">
          <span className="label">Process</span>
          <select className="input" value={profile.id} onChange={(e) => setProfileId(e.target.value)} aria-label="Print profile">
            {printer.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-semibold select-none">
          Advanced
          <input type="checkbox" role="switch" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} className="peer sr-only" />
          <span className="relative h-5 w-9 rounded-full border border-line bg-field transition peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-muted after:transition peer-checked:after:translate-x-4 peer-checked:after:bg-black" />
        </label>
      </div>

      {/* categories */}
      <div className="flex gap-1 overflow-x-auto border-b border-line px-2 pt-2" role="tablist">
        {pages.map((p) => (
          <button key={p.title} type="button" role="tab" aria-selected={p.title === page.title} onClick={() => setTab(p.title)}
            className={`cursor-pointer border-b-2 px-3 pb-2 font-mono text-xs tracking-[0.08em] whitespace-nowrap uppercase ${p.title === page.title ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}>
            {p.title}
          </button>
        ))}
      </div>

      <div className="space-y-6 px-4 py-4" role="tabpanel">
        {page.groups.map((g) => (
          <fieldset key={g.title}>
            <legend className="mb-2 font-mono text-[11px] tracking-[0.12em] text-accent uppercase">{g.title}</legend>
            <div className="divide-y divide-line/60">
              {g.fields.map((f) => (
                <Row key={f.key} field={f} value={get(f.key)} stock={defaultValue(profile, f.key)} changed={f.key in overrides && overrides[f.key] !== defaultValue(profile, f.key)}
                  locked={!advanced && f.key === "layer_height"} supportType={get("support_type")} onChange={(v) => set(f.key, v)} />
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper px-4 py-2.5 font-mono text-[11px] tracking-[0.06em] text-muted">
        <span>{SLICER.toUpperCase()}</span>
        <span className="flex items-center gap-3">
          {invalid.length > 0 && <span className="text-danger">{invalid.length} VALUE{invalid.length === 1 ? "" : "S"} TO FIX</span>}
          <span className={changed.length ? "text-accent" : ""}>{changed.length} CHANGED FROM PROFILE</span>
          {changed.length > 0 && <button type="button" className="cursor-pointer underline hover:text-ink" onClick={() => setOverrides({})}>RESET ALL</button>}
        </span>
      </div>
    </div>
  );
}

const fieldOf = (() => {
  const map = new Map<string, Field>(PAGES.flatMap((p) => p.groups.flatMap((g) => g.fields.map((f) => [f.key, f] as const))));
  return (key: string) => map.get(key)!;
})();

function Row({ field, value, stock, changed, locked, supportType, onChange }: {
  field: Field; value: string; stock: string; changed: boolean; locked: boolean; supportType: string; onChange: (v: string) => void;
}) {
  const id = `ps-${field.key}`;
  const bad = changed && cleanValue(field, value) === null;
  const unit = field.type === "percent" ? "%" : field.unit;
  let control;
  if (field.type === "bool") {
    control = <input id={id} type="checkbox" checked={value === "1"} onChange={(e) => onChange(e.target.checked ? "1" : "0")} className="h-4 w-4 cursor-pointer accent-[#c8ff2e]" />;
  } else if (field.type === "enum") {
    const allowed = field.key === "support_style" ? supportStyleChoices(supportType) : null;
    const options = (field.options ?? []).filter((o) => !allowed || allowed.includes(o[0]));
    control = (
      <select id={id} className="input py-1.5 text-sm" value={options.some((o) => o[0] === value) ? value : ""} onChange={(e) => onChange(e.target.value)}>
        {!options.some((o) => o[0] === value) && <option value="">Profile default</option>}
        {options.map((o) => <option key={o[0]} value={o[0]}>{o[1].trim()}</option>)}
      </select>
    );
  } else {
    const shown = field.type === "percent" ? value.replace(/%$/, "") : value;
    control = (
      <span className="flex items-center gap-2">
        <input id={id} className={`input py-1.5 text-right font-mono text-sm ${bad ? "border-danger" : ""} ${locked ? "opacity-60" : ""}`} inputMode="decimal" value={shown} readOnly={locked}
          placeholder={stock === "" ? "default" : undefined} aria-invalid={bad}
          onChange={(e) => onChange(field.type === "percent" && e.target.value.trim() !== "" ? `${e.target.value.trim().replace(/%$/, "")}%` : e.target.value.trim())} />
        {unit && <span className="w-12 shrink-0 font-mono text-[11px] text-muted">{unit}</span>}
      </span>
    );
  }
  return (
    <div className="grid grid-cols-1 items-center gap-x-4 gap-y-1 py-2 sm:grid-cols-[1fr_210px]">
      <label htmlFor={id} className="flex items-center gap-2 text-sm" title={field.tip}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${changed ? "bg-accent" : "bg-transparent"}`} />
        <span className={changed ? "text-ink" : "text-[#b9c0cc]"}>{field.label}</span>
        {locked && <span className="font-mono text-[10px] text-muted">SET BY PROFILE</span>}
        {changed && <button type="button" className="cursor-pointer font-mono text-[10px] text-muted underline hover:text-ink" onClick={() => onChange(stock)}>RESET</button>}
      </label>
      {control}
    </div>
  );
}
