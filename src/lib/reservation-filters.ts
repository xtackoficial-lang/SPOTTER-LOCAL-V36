// ============================================================
// Filtros, pesquisa, totais e exportação das reservas (v37)
// Funções PURAS (sem React nem Supabase) para serem fáceis de testar.
// Usadas em /reservations-dashboard (hotel/restaurante) e /my-reservations.
// ============================================================
import type { RoomReservation, TableReservation } from "./reservations-db";

// ---------- texto ----------
/** minúsculas e sem acentos: "João" → "joao". */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** só dígitos, sem o indicativo de Moçambique: "+258 84 111 1111" → "841111111". */
export function normalizePhone(s: string | null | undefined): string {
  let d = (s ?? "").replace(/\D/g, "");
  if (d.startsWith("00258")) d = d.slice(5);
  else if (d.startsWith("258") && d.length > 9) d = d.slice(3);
  return d;
}

/**
 * Pesquisa por palavras: TODAS as palavras têm de existir em algum campo
 * (sem acentos, sem maiúsculas). Se a palavra for só números (≥3 dígitos)
 * também compara com o telefone sem formatação (+258, espaços, hífens).
 * Assinatura: (campos, telefone, pesquisa) — usada em /my-reservations
 * e /reservations-dashboard.
 */
export function matchesQuery(
  fields: Array<string | number | null | undefined>,
  phone: string | null | undefined,
  query: string,
): boolean {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = normalizeText(
    fields.filter((x) => x !== null && x !== undefined && x !== "").join(" | "),
  );
  const ph = normalizePhone(phone);
  return tokens.every((t) => {
    if (hay.includes(t)) return true;
    const digits = t.replace(/\D/g, "");
    return digits.length >= 3 && digits === t && ph.includes(normalizePhone(digits));
  });
}

function inRange(date: string, from: string, to: string): boolean {
  const d = (date ?? "").slice(0, 10);
  if (!d) return !from && !to;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

// ---------- QUARTOS ----------
export type RoomStatusFilter =
  | "all"
  | "pending" // à espera de resposta
  | "overdue" // à espera E prazo excedido
  | "confirmed"
  | "rejected"
  | "refund_todo"; // recusadas com reembolso por fazer
export type PaymentFilter = "all" | "full" | "deposit";
export type RoomSort = "pending" | "recent" | "checkin" | "amount";

export interface RoomFilters {
  search: string;
  status: RoomStatusFilter;
  payment: PaymentFilter;
  /** Check-in entre estas datas (YYYY-MM-DD, inclusivo). */
  from: string;
  to: string;
  sort: RoomSort;
}

export const EMPTY_ROOM_FILTERS: RoomFilters = {
  search: "",
  status: "all",
  payment: "all",
  from: "",
  to: "",
  sort: "pending", // pendentes primeiro (mais urgentes no topo)
};

export function isRoomOverdue(r: RoomReservation, now = Date.now()): boolean {
  return (
    r.status === "pending_approval" &&
    !!r.responseDeadline &&
    new Date(r.responseDeadline).getTime() < now
  );
}

export function roomStatusMatches(
  r: RoomReservation,
  status: RoomStatusFilter,
  now = Date.now(),
): boolean {
  switch (status) {
    case "all":
      return true;
    case "pending":
      return r.status === "pending_approval";
    case "overdue":
      return isRoomOverdue(r, now);
    case "confirmed":
      return r.status === "confirmed";
    case "rejected":
      return r.status === "rejected";
    case "refund_todo":
      return r.status === "rejected" && !r.refunded;
  }
}

export function filterRoomReservations(
  list: RoomReservation[],
  f: RoomFilters,
  now = Date.now(),
): RoomReservation[] {
  const out = list.filter((r) => {
    if (!roomStatusMatches(r, f.status, now)) return false;
    if (f.payment !== "all" && r.paymentOption !== f.payment) return false;
    if ((f.from || f.to) && !inRange(r.checkIn, f.from, f.to)) return false;
    return matchesQuery(
      [
        r.clientName,
        r.clientEmail,
        r.roomName,
        r.specialRequest,
        r.clientPhone,
        r.checkIn,
        r.checkOut,
        r.id,
        r.id.slice(0, 8),
      ],
      r.clientPhone,
      f.search,
    );
  });
  const by = (a: RoomReservation, b: RoomReservation) => {
    if (f.sort === "pending") {
      const pa = a.status === "pending_approval" ? 0 : 1;
      const pb = b.status === "pending_approval" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (pa === 0) {
        // dentro das pendentes: prazo mais próximo primeiro
        const da = a.responseDeadline ? new Date(a.responseDeadline).getTime() : Infinity;
        const db = b.responseDeadline ? new Date(b.responseDeadline).getTime() : Infinity;
        if (da !== db) return da - db;
      }
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    }
    if (f.sort === "checkin") return (a.checkIn ?? "").localeCompare(b.checkIn ?? "");
    if (f.sort === "amount") return (b.totalPrice ?? 0) - (a.totalPrice ?? 0);
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? ""); // recent
  };
  return out.sort(by);
}

