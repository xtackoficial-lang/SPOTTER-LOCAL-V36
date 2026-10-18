// ============================================================
// SPOTTER — Aba pública "Eventos"
// ------------------------------------------------------------
// Lista cartazes activos (events.status = 'active'), destacados
// primeiro. Qualquer visitante vê — publicar exige conta comercial
// (ver /publish-event), mas ver é aberto a todos.
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import {
  fetchActiveEvents,
  formatEventDates,
  todayLocalISO,
  type SpotterEvent,
} from "@/lib/posts-events-db";
import { PROVINCES_MZ, citiesForProvince } from "@/lib/mozambique-locations";

export const Route = createFileRoute("/events")({
  head: () => ({ meta: [{ title: "Eventos — Spotter Local" }] }),
  component: EventsPage,
});

async function shareEvent(ev: SpotterEvent): Promise<"shared" | "copied" | "none"> {
  const dates = formatEventDates(ev.eventDate, ev.eventEndDate);
  const text = `${ev.title} — ${ev.businessName}${dates ? ` · ${dates}` : ""} (Spotter Local)`;
  const url = `${window.location.origin}/events`;
  try {
    if (navigator.share) {
      await navigator.share({ title: ev.title, text, url });
      return "shared";
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${text} ${url}`);
      return "copied";
    }
  } catch {
    /* partilha cancelada */
  }
  return "none";
}

function EventsPage() {
  const [events, setEvents] = useState<SpotterEvent[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const today = todayLocalISO();
  const [loading, setLoading] = useState(true);
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    setLoading(true);
    fetchActiveEvents(city || undefined)
      .then(setEvents)
      .finally(() => setLoading(false));
  }, [city]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <h1 className="text-lg font-bold text-foreground">Eventos</h1>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select
            value={province}
            onChange={(e) => {
              setProvince(e.target.value);
              setCity("");
            }}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            <option value="">Todas as províncias</option>
            {PROVINCES_MZ.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={!province}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
          >
            <option value="">Todas as cidades</option>
            {citiesForProvince(province).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 py-4 space-y-4">
        {loading && <p className="py-10 text-center text-sm text-muted-foreground">A carregar…</p>}

        {!loading && events.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Icon name="calendar" size={32} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum evento activo por agora.</p>
          </div>
        )}

        {events.map((ev) => (
          <div key={ev.id} className="overflow-hidden rounded-2xl border border-border bg-card">
            {ev.tier === "featured" && (
              <div className="bg-primary px-3 py-1 text-center text-xs font-bold text-primary-foreground">
                DESTAQUE
              </div>
            )}
            <img
              loading="lazy"
              decoding="async"
              src={ev.posterUrl}
              alt={ev.title}
              className="h-56 w-full object-cover"
            />
            <div className="space-y-2 p-4">
              <h2 className="text-base font-bold text-foreground">{ev.title}</h2>
              {ev.eventDate &&
                ev.eventDate <= today &&
                (ev.eventEndDate ?? ev.eventDate) >= today && (
                  <span className="inline-block rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                    A DECORRER
                  </span>
                )}
              <p className="text-xs text-muted-foreground">
                {ev.businessName}
                {ev.city ? ` · ${ev.city}` : ""}
                {ev.eventDate || ev.eventEndDate
                  ? ` · ${formatEventDates(ev.eventDate, ev.eventEndDate)}`
                  : ""}
              </p>
              <div className="flex gap-2 pt-1">
                {ev.ticketPhone && (
                  <a
                    href={`https://wa.me/${ev.ticketPhone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="press flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white"
                  >
                    WhatsApp
                  </a>
                )}
                {ev.ticketLink && (
                  <a
                    href={ev.ticketLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="press flex-1 rounded-xl border border-border px-3 py-2 text-center text-sm font-semibold text-foreground"
                  >
                    Comprar bilhete
                  </a>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    if ((await shareEvent(ev)) === "copied") {
                      setCopiedId(ev.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    }
                  }}
                  className="press rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground"
                >
                  {copiedId === ev.id ? "Copiado!" : "Partilhar"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
