-- ============================================================
-- Spotter Local — 013: data de fim do evento
-- Correr no Supabase → SQL Editor (idempotente).
-- ============================================================
alter table public.events
  add column if not exists event_end_date date;