export function countRoomStatuses(list: RoomReservation[], now = Date.now()) {
  return {
    all: list.length,
    pending: list.filter((r) => r.status === "pending_approval").length,
    overdue: list.filter((r) => isRoomOverdue(r, now)).length,
    confirmed: list.filter((r) => r.status === "confirmed").length,
    rejected: list.filter((r) => r.status === "rejected").length,
    refund_todo: list.filter((r) => r.status === "rejected" && !r.refunded).length,
  };
}

export function summarizeRooms(list: RoomReservation[]) {
  const live = list.filter((r) => r.status !== "rejected");
  return {
    count: list.length,
    /** Já pago pelos clientes (reservas não recusadas). */
    paid: live.reduce((s, r) => s + (r.amountPaid ?? 0), 0),
    /** Ainda por receber no check-in. */
    balance: live.reduce((s, r) => s + (r.balanceDue ?? 0), 0),
    /** Recusadas com dinheiro por devolver. */
    toRefund: list
      .filter((r) => r.status === "rejected" && !r.refunded)
      .reduce((s, r) => s + (r.amountPaid ?? 0), 0),
  };
}

/** true se algum filtro (incluindo ordenação) é diferente do padrão. */
export function roomFiltersActive(f: RoomFilters): boolean {
  return (
    !!f.search.trim() ||
    f.status !== "all" ||
    f.payment !== "all" ||
    !!f.from ||
    !!f.to ||
    f.sort !== "pending"
  );
}

// ---------- MESAS ----------
export type TableStatusFilter = "all" | "confirmed" | "payout_todo" | "cancelled";
export type TableKind = "all" | "normal" | "evento";
export type TableSort = "recent" | "date" | "amount";

export interface TableFilters {
  search: string;
  /** payout_todo = confirmada com repasse ao comerciante ainda por fazer. */
  status: TableStatusFilter;
  tipo: TableKind;
  /** Data da reserva entre (YYYY-MM-DD, inclusivo). */
  from: string;
  to: string;
  sort: TableSort;
}

export const EMPTY_TABLE_FILTERS: TableFilters = {
  search: "",
  status: "all",
  tipo: "all",
  from: "",
  to: "",
  sort: "recent",
};

