-- ============================================================
-- SPOTTER LOCAL v37 — PASSO 2 DE 2: AGENDAMENTOS AUTOMÁTICOS (pg_cron)
-- ============================================================
-- Só correr DEPOIS de:
--   1) activar as extensões pg_cron e pg_net (Database → Extensions)
--   2) publicar as Edge Functions e criar o secret FUNCTION_SECRET
--
-- TROCA os 2 marcadores antes de correr (em TODOS os blocos abaixo):
--   <REF_DO_PROJECTO>  → a parte antes de .supabase.co no teu URL
--                        (Settings → API → Project URL)
--   <FUNCTION_SECRET>  → o MESMO valor que puseste no secret FUNCTION_SECRET
--
-- Cria 3 tarefas:
--   • motor-de-cobranca-diario   06:00 UTC  → renova/expira planos
--   • reactivar-quartos-diario   05:00 UTC  → quartos com ocupação passada voltam a livres
--   • notificacoes-agendadas     cada 5 min → envia as notificações push agendadas no /admin
-- ============================================================

-- Se já existirem com o mesmo nome, apaga-as primeiro (evita duplicados):
select cron.unschedule(jobname) from cron.job
 where jobname in ('motor-de-cobranca-diario','reactivar-quartos-diario','notificacoes-agendadas');

select cron.schedule(
  'motor-de-cobranca-diario',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://<REF_DO_PROJECTO>.supabase.co/functions/v1/run-billing-engine',
    headers := '{"Authorization": "Bearer <FUNCTION_SECRET>"}'::jsonb
  );
  $$
);

select cron.schedule(
  'reactivar-quartos-diario',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://<REF_DO_PROJECTO>.supabase.co/functions/v1/reactivate-rooms',
    headers := '{"Authorization": "Bearer <FUNCTION_SECRET>"}'::jsonb
  );
  $$
);

select cron.schedule(
  'notificacoes-agendadas',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<REF_DO_PROJECTO>.supabase.co/functions/v1/send-scheduled-notifications',
    headers := '{"Authorization": "Bearer <FUNCTION_SECRET>"}'::jsonb
  );
  $$
);

-- Ver se ficaram agendadas:        select jobname, schedule, active from cron.job;
-- Ver as últimas execuções:        select * from cron.job_run_details order by start_time desc limit 10;
