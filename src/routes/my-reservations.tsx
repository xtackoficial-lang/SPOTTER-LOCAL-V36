// ============================================================
// SPOTTER — As minhas reservas (cliente)
// ------------------------------------------------------------
// Lista quartos + mesas do utilizador autenticado. O botão de WhatsApp
// só aparece depois do pagamento confirmado (nunca antes — decisão
// explícita do Abrão, 2026-09-18), usando o campo dedicado
// whatsapp_reservas de cada negócio (não o contacto geral do perfil).
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import {
  fetchMyRoomReservations,
  fetchMyTableReservations,
  fetchReservationSettings,
  buildPostPaymentWhatsAppLink,
  type RoomReservation,
  type TableReservation,
} from "@/lib/reservations-db";

export const Route = createFileRoute("/my-reservations")({
  head: () => ({ meta: [{ title: "As minhas reservas — Spotter Local" }] }),
  component: MyReservationsPage,
});

function roomStatusBadge(status: RoomReservation["status"]) {
  switch (status) {
    case "pending_approval":
      return { text: "Pendente", className: "bg-amber-500/10 text-amber-700" };
    case "confirmed":
      return { text: "Confirmada", className: "bg-emerald-500/10 text-emerald-700" };
    case "rejected":
      return { text: "Recusada", className: "bg-red-500/10 text-red-700" };
    default:
      return { text: status, className: "bg-muted text-muted-foreground" };
  }
}

function RoomCard({ r }: { r: RoomReservation }) {
  const [whatsappLink, setWhatsappLink] = useState<string | null>(null);
  const badge = roomStatusBadge(r.status);

  useEffect(() => {
    if (r.status !== "confirmed") return;
    fetchReservationSettings(r.businessId).then((s) => {
      if (s?.whatsappReservas) {
        setWhatsappLink(
          buildPostPaymentWhatsAppLink(
            s.whatsappReservas,
            "room",
            `${r.roomName ?? "quarto"} — ${r.checkIn} a ${r.checkOut}, ref. #${r.id.slice(0, 8)}`,
          ),
        );
      }
    });
  }, [r.status, r.businessId, r.id, r.roomName, r.checkIn, r.checkOut]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">{r.roomName ?? "Quarto"}</h3>
          <p className="text-xs text-muted-foreground">
            {r.checkIn} → {r.checkOut} ({r.nights} noites)
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}>
          {badge.text}
        </span>
      </div>
      {r.status === "rejected" && r.rejectionReason && (
        <p className="mt-2 text-xs text-red-600">
          Motivo: {r.rejectionReason} — o valor pago será reembolsado.
        </p>
      )}
      {whatsappLink && (
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="press mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/10 text-sm font-semibold text-emerald-700"
        >
          <Icon name="message" size={15} /> Falar no WhatsApp do hotel
        </a>
      )}
    </div>
  );
}

function TableCard({ r }: { r: TableReservation }) {
  const [whatsappLink, setWhatsappLink] = useState<string | null>(null);

  useEffect(() => {
    if (r.status !== "confirmed") return;
    fetchReservationSettings(r.businessId).then((s) => {
      if (s?.whatsappReservas) {
        setWhatsappLink(
          buildPostPaymentWhatsAppLink(
            s.whatsappReservas,
            "table",
            `${r.reservationDate} às ${r.timeSlot}`,
          ),
        );
      }
    });
  }, [r.status, r.businessId, r.reservationDate, r.timeSlot]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">Mesa para {r.guests}</h3>
          <p className="text-xs text-muted-foreground">
            {r.reservationDate} às {r.timeSlot}
          </p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          Confirmada
        </span>
      </div>
      {whatsappLink && (
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="press mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/10 text-sm font-semibold text-emerald-700"
        >
          <Icon name="message" size={15} /> Falar no WhatsApp
        </a>
      )}
    </div>
  );
}

function MyReservationsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"quartos" | "mesas">("quartos");
  const [rooms, setRooms] = useState<RoomReservation[]>([]);
  const [tables, setTables] = useState<TableReservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const reload = () =>
      Promise.all([fetchMyRoomReservations(user.id), fetchMyTableReservations(user.id)]).then(
        ([r, t]) => {
          setRooms(r);
          setTables(t);
          setLoading(false);
        },
      );
    reload();

    // Tempo real: quando o comerciante aceita/recusa um quarto, o
    // cliente vê o estado mudar sem ter de sair e voltar a este ecrã.
    if (!SUPABASE_CONFIGURED || !supabase) return;
    const channel = supabase
      .channel(`my-reservations:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_reservations",
          filter: `client_user_id=eq.${user.id}`,
        },
        () => reload(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "table_reservations",
          filter: `client_user_id=eq.${user.id}`,
        },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
  }, [user]);

  if (!authLoading && !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">Inicia sessão para ver as tuas reservas.</p>
        <button
          onClick={() => navigate({ to: "/login" })}
          className="press h-11 rounded-full px-6 text-sm font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          Iniciar sessão
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <button onClick={() => navigate({ to: "/home" })} className="press rounded-full p-1">
          <Icon name="chevronLeft" size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">As minhas reservas</h1>
      </div>

      <div className="mx-auto max-w-md px-4 py-4">
        <div className="flex gap-2 rounded-full bg-muted p-1">
          <button
            onClick={() => setTab("quartos")}
            className={`press h-9 flex-1 rounded-full text-sm font-semibold ${
              tab === "quartos" ? "bg-card shadow-sm" : "text-muted-foreground"
            }`}
          >
            Quartos
          </button>
          <button
            onClick={() => setTab("mesas")}
            className={`press h-9 flex-1 rounded-full text-sm font-semibold ${
              tab === "mesas" ? "bg-card shadow-sm" : "text-muted-foreground"
            }`}
          >
            Mesas
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground">A carregar…</p>
          ) : tab === "quartos" ? (
            rooms.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                Ainda sem reservas de quarto.
              </p>
            ) : (
              rooms.map((r) => <RoomCard key={r.id} r={r} />)
            )
          ) : tables.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">Ainda sem reservas de mesa.</p>
          ) : (
            tables.map((t) => <TableCard key={t.id} r={t} />)
          )}
        </div>
      </div>
    </div>
  );
}
