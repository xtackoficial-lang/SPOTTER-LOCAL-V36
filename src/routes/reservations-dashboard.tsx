// ============================================================
// SPOTTER — Reservas (dashboard do comerciante)
// ------------------------------------------------------------
// Lista os pedidos de quarto (pendentes primeiro, com Aceitar/Recusar)
// e as reservas de mesa (já confirmadas automaticamente). Permite
// marcar "reembolso feito" (quarto recusado) e "repassado" (mesa).
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import {
  fetchRoomReservationsForBusiness,
  fetchTableReservationsForBusiness,
  respondToRoomReservation,
  markRoomReservationRefunded,
  markTableReservationRepassado,
  ROOM_REJECTION_REASONS,
  type RoomReservation,
  type TableReservation,
} from "@/lib/reservations-db";
import { useOnboarding } from "@/lib/onboarding-storage";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { RequireBusiness } from "@/components/RequireBusiness";

export const Route = createFileRoute("/reservations-dashboard")({
  head: () => ({ meta: [{ title: "Reservas — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <ReservationsDashboardPage />
    </RequireBusiness>
  ),
});

function statusLabel(status: RoomReservation["status"]): { text: string; className: string } {
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

function RoomReservationCard({
  reservation,
  onChanged,
}: {
  reservation: RoomReservation;
  onChanged: () => void;
}) {
  const [showReasons, setShowReasons] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badge = statusLabel(reservation.status);

  const handleAccept = async () => {
    setBusy(true);
    setError(null);
    const res = await respondToRoomReservation(reservation.id, "accept");
    if (!res.ok) setError(res.error ?? "Falha ao aceitar.");
    setBusy(false);
    onChanged();
  };

  const handleReject = async (reason: string) => {
    setBusy(true);
    setError(null);
    const res = await respondToRoomReservation(reservation.id, "reject", reason);
    if (!res.ok) setError(res.error ?? "Falha ao recusar.");
    setBusy(false);
    setShowReasons(false);
    onChanged();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">{reservation.roomName}</h3>
          <p className="text-xs text-muted-foreground">
            {reservation.checkIn} → {reservation.checkOut} ({reservation.nights} noites) ·{" "}
            {reservation.guests} hóspede(s)
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}>
          {badge.text}
        </span>
      </div>

      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        <p>
          Cliente: <b className="text-foreground">{reservation.clientName}</b> —{" "}
          {reservation.clientPhone}
        </p>
        {reservation.specialRequest && <p>Pedido: {reservation.specialRequest}</p>}
        <p>
          Valor total: <b className="text-foreground">{reservation.totalPrice} MT</b> · Comissão
          cobrada: {reservation.commissionAmount} MT
        </p>
        {reservation.status === "rejected" && reservation.rejectionReason && (
          <p className="text-red-600">Motivo: {reservation.rejectionReason}</p>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {reservation.status === "pending_approval" && (
        <div className="mt-3 space-y-2">
          {!showReasons ? (
            <div className="flex gap-2">
              <button
                onClick={() => setShowReasons(true)}
                disabled={busy}
                className="press h-10 flex-1 rounded-full border border-border text-xs font-semibold"
              >
                Recusar
              </button>
              <button
                onClick={handleAccept}
                disabled={busy}
                className="press h-10 flex-1 rounded-full text-xs font-semibold text-primary-foreground disabled:opacity-60"
                style={{ background: "var(--gradient-primary)" }}
              >
                Aceitar
              </button>
            </div>
          ) : (
            <div className="space-y-1.5 rounded-xl border border-border p-2">
              <p className="text-xs font-semibold text-foreground">Escolhe um motivo:</p>
              {ROOM_REJECTION_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => handleReject(reason)}
                  disabled={busy}
                  className="press block w-full rounded-lg border border-border px-2.5 py-2 text-left text-xs"
                >
                  {reason}
                </button>
              ))}
              <button
                onClick={() => setShowReasons(false)}
                className="press w-full rounded-lg py-1 text-xs text-muted-foreground"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {reservation.status === "rejected" && (
        <button
          onClick={async () => {
            await markRoomReservationRefunded(reservation.id);
            onChanged();
          }}
          disabled={reservation.refunded}
          className={`press mt-3 h-9 w-full rounded-full border text-xs font-semibold ${
            reservation.refunded
              ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-700"
              : "border-border"
          }`}
        >
          {reservation.refunded ? "✓ Reembolso feito" : "Marcar reembolso feito"}
        </button>
      )}
    </div>
  );
}

function TableReservationCard({
  reservation,
  onChanged,
}: {
  reservation: TableReservation;
  onChanged: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">
            Mesa para {reservation.guests} — {reservation.tipo === "evento" ? "Evento" : "Normal"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {reservation.reservationDate} às {reservation.timeSlot}
          </p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          Confirmada
        </span>
      </div>

      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        <p>
          Cliente: <b className="text-foreground">{reservation.clientName}</b> —{" "}
          {reservation.clientPhone}
        </p>
        {reservation.specialRequest && <p>Pedido: {reservation.specialRequest}</p>}
        <p>
          Valor pago: <b className="text-foreground">{reservation.price} MT</b> · A repassar:{" "}
          {reservation.payoutAmount} MT
        </p>
      </div>

      <button
        onClick={async () => {
          await markTableReservationRepassado(reservation.id);
          onChanged();
        }}
        disabled={reservation.repassado}
        className={`press mt-3 h-9 w-full rounded-full border text-xs font-semibold ${
          reservation.repassado
            ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-700"
            : "border-border"
        }`}
      >
        {reservation.repassado ? "✓ Repassado" : "Marcar repassado ao negócio"}
      </button>
    </div>
  );
}

function ReservationsDashboardPage() {
  const navigate = useNavigate();
  const { draft } = useOnboarding();
  const businessId = draft.business.businessId || "default";
  const [tab, setTab] = useState<"quartos" | "mesas">("quartos");
  const [rooms, setRooms] = useState<RoomReservation[]>([]);
  const [tables, setTables] = useState<TableReservation[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    Promise.all([
      fetchRoomReservationsForBusiness(businessId),
      fetchTableReservationsForBusiness(businessId),
    ]).then(([r, t]) => {
      setRooms(r);
      setTables(t);
      setLoading(false);
    });
  };

  useEffect(() => {
    reload();
    // Tempo real: quando chega um pedido novo (ou o estado muda), a
    // lista actualiza sozinha, sem precisar de reabrir o ecrã — mesmo
    // padrão/correcção já aplicado ao business-inbox.tsx (comentário
    // "BUG DO ABRÃO 2026-08-23"), reaplicado aqui para não repetir o erro.
    if (!SUPABASE_CONFIGURED || !supabase) return;
    const channel = supabase
      .channel(`reservations-dashboard:${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_reservations",
          filter: `business_id=eq.${businessId}`,
        },
        () => reload(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "table_reservations",
          filter: `business_id=eq.${businessId}`,
        },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Pendentes primeiro, como no resto do desenho combinado.
  const sortedRooms = [...rooms].sort((a, b) => {
    if (a.status === "pending_approval" && b.status !== "pending_approval") return -1;
    if (b.status === "pending_approval" && a.status !== "pending_approval") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <button onClick={() => navigate({ to: "/business" })} className="press rounded-full p-1">
          <Icon name="chevronLeft" size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Reservas</h1>
      </div>

      <div className="mx-auto max-w-md px-4 py-4">
        <div className="flex gap-2 rounded-full bg-muted p-1">
          <button
            onClick={() => setTab("quartos")}
            className={`press h-9 flex-1 rounded-full text-sm font-semibold ${
              tab === "quartos" ? "bg-card shadow-sm" : "text-muted-foreground"
            }`}
          >
            Quartos{" "}
            {rooms.filter((r) => r.status === "pending_approval").length > 0 &&
              `(${rooms.filter((r) => r.status === "pending_approval").length})`}
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
            sortedRooms.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                Ainda sem pedidos de quarto.
              </p>
            ) : (
              sortedRooms.map((r) => (
                <RoomReservationCard key={r.id} reservation={r} onChanged={reload} />
              ))
            )
          ) : tables.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">Ainda sem reservas de mesa.</p>
          ) : (
            tables.map((t) => (
              <TableReservationCard key={t.id} reservation={t} onChanged={reload} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
