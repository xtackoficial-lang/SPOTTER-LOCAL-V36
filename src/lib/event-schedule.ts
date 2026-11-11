// ============================================================
// SPOTTER — Agendar eventos (regras e ajudantes, sem dependências)
// ------------------------------------------------------------
// Estas regras são ESPELHO das validadas no servidor em
// supabase/migrations/017_event_plan_quota.sql (publish_event_scheduled).
// A app usa-as para mostrar só opções válidas; quem decide é o servidor.
// Fuso fixo: Maputo (UTC+2, sem hora de verão).
// ============================================================

export const EVENT_FIRST_HOUR = 6; // primeira hora permitida (06:00)
export const EVENT_LAST_HOUR = 22; // última hora permitida (22:00)
export const EVENT_MAX_DAYS_AHEAD = 60; // publicar no máximo 60 dias à frente
export const EVENT_MAX_VISIBLE_DAYS = 30; // visível no máximo 30 dias
export const EVENT_MIN_VISIBLE_HOURS = 1;
export const MAPUTO_OFFSET = "+02:00";

export const EVENT_HOURS: number[] = Array.from(
  { length: EVENT_LAST_HOUR - EVENT_FIRST_HOUR + 1 },
  (_, i) => EVENT_FIRST_HOUR + i,
);

const pad = (n: number) => String(n).padStart(2, "0");
export const hourLabel = (h: number) => `${pad(h)}:00`;

/** Data e hora de Maputo → instante ISO (ex.: "2026-10-25", 10 → "2026-10-25T10:00:00+02:00"). */
export function maputoInstant(dateISO: string, hour: number): string {
  return `${dateISO}T${pad(hour)}:00:00${MAPUTO_OFFSET}`;
}

/** "Agora" visto em Maputo: data (AAAA-MM-DD) e hora. */
export function maputoNow(nowMs: number = Date.now()): { date: string; hour: number } {
  const d = new Date(nowMs + 2 * 3_600_000);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    hour: d.getUTCHours(),
  };
}

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const r = new Date(t);
  return `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}`;
}

/** Horas ainda válidas para publicar nesse dia (hoje: só horas futuras, com 1 hora de folga). */
export function publishHoursFor(dateISO: string, nowMs: number = Date.now()): number[] {
  const now = maputoNow(nowMs);
  if (dateISO < now.date) return [];
  if (dateISO > now.date) return EVENT_HOURS;
  return EVENT_HOURS.filter((h) => h > now.hour);
}

/** Primeira data/hora válida para publicar (para pré-preencher o formulário). */
export function firstPublishSlot(nowMs: number = Date.now()): { date: string; hour: number } {
  const now = maputoNow(nowMs);
  const todays = publishHoursFor(now.date, nowMs);
  if (todays.length) return { date: now.date, hour: todays[0] };
  return { date: addDaysISO(now.date, 1), hour: EVENT_FIRST_HOUR };
}

/** Horas válidas para remover: depois do instante de publicação (+1 hora no mínimo). */
export function removeHoursFor(
  publishDate: string,
  publishHour: number,
  removeDate: string,
): number[] {
  const minStart =
    Date.parse(maputoInstant(publishDate, publishHour)) + EVENT_MIN_VISIBLE_HOURS * 3_600_000;
  return EVENT_HOURS.filter((h) => Date.parse(maputoInstant(removeDate, h)) >= minStart);
}

/** Último dia em que o evento ainda pode estar publicado (dia do fim + 1), limitado a 30 dias. */
export function maxRemoveDate(
  publishDate: string,
  eventDate?: string,
  eventEndDate?: string,
): string {
  const cap = addDaysISO(publishDate, EVENT_MAX_VISIBLE_DAYS);
  const last = eventEndDate || eventDate;
  if (!last) return cap;
  const afterEvent = addDaysISO(last, 1);
  return afterEvent < cap ? afterEvent : cap;
}

export type ScheduleCheck = { ok: true } | { ok: false; error: string };

/** Valida o agendamento no telemóvel (o servidor volta a validar). */
export function checkSchedule(
  p: {
    publishDate: string;
    publishHour: number;
    removeDate: string;
    removeHour: number;
    eventDate?: string;
    eventEndDate?: string;
  },
  nowMs: number = Date.now(),
): ScheduleCheck {
  const now = maputoNow(nowMs);
  if (!p.publishDate || !p.removeDate)
    return { ok: false, error: "Escolhe o dia de publicar e o dia de remover." };
  if (!EVENT_HOURS.includes(p.publishHour) || !EVENT_HOURS.includes(p.removeHour))
    return {
      ok: false,
      error: `As horas permitidas vão das ${hourLabel(EVENT_FIRST_HOUR)} às ${hourLabel(EVENT_LAST_HOUR)}.`,
    };
  const pub = Date.parse(maputoInstant(p.publishDate, p.publishHour));
  const rem = Date.parse(maputoInstant(p.removeDate, p.removeHour));
  if (pub < nowMs - 2 * 60_000) return { ok: false, error: "A hora de publicar já passou." };
  if (p.publishDate > addDaysISO(now.date, EVENT_MAX_DAYS_AHEAD))
    return { ok: false, error: `Só podes agendar até ${EVENT_MAX_DAYS_AHEAD} dias à frente.` };
  if (rem < pub + EVENT_MIN_VISIBLE_HOURS * 3_600_000)
    return { ok: false, error: "A remoção tem de ser pelo menos 1 hora depois da publicação." };
  if (rem > pub + EVENT_MAX_VISIBLE_DAYS * 86_400_000)
    return {
      ok: false,
      error: `O evento pode ficar publicado no máximo ${EVENT_MAX_VISIBLE_DAYS} dias.`,
    };
  const last = p.eventEndDate || p.eventDate;
  if (last && p.removeDate > addDaysISO(last, 1))
    return { ok: false, error: "O evento só pode sair até 1 dia depois de terminar." };
  return { ok: true };
}

/** Mês (AAAA-MM) de Maputo de um instante ISO — o mês que conta para a quota. */
export function quotaMonthOf(publishDate: string): string {
  return publishDate.slice(0, 7);
}
