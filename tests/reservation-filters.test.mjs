// Teste dos filtros de reservas (funções puras). Correr: ver testes-locais/LEIA-ME.md
import * as F from "./rf.mjs";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (pass++, console.log("  ✅", n)) : (fail++, console.log("  ❌", n, x)); };
const NOW = Date.parse("2026-10-10T12:00:00Z");
const room = (o) => ({ id: "abcdef12-0000", businessId: "b", roomId: "r", roomName: "Suite Mar", clientUserId: "u", clientName: "João Matsinhe", clientPhone: "+258 84 123 4567", clientEmail: null,
  checkIn: "2026-11-01", checkOut: "2026-11-03", guests: 2, specialRequest: null, nights: 2, totalPrice: 4000, commissionAmount: 400, paymentOption: "deposit", amountPaid: 800, balanceDue: 3200,
  responseDeadline: "2026-10-11T12:00:00Z", status: "pending_approval", rejectionReason: null, refunded: false, createdAt: "2026-10-09T10:00:00Z", ...o });
const R = [
  room({ id: "r1-aaaa", clientName: "João Matsinhe" }),
  room({ id: "r2-bbbb", clientName: "Ana Cossa", clientPhone: "82 555 0000", roomName: "Quarto Vista", status: "confirmed", paymentOption: "full", amountPaid: 4000, balanceDue: 0, checkIn: "2026-12-10", createdAt: "2026-10-08T10:00:00Z" }),
  room({ id: "r3-cccc", clientName: "Pedro Nhaca", status: "rejected", amountPaid: 800, refunded: false, checkIn: "2026-11-20", createdAt: "2026-10-07T10:00:00Z" }),
  room({ id: "r4-dddd", clientName: "Rita Mondlane", status: "rejected", amountPaid: 800, refunded: true, createdAt: "2026-10-06T10:00:00Z" }),
  room({ id: "r5-eeee", clientName: "Lucas", responseDeadline: "2026-10-09T12:00:00Z", createdAt: "2026-10-05T10:00:00Z" }), // prazo excedido
];
const f = (o) => F.filterRoomReservations(R, { ...F.EMPTY_ROOM_FILTERS, ...o }, NOW);
console.log("\n=== Quartos ===");
ok("sem filtros → todas (5)", f({}).length === 5);
ok("padrão: pendentes primeiro", f({}).slice(0, 2).every((r) => r.status === "pending_approval"));
ok("pesquisa sem acentos: 'joao' encontra João", f({ search: "joao" }).map((r) => r.clientName).join() === "João Matsinhe");
ok("pesquisa por telefone sem indicativo '841234567' encontra os 4 com esse número (Ana não)", f({ search: "841234567" }).length === 4 && !f({ search: "841234567" }).some((r) => r.clientName === "Ana Cossa"));
ok("pesquisa por telefone COM indicativo '258841234567' dá o mesmo", f({ search: "258841234567" }).length === 4);
ok("pesquisa por telefone parcial: '555'", f({ search: "555" }).map((r) => r.id).join() === "r2-bbbb");
ok("pesquisa 2 palavras (nome + quarto): 'ana vista'", f({ search: "ana vista" }).length === 1);
ok("pesquisa por ref. (8 chars do id)", F.filterRoomReservations([room({ id: "9f8e7d6c-1111" })], { ...F.EMPTY_ROOM_FILTERS, search: "9f8e7d6c" }, NOW).length === 1);
ok("estado pendentes → 2 (inclui o excedido)", f({ status: "pending" }).length === 2);
ok("estado prazo excedido → só o Lucas", f({ status: "overdue" }).map((r) => r.clientName).join() === "Lucas");
ok("estado confirmadas → Ana", f({ status: "confirmed" }).length === 1);
ok("estado recusadas → 2", f({ status: "rejected" }).length === 2);
ok("reembolso por fazer → só o Pedro (a Rita já foi reembolsada)", f({ status: "refund_todo" }).map((r) => r.clientName).join() === "Pedro Nhaca");
ok("pagamento 100% → Ana", f({ payment: "full" }).length === 1);
ok("pagamento sinal → 4", f({ payment: "deposit" }).length === 4);
ok("check-in entre 2026-11-15 e 2026-12-31 → Pedro e Ana", f({ from: "2026-11-15", to: "2026-12-31" }).length === 2);
ok("só 'desde' (2026-12-01) → Ana", f({ from: "2026-12-01" }).length === 1);
ok("ordenar por check-in (mais próximo primeiro)", f({ sort: "checkin" })[0].checkIn === "2026-11-01" && f({ sort: "checkin" }).at(-1).checkIn === "2026-12-10");
ok("ordenar por maior valor", f({ sort: "amount" })[0].totalPrice === 4000);
ok("filtros combinados: confirmadas + 100% + 'ana'", f({ status: "confirmed", payment: "full", search: "ana" }).length === 1);
ok("filtros sem resultado → 0", f({ search: "zzz" }).length === 0);
const c = F.countRoomStatuses(R, NOW);
ok("contagens: all5 pend2 overdue1 conf1 rej2 refund1", c.all === 5 && c.pending === 2 && c.overdue === 1 && c.confirmed === 1 && c.rejected === 2 && c.refund_todo === 1, JSON.stringify(c));
const s = F.summarizeRooms(R);
ok("resumo: pago 800+4000+800 (sem recusadas)=... ", s.paid === 800 + 4000 + 800 && s.toRefund === 800 && s.balance === 3200 + 0 + 3200, JSON.stringify(s));
ok("filtros activos detecta alteração", F.roomFiltersActive({ ...F.EMPTY_ROOM_FILTERS, search: "x" }) && !F.roomFiltersActive(F.EMPTY_ROOM_FILTERS));
const csv = F.roomReservationsToCsv(R.slice(0, 2));
ok("CSV: BOM + cabeçalho + 2 linhas, separador ;", csv.startsWith("\uFEFFRef;Cliente") && csv.split("\r\n").length === 3);
ok("CSV: aspas e ; dentro do texto escapados", F.roomReservationsToCsv([room({ specialRequest: 'andar "alto"; vista' })]).includes('"andar ""alto""; vista"'));

