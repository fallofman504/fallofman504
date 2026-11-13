"use client";

import { useState } from "react";
import { BRIM_NOTICE, MAX_QUANTITY, PROCESSES, type Option, type ProcessId } from "@/lib/print-options";

/** The print-settings dropdowns. Material, color, and resolution choices follow the chosen printing method. */
export function PrintOptionsFields() {
  const [process, setProcess] = useState<ProcessId>("filament");
  const p = PROCESSES[process];
  const [materialId, setMaterialId] = useState<string>(p.materials[0].id);
  const material = p.materials.find((m) => m.id === materialId) ?? p.materials[0];

  function changeProcess(next: ProcessId) {
    setProcess(next);
    setMaterialId(PROCESSES[next].materials[0].id);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Resin or filament" name="process" value={process} onChange={(v) => changeProcess(v as ProcessId)}
          options={Object.entries(PROCESSES).map(([id, x]) => ({ id, label: x.label }))} />
        <Select label={process === "resin" ? "Resin type" : "Filament type"} name="material" value={material.id} onChange={setMaterialId} options={p.materials} />
        <Select key={`color-${process}-${material.id}`} label="Color" name="color" options={material.colors.map((c) => ({ id: c, label: c }))} />
        <Select key={`layer-${process}`} label="Layer resolution" name="layer" defaultValue={p.defaultLayer} options={p.layers} />
        {p.infill && <Select label="Infill density" name="infill" defaultValue={p.defaultInfill ?? undefined} options={p.infill} />}
        <Select key={`supports-${process}`} label="Support material" name="supports" options={p.supports} />
        {p.fuzzySkin && <Select label="Fuzzy skin (textured surface)" name="fuzzy_skin" options={p.fuzzySkin} />}
        <label>
          <span className="label">Quantity</span>
          <input className="input" type="number" name="quantity" min={1} max={MAX_QUANTITY} defaultValue={1} required />
        </label>
      </div>
      <p className="rounded-xl border border-ink/20 bg-sun/40 px-3.5 py-2.5 text-sm">
        <b>Heads up:</b> {BRIM_NOTICE}
      </p>
    </div>
  );
}

function Select({ label, name, options, value, defaultValue, onChange }: {
  label: string; name: string; options: readonly Option[]; value?: string; defaultValue?: string; onChange?: (v: string) => void;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <select className="input" name={name} value={value} defaultValue={value === undefined ? defaultValue : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined} required>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}
