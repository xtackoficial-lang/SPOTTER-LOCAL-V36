-- ============================================================
-- SPOTTER LOCAL v45 — AGENDAMENTO: notificar seguidores quando uma publicação fica visível
-- ============================================================
-- Só correr DEPOIS de:
--   1) correr a migração 018_event_photos_notify.sql
--   2) fazer deploy da Edge Function:  npx supabase functions deploy notify-new-events
--   3) o secret FUNCTION_SECRET já existir (é o mesmo do 2_CRON_AGENDAMENTOS.sql)
--   (opcional) secret APP_URL = https://o-teu-dominio.com  → a notificação abre a aba Eventos
--
-- TROCA os 2 marcadores:  <REF_DO_PROJECTO>  e  <FUNCTION_SECRET>
-- ============================================================
select cron.unschedule(jobname) from cron.job where jobname = 'notificar-novas-publicacoes';

select cron.schedule(
  'notificar-novas-publicacoes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<REF_DO_PROJECTO>.supabase.co/functions/v1/notify-new-events',
    headers := '{"Authorization": "Bearer <FUNCTION_SECRET>"}'::jsonb
  );
  $$
);
-- Ver se ficou:        select jobname, schedule, active from cron.job;
-- Últimas execuções:   select * from cron.job_run_details order by start_time desc limit 10;
