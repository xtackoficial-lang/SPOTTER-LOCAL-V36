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
  formatResponseDeadline,
} from "@/lib/reservations-db";
import {
  EMPTY_ROOM_FILTERS,
  EMPTY_TABLE_FILTERS,
  countRoomStatuses,
  countTableStatuses,
  filterRoomReservations,
  filterTableReservations,
  roomFiltersActive,
  roomReservationsToCsv,
  summarizeRooms,
  summarizeTables,
  tableFiltersActive,
  tableReservationsToCsv,
  type RoomFilters,
  type TableFilters,
} from "@/lib/reservation-filters";
import {
  AdvancedPanel,
  DateRange,
  SearchBox,
  SelectField,
  StatusChips,
  SummaryStrip,
  downloadCsv,
} from "@/components/ReservationFilters";
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
          Valor total: <b className="text-foreground">{reservation.totalPrice} MT</b> · Cliente
          pagou {reservation.amountPaid} MT (
          {reservation.paymentOption === "full" ? "valor total" : "sinal de 20%"})
        </p>
        <p>
          Restante a receber no check-in:{" "}
          <b className="text-foreground">{reservation.balanceDue} MT</b>
        </p>
        {reservation.status === "pending_approval" && reservation.responseDeadline && (
          <p
            className={
              new Date(reservation.responseDeadline).getTime() < Date.now()
                ? "font-semibold text-red-600"
                : "font-semibold text-amber-700"
            }
          >
            {new Date(reservation.responseDeadline).getTime() < Date.now()
              ? "Prazo de resposta excedido — responde já"
              : `Responder até ${formatResponseDeadline(reservation.responseDeadline)}`}
          </p>
        )}
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

  // Filtros (pedido do Abrão, 2026-10-01): pesquisa por nome/telefone/quarto,
  // estado com contagem, datas, opção de pagamento e ordenação. O padrão
  // continua a ser "pendentes primeiro".
  const [roomFilters, setRoomFilters] = useState<RoomFilters>(EMPTY_ROOM_FILTERS);
  const [tableFilters, setTableFilters] = useState<TableFilters>(EMPTY_TABLE_FILTERS);
  const roomCounts = countRoomStatuses(rooms);
  const tableCounts = countTableStatuses(tables);
  const shownRooms = filterRoomReservations(rooms, roomFilters);
  const shownTables = filterTableReservations(tables, tableFilters);
  const roomSummary = summarizeRooms(shownRooms);
  const tableSummary = summarizeTables(shownTables);
  const mt = (n: number) => `${Math.round(n * 100) / 100} MT`;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <button onClick={() => navigate({ to: "/business" })} className="press rounded-full p-1">
          <Icon name="chevronLeft" size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Reservas</h1>
      </div>

      <div className="mx-auto max-w-md px-4 py-4 md:max-w-3xl lg:max-w-5xl">
        <div className="flex gap-2 rounded-full bg-muted p-1 md:max-w-md">
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

        {!loading && tab === "quartos" && rooms.length > 0 && (
          <div className="mt-4 space-y-3">
            <SearchBox
              value={roomFilters.search}
              onChange={(search) => setRoomFilters({ ...roomFilters, search })}
              placeholder="Pesquisar nome, telefone, quarto ou ref."
            />
            <StatusChips
              value={roomFilters.status}
              onChange={(status) => setRoomFilters({ ...roomFilters, status })}
              options={[
                { id: "all", label: "Todas", count: roomCounts.all },
                { id: "pending", label: "Pendentes", count: roomCounts.pending },
                { id: "overdue", label: "Prazo excedido", count: roomCounts.overdue, urgent: true },
                { id: "confirmed", label: "Confirmadas", count: roomCounts.confirmed },
                { id: "rejected", label: "Recusadas", count: roomCounts.rejected },
                {
                  id: "refund_todo",
                  label: "Reembolso por fazer",
                  count: roomCounts.refund_todo,
                  urgent: true,
                },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <AdvancedPanel
                activeCount={
                  (roomFilters.payment !== "all" ? 1 : 0) +
                  (roomFilters.from || roomFilters.to ? 1 : 0) +
                  (roomFilters.sort !== "pending" ? 1 : 0)
                }
              >
                <SelectField
                  label="Pagamento"
                  value={roomFilters.payment}
                  onChange={(payment) => setRoomFilters({ ...roomFilters, payment })}
                  options={[
                    { id: "all", label: "Todos" },
                    { id: "deposit", label: "Sinal de 20%" },
                    { id: "full", label: "Pago a 100%" },
                  ]}
                />
                <SelectField
                  label="Ordenar por"
                  value={roomFilters.sort}
                  onChange={(sort) => setRoomFilters({ ...roomFilters, sort })}
                  options={[
                    { id: "pending", label: "Pendentes primeiro" },
                    { id: "recent", label: "Mais recentes" },
                    { id: "checkin", label: "Check-in mais próximo" },
                    { id: "amount", label: "Maior valor" },
                  ]}
                />
                <DateRange
                  label="Data de check-in"
                  from={roomFilters.from}
                  to={roomFilters.to}
                  onChange={(from, to) => setRoomFilters({ ...roomFilters, from, to })}
                />
              </AdvancedPanel>
              {roomFiltersActive(roomFilters) && (
                <button
                  type="button"
                  onClick={() => setRoomFilters(EMPTY_ROOM_FILTERS)}
                  className="press h-9 rounded-full px-3 text-xs font-semibold text-primary"
                >
                  Limpar filtros
                </button>
              )}
              <button
                type="button"
                disabled={shownRooms.length === 0}
                onClick={() =>
                  downloadCsv(
                    `reservas-quartos-${new Date().toISOString().slice(0, 10)}.csv`,
                    roomReservationsToCsv(shownRooms),
                  )
                }
                className="press ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground disabled:opacity-40"
              >
                <Icon name="download" size={13} /> Exportar ({shownRooms.length})
              </button>
            </div>
            <SummaryStrip
              items={[
                { label: "Reservas", value: String(roomSummary.count) },
                { label: "Pago pelos clientes", value: mt(roomSummary.paid) },
                { label: "A cobrar no check-in", value: mt(roomSummary.balance) },
                {
                  label: "A reembolsar",
                  value: mt(roomSummary.toRefund),
                  warn: roomSummary.toRefund > 0,
                },
              ]}
            />
          </div>
        )}

        {!loading && tab === "mesas" && tables.length > 0 && (
          <div className="mt-4 space-y-3">
            <SearchBox
              value={tableFilters.search}
              onChange={(search) => setTableFilters({ ...tableFilters, search })}
              placeholder="Pesquisar nome, telefone, hora ou ref."
            />
            <StatusChips
              value={tableFilters.status}
              onChange={(status) => setTableFilters({ ...tableFilters, status })}
              options={[
                { id: "all", label: "Todas", count: tableCounts.all },
                { id: "confirmed", label: "Confirmadas", count: tableCounts.confirmed },
                {
                  id: "payout_todo",
                  label: "Repasse por fazer",
                  count: tableCounts.payout_todo,
                  urgent: true,
                },
                { id: "cancelled", label: "Canceladas", count: tableCounts.cancelled },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <AdvancedPanel
                activeCount={
                  (tableFilters.tipo !== "all" ? 1 : 0) +
                  (tableFilters.from || tableFilters.to ? 1 : 0) +
                  (tableFilters.sort !== "recent" ? 1 : 0)
                }
              >
                <SelectField
                  label="Tipo"
                  value={tableFilters.tipo}
                  onChange={(tipo) => setTableFilters({ ...tableFilters, tipo })}
                  options={[
                    { id: "all", label: "Todos" },
                    { id: "normal", label: "Normal" },
                    { id: "evento", label: "Evento" },
                  ]}
                />
                <SelectField
                  label="Ordenar por"
                  value={tableFilters.sort}
                  onChange={(sort) => setTableFilters({ ...tableFilters, sort })}
                  options={[
                    { id: "recent", label: "Mais recentes" },
                    { id: "date", label: "Data da reserva" },
                    { id: "amount", label: "Maior valor" },
                  ]}
                />
                <DateRange
                  label="Data da reserva"
                  from={tableFilters.from}
                  to={tableFilters.to}
                  onChange={(from, to) => setTableFilters({ ...tableFilters, from, to })}
                />
              </AdvancedPanel>
              {tableFiltersActive(tableFilters) && (
                <button
                  type="button"
                  onClick={() => setTableFilters(EMPTY_TABLE_FILTERS)}
                  className="press h-9 rounded-full px-3 text-xs font-semibold text-primary"
                >
                  Limpar filtros
                </button>
              )}
              <button
                type="button"
                disabled={shownTables.length === 0}
                onClick={() =>
                  downloadCsv(
                    `reservas-mesas-${new Date().toISOString().slice(0, 10)}.csv`,
                    tableReservationsToCsv(shownTables),
                  )
                }
                className="press ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground disabled:opacity-40"
              >
                <Icon name="download" size={13} /> Exportar ({shownTables.length})
              </button>
            </div>
            <SummaryStrip
              items={[
                { label: "Reservas", value: String(tableSummary.count) },
                { label: "Pessoas", value: String(tableSummary.guests) },
                { label: "Pago pelos clientes", value: mt(tableSummary.paid) },
                {
                  label: "A receber (repasse)",
                  value: mt(tableSummary.toReceive),
                  warn: tableSummary.toReceive > 0,
                },
              ]}
            />
          </div>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {loading ? (
            <p className="text-center text-sm text-muted-foreground lg:col-span-2">A carregar…</p>
          ) : tab === "quartos" ? (
            rooms.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground lg:col-span-2">
                Ainda sem pedidos de quarto.
              </p>
            ) : shownRooms.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground lg:col-span-2">
                Nenhuma reserva com estes filtros.
              </p>
            ) : (
              shownRooms.map((r) => (
                <RoomReservationCard key={r.id} reservation={r} onChanged={reload} />
              ))
            )
          ) : tables.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground lg:col-span-2">
              Ainda sem reservas de mesa.
            </p>
          ) : shownTables.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground lg:col-span-2">
              Nenhuma reserva com estes filtros.
            </p>
          ) : (
            shownTables.map((t) => (
              <TableReservationCard key={t.id} reservation={t} onChanged={reload} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
