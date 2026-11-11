// ============================================================
// SPOTTER — "Ver publicações" no perfil do comerciante
// ------------------------------------------------------------
// Botão + folha que desliza de baixo com as publicações visíveis do negócio,
// cada uma com o carrossel de fotos. Só mostra o que está publicado agora
// (a base de dados já esconde o que ainda não saiu ou já foi removido).
// ============================================================
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { ReportButton } from "@/components/ReportButton";
import { fetchBusinessEvents, formatEventDates, type SpotterEvent } from "@/lib/posts-events-db";
import { useT } from "@/lib/i18n";
import { isUuid } from "@/lib/supabase";

interface Theme {
  accent: string;
  accentSoft: string;
  border: string;
  text: string;
  sub: string;
}

export function BusinessPublications({
  businessId,
  businessName,
  theme,
}: {
  businessId: string;
  businessName: string;
  theme: Theme;
}) {
  const tr = useT();
  const [items, setItems] = useState<SpotterEvent[] | null>(null);
  const [open, setOpen] = useState(false);
  const valid = isUuid(businessId);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    fetchBusinessEvents(businessId).then((list) => {
      if (!cancelled) setItems(list);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, valid]);

  // Sem ligação à base de dados (negócio de demonstração): não mostra nada.
  if (!valid || items === null) return null;

  return (
    <>
      <div className="mt-3 px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="press flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold"
          style={{
            border: `1px solid ${theme.border}`,
            background: theme.accentSoft,
            color: theme.accent,
          }}
        >
          <Icon name="image" size={15} /> {tr("viewPostsLabel")}
          {items.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{ background: theme.accent, color: "#fff" }}
            >
              {items.length}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-background pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glass-bar sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
              <div className="min-w-0">
                <div className="truncate text-base font-bold text-foreground">{businessName}</div>
                <div className="text-xs text-muted-foreground">{tr("viewPostsLabel")}</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="press rounded-full p-2 text-foreground"
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            {items.length === 0 && (
              <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                Este negócio não tem publicações de momento.
              </p>
            )}

            <div className="space-y-5 px-4 pt-4">
              {items.map((ev) => (
                <article
                  key={ev.id}
                  className="overflow-hidden rounded-2xl border border-border bg-card"
                >
                  <PhotoCarousel photos={ev.photoUrls} alt={ev.title} />
                  <div className="space-y-2 p-4">
                    <h3 className="text-base font-bold text-foreground">{ev.title}</h3>
                    {formatEventDates(ev.eventDate, ev.eventEndDate) && (
                      <p className="text-xs text-muted-foreground">
                        {formatEventDates(ev.eventDate, ev.eventEndDate)}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {ev.ticketPhone && (
                        <a
                          href={`tel:${ev.ticketPhone}`}
                          className="press rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground"
                        >
                          Ligar
                        </a>
                      )}
                      {ev.ticketLink && (
                        <a
                          href={ev.ticketLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="press rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground"
                        >
                          Bilhetes
                        </a>
                      )}
                      <span className="ml-auto text-muted-foreground">
                        <ReportButton kind="event" targetId={ev.id} />
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