export function filterTableReservations(
  list: TableReservation[],
  f: TableFilters,
): TableReservation[] {
  const out = list.filter((t) => {
    if (f.status === "confirmed" && t.status !== "confirmed") return false;
    if (f.status === "payout_todo" && !(t.status === "confirmed" && !t.repassado)) return false;
    if (f.status === "cancelled" && t.status !== "cancelled") return false;
    if (f.tipo !== "all" && t.tipo !== f.tipo) return false;
    if ((f.from || f.to) && !inRange(t.reservationDate, f.from, f.to)) return false;
    return matchesQuery(
      [
        t.clientName,
        t.clientEmail,
        t.specialRequest,
        t.timeSlot,
        t.clientPhone,
        t.reservationDate,
        t.id,
        t.id.slice(0, 8),
      ],
      t.clientPhone,
      f.search,
    );
  });
  return out.sort((a, b) => {
    if (f.sort === "date")
      return (
        (a.reservationDate ?? "").localeCompare(b.reservationDate ?? "") ||
        (a.timeSlot ?? "").localeCompare(b.timeSlot ?? "")
      );
    if (f.sort === "amount") return (b.price ?? 0) - (a.price ?? 0);
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

export function countTableStatuses(list: TableReservation[]) {
  return {
    all: list.length,
    confirmed: list.filter((t) => t.status === "confirmed").length,
    payout_todo: list.filter((t) => t.status === "confirmed" && !t.repassado).length,
    cancelled: list.filter((t) => t.status === "cancelled").length,
  };
}

export function summarizeTables(list: TableReservation[]) {
  const live = list.filter((t) => t.status === "confirmed");
  return {
    count: list.length,
    guests: live.reduce((s, t) => s + (t.guests ?? 0), 0),
    paid: live.reduce((s, t) => s + (t.price ?? 0), 0),
    /** A receber da plataforma (repasse por fazer) — só confirmadas. */
    toReceive: live.filter((t) => !t.repassado).reduce((s, t) => s + (t.payoutAmount ?? 0), 0),
  };
}

export function tableFiltersActive(f: TableFilters): boolean {
  return (
    !!f.search.trim() ||
    f.status !== "all" ||
    f.tipo !== "all" ||
    !!f.from ||
    !!f.to ||
    f.sort !== "recent"
  );
}

// ---------- exportação CSV (abre bem no Excel pt: separador ";" + BOM) ----------
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function roomReservationsToCsv(list: RoomReservation[]): string {
  const head = [
    "Cliente",
    "Telefone",
    "E-mail",
    "Quarto",
    "Check-in",
    "Check-out",
    "Noites",
    "Hóspedes",
    "Total (MT)",
    "Opção de pagamento",
    "Pago (MT)",
    "Restante no check-in (MT)",
    "Estado",
    "Pedido especial",
  ];
  const estado: Record<string, string> = {
    pending_approval: "Pendente",
    confirmed: "Confirmada",
    rejected: "Recusada",
  };
  const rows = list.map((r) => [
    r.clientName,
    r.clientPhone,
    r.clientEmail,
    r.roomName,
    r.checkIn,
    r.checkOut,
    r.nights,
    r.guests,
    r.totalPrice,
    r.paymentOption === "full" ? "Total (100%)" : "Sinal (20%)",
    r.amountPaid,
    r.balanceDue,
    estado[r.status] ?? r.status,
    r.specialRequest,
  ]);
  return "\uFEFF" + [head, ...rows].map((l) => l.map(csvCell).join(";")).join("\r\n");
}

export function tableReservationsToCsv(list: TableReservation[]): string {
  const head = [
    "Cliente",
    "Telefone",
    "E-mail",
    "Data",
    "Hora",
    "Pessoas",
    "Tipo",
    "Pago (MT)",
    "A repassar (MT)",
    "Repassado",
    "Estado",
    "Pedido especial",
  ];
  const rows = list.map((t) => [
    t.clientName,
    t.clientPhone,
    t.clientEmail,
    t.reservationDate,
    t.timeSlot,
    t.guests,
    t.tipo === "evento" ? "Evento" : "Normal",
    t.price,
    t.payoutAmount,
    t.repassado ? "Sim" : "Não",
    t.status === "confirmed" ? "Confirmada" : t.status === "cancelled" ? "Cancelada" : "Pendente",
    t.specialRequest,
  ]);
  return "\uFEFF" + [head, ...rows].map((l) => l.map(csvCell).join(";")).join("\r\n");
}
