// Peças de interface para filtrar reservas (barra de pesquisa, chips de
// estado com contagem, filtros avançados, resumo e exportação).
// Lógica pura em src/lib/reservation-filters.ts.
import { useState } from "react";
import { Icon } from "@/components/Icon";

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Icon
        name="search"
        size={16}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-10 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar pesquisa"
          className="press absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground"
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

export interface ChipOption<T extends string> {
  id: T;
  label: string;
  count?: number;
  /** destaque vermelho (ex: prazo excedido) */
  urgent?: boolean;
}

export function StatusChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : o.urgent && (o.count ?? 0) > 0
                  ? "border-red-500/40 bg-red-500/10 text-red-700"
                  : "border-border bg-card text-foreground"
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/25" : "bg-muted text-muted-foreground"}`}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <label className="block text-xs font-semibold text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateRange({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const bad = !!from && !!to && from > to;
  return (
    <div className="col-span-2">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onChange(e.target.value, to)}
          aria-label={`${label} — de`}
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
        />
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onChange(from, e.target.value)}
          aria-label={`${label} — até`}
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
        />
      </div>
      {bad && <p className="mt-1 text-[11px] text-red-600">A data inicial é depois da final.</p>}
    </div>
  );
}

/** Painel "Mais filtros" que abre/fecha; mostra um ponto quando há filtros avançados activos. */
export function AdvancedPanel({
  activeCount,
  children,
}: {
  activeCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="press inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground"
      >
        <Icon name="filter" size={13} /> Mais filtros
        {activeCount > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-3">
          {children}
        </div>
      )}
    </div>
  );
}

export function SummaryStrip({
  items,
}: {
  items: { label: string; value: string; warn?: boolean }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((i) => (
        <div
          key={i.label}
          className={`rounded-2xl border p-2.5 ${i.warn ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-card"}`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {i.label}
          </p>
          <p className="mt-0.5 text-sm font-bold text-foreground">{i.value}</p>
        </div>
      ))}
    </div>
  );
}

/** Descarrega um ficheiro CSV (abre no Excel). */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
