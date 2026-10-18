-- ============================================================
-- Spotter Local — 014: o dono pode APAGAR os seus próprios eventos
-- Correr no Supabase → SQL Editor (idempotente).
-- A 007 deixou o dono só com leitura nos eventos (para ninguém publicar de graça).
-- Apagar o próprio evento não permite fraude, por isso volta a ser permitido —
-- é o que faz o botão "Remover" em "Os teus eventos" funcionar.
-- ============================================================
drop policy if exists "owner delete own events" on public.events;
create policy "owner delete own events" on public.events
  for delete using (
    auth.uid() = (select owner_id from public.businesses where id = events.business_id)
  );
