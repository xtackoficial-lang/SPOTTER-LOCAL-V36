// ============================================================
// XTACK SPOTTER — Seletor de âmbito de localização
// ------------------------------------------------------------
// BUG DO ABRÃO (2026-08-30): "botão para diferenciar negócios de todo
// país ou país da pessoa é difícil de perceber... deveria ter opção de
// selecionar várias províncias, não só duas opções". Antes era um
// botãozinho que só alternava entre "minha cidade" e "país inteiro",
// sem explicação nenhuma — ninguém de fora percebia o que ele fazia. E
// não dava para escolher SÓ um conjunto de províncias específicas (ex:
// alguém em Maputo que quer ver também Gaza e Inhambane, sem ver o
// país inteiro).
//
// Este componente substitui esse botão por um selector com folha
// inferior clara: 3 modos — "A minha localização" (omissão),
// "Todo o país", ou "Escolher províncias" (várias, com caixas de
// confirmação). Usado tanto em home.tsx como em search.tsx.
// ============================================================
import { useState } from "react";
import { Icon } from "./Icon";
import { PROVINCES_MZ } from "@/lib/mozambique-locations";
import { useModalBackButton } from "@/lib/use-modal-back";
import { t, useT } from "@/lib/i18n";

export type LocationScope =
  | { mode: "mine" }
  | { mode: "country" }
  | { mode: "provinces"; provinces: string[] };

export function locationScopeLabel(scope: LocationScope, fallbackCityLabel: string): string {
  if (scope.mode === "country") return t("locScopeCountry");
  if (scope.mode === "provinces") {
    if (scope.provinces.length === 1) return scope.provinces[0];
    return `${scope.provinces.length} ${t("provincesCountSuffix")}`;
  }
  return fallbackCityLabel;
}

export function LocationScopeButton({
  scope,
  onChange,
  fallbackCityLabel,
  icon,
}: {
  scope: LocationScope;
  onChange: (next: LocationScope) => void;
  fallbackCityLabel: string;
  icon?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="press inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[10px] font-medium backdrop-blur-sm"
      >
        <Icon name={icon ?? (scope.mode === "country" ? "tourism" : "pin")} size={10} />
        {locationScopeLabel(scope, fallbackCityLabel)}
        <Icon name="chevronDown" size={10} className="opacity-70" />
      </button>
      {open && (
        <LocationScopeSheet
          scope={scope}
          fallbackCityLabel={fallbackCityLabel}
          onClose={() => setOpen(false)}
          onChange={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function LocationScopeSheet({
  scope,
  fallbackCityLabel,
  onClose,
  onChange,
}: {
  scope: LocationScope;
  fallbackCityLabel: string;
  onClose: () => void;
  onChange: (next: LocationScope) => void;
}) {
  useModalBackButton(true, onClose);
  const tr = useT();
  const [draftProvinces, setDraftProvinces] = useState<string[]>(
    scope.mode === "provinces" ? scope.provinces : [],
  );
  const [pickingProvinces, setPickingProvinces] = useState(scope.mode === "provinces");

  function toggleProvince(p: string) {
    setDraftProvinces((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[80vh] overflow-y-auto rounded-t-3xl bg-background p-5 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">{tr("locScopeSheetTitle")}</h2>
          <button
            onClick={onClose}
            className="rounded-xl border border-border p-2 text-muted-foreground"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {!pickingProvinces ? (
          <div className="space-y-2.5">
            <button
              onClick={() => onChange({ mode: "mine" })}
              className={`press flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${
                scope.mode === "mine" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <Icon name="pin" size={18} className="shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground">{tr("locScopeMine")}</div>
                <div className="truncate text-xs text-muted-foreground">{fallbackCityLabel}</div>
              </div>
            </button>
            <button
              onClick={() => onChange({ mode: "country" })}
              className={`press flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${
                scope.mode === "country" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <Icon name="tourism" size={18} className="shrink-0 text-primary" />
              <div className="text-sm font-bold text-foreground">{tr("locScopeCountry")}</div>
            </button>
            <button
              onClick={() => setPickingProvinces(true)}
              className={`press flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${
                scope.mode === "provinces" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <Icon name="map" size={18} className="shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground">{tr("locScopeProvinces")}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {scope.mode === "provinces" && scope.provinces.length > 0
                    ? scope.provinces.join(", ")
                    : tr("locScopeSelectHint")}
                </div>
              </div>
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {PROVINCES_MZ.map((p) => {
                const checked = draftProvinces.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => toggleProvince(p)}
                    className={`press flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-medium ${
                      checked
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-foreground"
                    }`}
                  >
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded-md border ${
                        checked ? "border-primary bg-primary" : "border-border"
                      }`}
                    >
                      {checked && <Icon name="check" size={10} className="text-white" />}
                    </span>
                    <span className="truncate">{p}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={() => setPickingProvinces(false)}
                className="press flex-1 rounded-2xl border border-border py-3 text-sm font-semibold text-muted-foreground"
              >
                {tr("back")}
              </button>
              <button
                onClick={() => {
                  if (draftProvinces.length === 0) return;
                  onChange({ mode: "provinces", provinces: draftProvinces });
                }}
                disabled={draftProvinces.length === 0}
                className="press flex-1 rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-40"
                style={{ background: "var(--gradient-primary)" }}
              >
                {tr("applyAction")} {draftProvinces.length > 0 ? `(${draftProvinces.length})` : ""}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
