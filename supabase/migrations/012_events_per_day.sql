-- ============================================================
-- Spotter Local — 012: eventos pagos por DIA (50 MZN/dia)
-- Correr no Supabase → SQL Editor (idempotente).
-- ============================================================
alter table public.events
  add column if not exists expires_at timestamptz;

-- Só aparecem eventos activos que ainda não passaram os dias pagos.
drop policy if exists "Todos veem eventos activos" on public.events;
create policy "Todos veem eventos activos" on public.events
  for select using (status = 'active' and (expires_at is null or expires_at > now()));
