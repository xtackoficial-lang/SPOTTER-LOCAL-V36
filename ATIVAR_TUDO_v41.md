# v41 — Ativar tudo na base de dados

## Faz por esta ordem (já tens o SUPABASE_SETUP.sql e as migrações 002–007)
1. Supabase → SQL Editor → cola **`supabase/1_RUN_NO_SUPABASE.sql`** → Run.
   Inclui as migrações 008 a 014. Podes correr mais de uma vez. No fim aparecem **9 linhas, todas OK**.
2. Cola **`supabase/VERIFICAR_BD.sql`** → Run. Só devem aparecer 3 "FALTA", que são passos manuais:
   - **admin**: `insert into public.admins(id) select id from auth.users where email='O-TEU-EMAIL' on conflict do nothing;`
   - **pg_cron** e **pg_net**: Database → Extensions → ativar.
3. Deploy das Edge Functions alteradas:
   `supabase functions deploy create-zumbopay-payment`
   `supabase functions deploy zumbopay-webhook`
4. Publica a app (push para o GitHub).
5. Teste com dinheiro real (valor pequeno): um evento de 1 dia (50 MZN), uma reserva de Pensão por hora,
   uma reserva de Pensão por dia, e uma reserva de hotel normal.

Instalação nova (base de dados vazia): `SUPABASE_SETUP.sql` → `migrations/002` a `007` → `1_RUN_NO_SUPABASE.sql`.
As migrações 002 e 003 mudaram só para se poderem repetir sem erro (linha do Realtime). Não as precisas de voltar a correr.

## O que foi verificado
- App: tsc 0 erros · eslint (src) 0 erros · vite build OK.
- Testes: 38 filtros de reservas · 18 limites de planos · 12 admin · 37 pesquisa · 16 Pensão/eventos. Todos passam.
- SQL: 16 ficheiros validados por um parser de PostgreSQL. Cadeia completa corrida em PostgreSQL 16 real:
  instalação limpa e repetida por cima, sem erros.
- Colunas: as 244 colunas que o código usa existem na base de dados real. Corre `npm run check:db` quando mudares o código.
- Segurança (RLS): 22 testes de comportamento passam (evento expirado escondido, estranho não apaga nem cria,
  cliente não confirma reserva sem pagar, táxi não abre quartos, pensão sim).
- Todas as 37 escritas que a app faz têm uma regra de segurança que as permite.
- Edge Functions: 9 ficheiros sem erro de sintaxe e sem imports partidos.

## Erros encontrados e corrigidos nesta versão
1. **Botão "Remover evento" (v40) não apagava nada**: a migração 007 deixou o dono só com leitura nos eventos.
   Novo `014_owner_delete_events.sql` e a app agora só diz "removido" quando a linha foi mesmo apagada.
2. Migrações 002/003 davam erro ao repetir (Realtime). Já repetem.
3. `1_RUN_NO_SUPABASE.sql` e `VERIFICAR_BD.sql` passam a verificar Pensão, eventos, buckets e Realtime.

## Não consegui testar (precisa de ti)
Pagamentos reais na ZumboPay, e-mails (Resend), notificações (Firebase), agendamento real (pg_cron) e o toque no telemóvel.

## Notas
- `.env` **não** vem neste zip, para não escrever por cima do teu. Usa o teu.
- `testes-locais/filtros-reservas.test.ts` é uma cópia antiga e desatualizada (já falhava antes). O teste em uso é `tests/reservation-filters.test.mjs`.
