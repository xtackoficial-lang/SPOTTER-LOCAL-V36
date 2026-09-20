// ============================================================
// SPOTTER — Lista de quartos de um negócio (cliente)
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { fetchActiveRooms, type BusinessRoom } from "@/lib/reservations-db";

export const Route = createFileRoute("/rooms/$businessId")({
  head: () => ({ meta: [{ title: "Quartos disponíveis — Spotter Local" }] }),
  component: RoomsListPage,
});

function RoomsListPage() {
  const { businessId } = Route.useParams();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const reload = () =>
      fetchActiveRooms(businessId).then((list) => {
        setRooms(list);
        setLoading(false);
      });
    reload();

    // Tempo real: se outro cliente reservar entretanto, ou o comerciante
    // marcar "ocupado"/desativar, a lista actualiza sozinha (evita o
    // cliente tentar reservar algo que acabou de deixar de estar livre).
    if (!SUPABASE_CONFIGURED || !supabase) return;
    const channel = supabase
      .channel(`rooms-list:${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "business_rooms",
          filter: `business_id=eq.${businessId}`,
        },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
  }, [businessId]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <button
          onClick={() => navigate({ to: "/place/$id", params: { id: businessId } })}
          className="press rounded-full p-1"
        >
          <Icon name="chevronLeft" size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Quartos disponíveis</h1>
      </div>

      <div className="mx-auto max-w-md px-4 py-6 space-y-3">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground">A carregar…</p>
        ) : rooms.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Este negócio ainda não tem quartos disponíveis.
          </p>
        ) : (
          rooms.map((room) => {
            const isOccupied = !!room.occupiedUntil && room.occupiedUntil >= today;
            return (
              <div key={room.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex gap-3">
                  <div className="h-20 w-20 flex-none overflow-hidden rounded-xl bg-background">
                    {room.photoUrl && (
                      <img
                        src={room.photoUrl}
                        alt={room.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-foreground">{room.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {room.capacity} pessoas · {room.pricePerNight} MT/noite
                    </p>
                    {isOccupied && (
                      <p className="mt-1 text-xs font-semibold text-amber-600">
                        Indisponível até {room.occupiedUntil}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() =>
                    !isOccupied &&
                    navigate({ to: "/reserve-room/$roomId", params: { roomId: room.id } })
                  }
                  disabled={isOccupied}
                  className="press mt-3 h-10 w-full rounded-full text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  style={{ background: isOccupied ? undefined : "var(--gradient-primary)" }}
                >
                  {isOccupied ? "Indisponível" : "Reservar"}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