console.log("\n=== Mesas ===");
const t = (o) => ({ id: "t1-aaaa", businessId: "b", clientUserId: "u", clientName: "Maria Sitoe", clientPhone: "84 000 1111", clientEmail: null, reservationDate: "2026-11-05", timeSlot: "19:30", guests: 4, specialRequest: null, tipo: "normal", price: 200, commissionAmount: 100, payoutAmount: 100, status: "confirmed", repassado: false, createdAt: "2026-10-09T10:00:00Z", ...o });
const T = [t({}), t({ id: "t2-bbbb", clientName: "Carlos", tipo: "evento", price: 500, payoutAmount: 250, reservationDate: "2026-11-20", repassado: true, createdAt: "2026-10-08T10:00:00Z" }), t({ id: "t3-cccc", clientName: "Zita", status: "cancelled", reservationDate: "2026-12-01", createdAt: "2026-10-07T10:00:00Z" })];
const g = (o) => F.filterTableReservations(T, { ...F.EMPTY_TABLE_FILTERS, ...o });
ok("mesas: sem filtros → 3", g({}).length === 3);
ok("mesas: pesquisa por nome 'maria'", g({ search: "maria" }).length === 1);
ok("mesas: pesquisa por hora '19:30'", g({ search: "19:30" }).length === 3);
ok("mesas: repasse por fazer → só Maria (Carlos já foi repassado, Zita cancelada)", g({ status: "payout_todo" }).map((r) => r.clientName).join() === "Maria Sitoe");
ok("mesas: tipo evento → Carlos", g({ tipo: "evento" }).length === 1);
ok("mesas: data entre 2026-11-10 e 2026-11-30 → Carlos", g({ from: "2026-11-10", to: "2026-11-30" }).map((r) => r.clientName).join() === "Carlos");
ok("mesas: ordenar por data da reserva", g({ sort: "date" })[0].clientName === "Maria Sitoe" && g({ sort: "date" }).at(-1).clientName === "Zita");
const ts = F.summarizeTables(T);
ok("mesas: resumo só conta confirmadas: pago 700, pessoas 8, a receber 100", ts.paid === 700 && ts.guests === 8 && ts.toReceive === 100, JSON.stringify(ts));
const tc = F.countTableStatuses(T); ok("mesas: contagens all3 conf2 cancel1 repasse1", tc.all === 3 && tc.confirmed === 2 && tc.cancelled === 1 && tc.payout_todo === 1, JSON.stringify(tc));
ok("mesas: CSV com cabeçalho", F.tableReservationsToCsv(T).startsWith("\uFEFFRef;Cliente;Telefone"));
console.log("\n=== Telefones/texto ===");
ok("normalizePhone remove +258", F.normalizePhone("+258 84 123 4567") === "841234567" && F.normalizePhone("841234567") === "841234567");
ok("normalizeText tira acentos", F.normalizeText("  AÇÃO é Ótima ") === "acao e otima");
console.log(`\nRESULTADO filtros: ${pass} ok, ${fail} falhas`);
