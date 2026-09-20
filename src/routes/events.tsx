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
import { fetchActiveEvents, type SpotterEvent } from "@/lib/posts-events-db";
import { PROVINCES_MZ, citiesForProvince } from "@/lib/mozambique-locations";

export const Route = createFileRoute("/events")({
  head: () => ({ meta: [{ title: "Eventos — Spotter Local" }] }),
  component: EventsPage,
});

function EventsPage() {
  const [events, setEvents] = useState<SpotterEvent[]>([]);
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
            <img src={ev.posterUrl} alt={ev.title} className="h-56 w-full object-cover" />
            <div className="space-y-2 p-4">
              <h2 className="text-base font-bold text-foreground">{ev.title}</h2>
              <p className="text-xs text-muted-foreground">
                {ev.businessName}
                {ev.city ? ` · ${ev.city}` : ""}
                {ev.eventDate ? ` · ${new Date(ev.eventDate).toLocaleDateString("pt-MZ")}` : ""}
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
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
