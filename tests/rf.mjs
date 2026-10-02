// src/lib/reservation-filters.ts
function normalizeText(s) {
  return (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function normalizePhone(s) {
  const d = (s ?? "").replace(/\D/g, "");
  return d.startsWith("258") && d.length > 9 ? d.slice(3) : d;
}
function matchesQuery(fields, phone, query) {
  const q = normalizeText(query);
  if (!q) return true;
  const text = normalizeText(fields.join(" "));
  const phoneDigits = normalizePhone(phone);
  return q.split(" ").every((tok) => {
    if (text.includes(tok)) return true;
    const digits = normalizePhone(tok);
    return digits.length >= 3 && phoneDigits.includes(digits);
  });
}
function inRange(date, from, to) {
  if (!from && !to) return true;
  if (!date) return false;
  const d = date.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}
var EMPTY_ROOM_FILTERS = {
  search: "",
  status: "all",
  payment: "all",
  from: "",
  to: "",
  sort: "pending"
};
function roomFiltersActive(f) {
  return !!f.search.trim() || f.status !== "all" || f.payment !== "all" || !!f.from || !!f.to || f.sort !== EMPTY_ROOM_FILTERS.sort;
}
function isRoomOverdue(r, now = Date.now()) {
  return r.status === "pending_approval" && !!r.responseDeadline && new Date(r.responseDeadline).getTime() < now;
}
function roomMatchesStatus(r, s, now) {
  switch (s) {
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
function filterRoomReservations(list, f, now = Date.now()) {
  const out = list.filter(
    (r) => roomMatchesStatus(r, f.status, now) && (f.payment === "all" || r.paymentOption === f.payment) && inRange(r.checkIn, f.from, f.to) && matchesQuery(
      [r.clientName, r.clientEmail, r.roomName, r.specialRequest, r.id.slice(0, 8)],
      r.clientPhone,
      f.search
    )
  );
  const byRecent = (a, b) => b.createdAt.localeCompare(a.createdAt);
  const sorted = [...out];
  if (f.sort === "checkin") sorted.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  else if (f.sort === "amount") sorted.sort((a, b) => b.totalPrice - a.totalPrice);
  else if (f.sort === "pending")
    sorted.sort(
      (a, b) => Number(b.status === "pending_approval") - Number(a.status === "pending_approval") || byRecent(a, b)
    );
  else sorted.sort(byRecent);
  return sorted;
}
function countRoomStatuses(list, now = Date.now()) {
  return {
    all: list.length,
    pending: list.filter((r) => r.status === "pending_approval").length,
    overdue: list.filter((r) => isRoomOverdue(r, now)).length,
    confirmed: list.filter((r) => r.status === "confirmed").length,
    rejected: list.filter((r) => r.status === "rejected").length,
    refund_todo: list.filter((r) => r.status === "rejected" && !r.refunded).length
  };
}
function summarizeRooms(list) {
  const active = list.filter((r) => r.status !== "rejected" && r.status !== "cancelled");
  return {
    count: list.length,
    /** pago pelos clientes em reservas que não foram recusadas */
    paid: active.reduce((s, r) => s + r.amountPaid, 0),
    /** ainda a receber no check-in (confirmadas + pendentes) */
    balance: active.reduce((s, r) => s + r.balanceDue, 0),
    /** a devolver (recusadas ainda não reembolsadas) */
    toRefund: list.filter((r) => r.status === "rejected" && !r.refunded).reduce((s, r) => s + r.amountPaid, 0)
  };
}
var EMPTY_TABLE_FILTERS = {
  search: "",
  status: "all",
  tipo: "all",
  from: "",
  to: "",
  sort: "recent"
};
function tableFiltersActive(f) {
  return !!f.search.trim() || f.status !== "all" || f.tipo !== "all" || !!f.from || !!f.to || f.sort !== EMPTY_TABLE_FILTERS.sort;
}
function tableMatchesStatus(r, s) {
  switch (s) {
    case "all":
      return true;
    case "confirmed":
      return r.status === "confirmed";
    case "cancelled":
      return r.status === "cancelled";
    case "payout_todo":
      return r.status === "confirmed" && !r.repassado;
  }
}
function filterTableReservations(list, f) {
  const out = list.filter(
    (r) => tableMatchesStatus(r, f.status) && (f.tipo === "all" || r.tipo === f.tipo) && inRange(r.reservationDate, f.from, f.to) && matchesQuery(
      [
        r.clientName,
        r.clientEmail,
        r.specialRequest,
        r.timeSlot,
        r.reservationDate,
        r.id.slice(0, 8)
      ],
      r.clientPhone,
      f.search
    )
  );
  const sorted = [...out];
  if (f.sort === "date")
    sorted.sort(
      (a, b) => (a.reservationDate + a.timeSlot).localeCompare(b.reservationDate + b.timeSlot)
    );
  else if (f.sort === "amount") sorted.sort((a, b) => b.price - a.price);
  else sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sorted;
}
function countTableStatuses(list) {
  return {
    all: list.length,
    confirmed: list.filter((r) => r.status === "confirmed").length,
    cancelled: list.filter((r) => r.status === "cancelled").length,
    payout_todo: list.filter((r) => r.status === "confirmed" && !r.repassado).length
  };
}
function summarizeTables(list) {
  const ok = list.filter((r) => r.status === "confirmed");
  return {
    count: list.length,
    guests: ok.reduce((s, r) => s + r.guests, 0),
    paid: ok.reduce((s, r) => s + r.price, 0),
    /** a receber do Spotter (repasse ainda não feito) */
    toReceive: ok.filter((r) => !r.repassado).reduce((s, r) => s + r.payoutAmount, 0)
  };
}
function csvCell(v) {
  const s = String(v ?? "");
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
function toCsv(rows) {
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}
function roomReservationsToCsv(list) {
  return toCsv([
    [
      "Ref",
      "Cliente",
      "Telefone",
      "E-mail",
      "Quarto",
      "Check-in",
      "Check-out",
      "Noites",
      "H\xF3spedes",
      "Total (MT)",
      "Pagamento",
      "Pago (MT)",
      "Restante no hotel (MT)",
      "Estado",
      "Responder at\xE9",
      "Reembolsado",
      "Pedido especial"
    ],
    ...list.map((r) => [
      r.id.slice(0, 8),
      r.clientName,
      r.clientPhone,
      r.clientEmail ?? "",
      r.roomName ?? "",
      r.checkIn,
      r.checkOut,
      r.nights,
      r.guests,
      r.totalPrice,
      r.paymentOption === "full" ? "100%" : "Sinal 20%",
      r.amountPaid,
      r.balanceDue,
      r.status,
      r.responseDeadline ?? "",
      r.status === "rejected" ? r.refunded ? "sim" : "n\xE3o" : "",
      r.specialRequest ?? ""
    ])
  ]);
}
function tableReservationsToCsv(list) {
  return toCsv([
    [
      "Ref",
      "Cliente",
      "Telefone",
      "E-mail",
      "Data",
      "Hora",
      "Pessoas",
      "Tipo",
      "Estado",
      "Pago (MT)",
      "A receber (MT)",
      "Repassado",
      "Pedido especial"
    ],
    ...list.map((r) => [
      r.id.slice(0, 8),
      r.clientName,
      r.clientPhone,
      r.clientEmail ?? "",
      r.reservationDate,
      r.timeSlot,
      r.guests,
      r.tipo,
      r.status,
      r.price,
      r.payoutAmount,
      r.repassado ? "sim" : "n\xE3o",
      r.specialRequest ?? ""
    ])
  ]);
}
export {
  EMPTY_ROOM_FILTERS,
  EMPTY_TABLE_FILTERS,
  countRoomStatuses,
  countTableStatuses,
  filterRoomReservations,
  filterTableReservations,
  isRoomOverdue,
  matchesQuery,
  normalizePhone,
  normalizeText,
  roomFiltersActive,
  roomReservationsToCsv,
  summarizeRooms,
  summarizeTables,
  tableFiltersActive,
  tableReservationsToCsv,
  toCsv
};
