# v45 — O que fazer no Supabase (por ordem, nada de fora)

## A. Antes
1. **Cópia de segurança:** Supabase → Database → Backups. (Sem backups no teu plano: `npx supabase db dump -f backup-antes-v45.sql`.)

## B. Colar no SQL Editor (Supabase → SQL Editor → New query)
2. Colar o ficheiro **`SUPABASE_TUDO_v45.sql`** inteiro e carregar **RUN**.
   - Resultado esperado: uma linha com **"OK — SQL v45 aplicado"**.
   - Se aparecer um erro vermelho: **não corrijas à mão** — nada ficou alterado (é tudo-ou-nada). Envia-me a mensagem de erro.
   - Podes correr outra vez sem problema.
3. Colar o ficheiro **`VERIFICAR_v45.sql`** e carregar RUN. Os ❌ aparecem primeiro.
   - Têm de ficar **todos ✅**, exceto os dois de `pg_cron` / `pg_net` se ainda não ativaste as extensões (passo 5).

## C. Notificações aos seguidores (só depois de B estar tudo ✅)
4. **Deploy da função** (no teu computador, na pasta do projeto):
   `npx supabase functions deploy notify-new-events`
5. **Extensões:** Supabase → Database → Extensions → ativar **pg_cron** e **pg_net** (se ainda não estiverem).
6. **Agendar:** abrir `3_CRON_EVENTOS.sql`, trocar `<REF_DO_PROJECTO>` e `<FUNCTION_SECRET>` pelos **mesmos valores** que usaste no
   `2_CRON_AGENDAMENTOS.sql` (abre esse ficheiro e copia), colar no SQL Editor e RUN.
7. Confirmar: `select jobname, schedule, active from cron.job where jobname = 'notificar-novas-publicacoes';` → 1 linha, `active = true`.
8. (Opcional) Secret `APP_URL` = `https://o-teu-dominio.com`.

## D. Teste de ponta a ponta (2 contas)
9. Conta A (negócio **Pro** ou **Premium**): publicar uma publicação com 3 fotos para daqui a 1 hora (a hora certa seguinte).
10. Conta B (cliente): pôr o negócio nos **favoritos** e aceitar as notificações.
11. Quando chegar a hora (+ até 5 min): B recebe "NOME publicou 3 fotos".
12. Ver o registo: `select title, recipients_count, success_count, sent_at from public.push_log where target='event_followers' order by sent_at desc limit 5;`
    Se não chegar: `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;`

## E. Se já tinhas a 014 do repo
A `014_owner_delete_events.sql` do teu repo e o bloco 014 do ficheiro único fazem a mesma coisa; podem coexistir.
