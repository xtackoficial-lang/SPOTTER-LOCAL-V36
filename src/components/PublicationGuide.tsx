// ============================================================
// SPOTTER — Ideias e regras do que se pode publicar (eventos e mais)
// Usado no painel do comerciante (fechado) e na página de publicar (aberto).
// ============================================================
import {
  PUBLICATION_IDEAS,
  PUBLICATION_RULES,
  PUBLICATION_ENFORCEMENT,
} from "@/lib/publication-rules";
import { useT } from "@/lib/i18n";

export function PublicationGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const tr = useT();
  return (
    <details
      open={defaultOpen}
      className="rounded-2xl border border-border bg-card px-4 py-3 text-left"
    >
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        {tr("postIdeasLabel")}
      </summary>
      <div className="mt-3 space-y-3 text-xs leading-snug">
        <div>
          <div className="mb-1 font-bold text-emerald-700">✔ Podes publicar</div>
          <ul className="space-y-1 text-muted-foreground">
            {PUBLICATION_IDEAS.map((t) => (
              <li key={t}>• {t}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 font-bold text-destructive">✘ Não podes publicar</div>
          <ul className="space-y-1 text-muted-foreground">
            {PUBLICATION_RULES.map((t) => (
              <li key={t}>• {t}</li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-muted-foreground">{PUBLICATION_ENFORCEMENT}</p>
      </div>
    </details>
  );
}
