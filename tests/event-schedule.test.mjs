// Testa as regras de agendamento de eventos (espelho da migração 017).
// Correr: node tests/event-schedule.test.mjs
import assert from "node:assert/strict";
import {
  EVENT_HOURS,
  maputoInstant,
  maputoNow,
  addDaysISO,
  publishHoursFor,
  firstPublishSlot,
  removeHoursFor,
  maxRemoveDate,
  checkSchedule,
} from "../src/lib/event-schedule.ts";

// "agora" fixo: 2026-10-25 09:30 em Maputo = 07:30 UTC
const NOW = Date.parse("2026-10-25T07:30:00Z");
assert.deepEqual(maputoNow(NOW), { date: "2026-10-25", hour: 9 });
assert.equal(EVENT_HOURS[0], 6);
assert.equal(EVENT_HOURS.at(-1), 22);
assert.equal(maputoInstant("2026-10-25", 6), "2026-10-25T06:00:00+02:00");

// meia-noite UTC já é dia seguinte em Maputo
assert.deepEqual(maputoNow(Date.parse("2026-10-25T23:30:00Z")), { date: "2026-10-26", hour: 1 });

// publicar hoje: só horas depois da actual (10h..22h); amanhã: todas
assert.deepEqual(
  publishHoursFor("2026-10-25", NOW),
  [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
);
assert.equal(publishHoursFor("2026-10-26", NOW).length, 17);
assert.deepEqual(publishHoursFor("2026-10-24", NOW), []);
// muito tarde: hoje não há horas → próximo slot é amanhã às 06h
const LATE = Date.parse("2026-10-25T20:30:00Z"); // 22:30 em Maputo
assert.deepEqual(firstPublishSlot(LATE), { date: "2026-10-26", hour: 6 });
assert.deepEqual(firstPublishSlot(NOW), { date: "2026-10-25", hour: 10 });

// remover: pelo menos 1 hora depois
assert.deepEqual(removeHoursFor("2026-10-25", 21, "2026-10-25"), [22]);
assert.equal(removeHoursFor("2026-10-25", 10, "2026-10-26").length, 17);
// limite de remoção: fim do evento + 1 dia, no máximo 30 dias
assert.equal(maxRemoveDate("2026-10-25", "2026-10-28"), "2026-10-29");
assert.equal(maxRemoveDate("2026-10-25", "2026-10-28", "2026-10-30"), "2026-10-31");
assert.equal(maxRemoveDate("2026-10-25", "2026-12-30"), "2026-11-24");
assert.equal(maxRemoveDate("2026-10-25"), "2026-11-24");
assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");

const ok = { publishDate: "2026-10-26", publishHour: 10, removeDate: "2026-10-29", removeHour: 22 };
assert.equal(checkSchedule(ok, NOW).ok, true);
const bad = (patch, msg) => {
  const r = checkSchedule({ ...ok, ...patch }, NOW);
  assert.equal(r.ok, false, msg);
};
bad({ publishDate: "2026-10-24" }, "passado");
bad({ publishDate: "2026-10-25", publishHour: 8 }, "hora já passou");
bad({ publishDate: "2027-01-01", removeDate: "2027-01-02" }, "mais de 60 dias");
bad({ publishHour: 5 }, "antes das 06h");
bad({ removeHour: 23 }, "depois das 22h");
bad({ removeDate: "2026-10-26", removeHour: 10 }, "menos de 1 hora");
bad({ removeDate: "2026-12-01" }, "mais de 30 dias");
bad({ eventDate: "2026-10-27", removeDate: "2026-10-29" }, "sai > 1 dia depois do fim");
assert.equal(checkSchedule({ ...ok, eventDate: "2026-10-28" }, NOW).ok, true);
console.log("event-schedule: todos passaram");
