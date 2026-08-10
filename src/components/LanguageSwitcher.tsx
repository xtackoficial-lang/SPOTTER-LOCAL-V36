// ============================================================
// SPOTTER — Componente de selecção de idioma (para uso global)
// ============================================================
import { useLocale, LOCALE_LABELS, LOCALE_LIST } from "@/lib/i18n";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const [locale, setLocale] = useLocale();

  return (
    <div className={`flex gap-1.5 items-center ${className}`}>
      {LOCALE_LIST.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={`press rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            locale === l
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
          title={LOCALE_LABELS[l]}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// Selector compacto (dropdown) para mobile
export function LanguageDropdown({ className = "" }: { className?: string }) {
  const [locale, setLocale] = useLocale();

  return (
    <select
      className={`h-9 rounded-xl border border-input bg-card px-2 text-xs text-foreground outline-none focus:border-primary ${className}`}
      value={locale}
      onChange={(e) => setLocale(e.target.value as typeof locale)}
    >
      {LOCALE_LIST.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
