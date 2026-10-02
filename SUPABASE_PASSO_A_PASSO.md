# Spotter Local v37 — TUDO o que tens de correr e conectar no Supabase

Faz por esta ordem. Cada passo diz onde clicar e o que deves ver no fim.
Ficheiros SQL: pasta `supabase/` do zip (`1_RUN_NO_SUPABASE.sql`, `2_CRON_AGENDAMENTOS.sql`, `VERIFICAR_BD.sql`).

---
## 0. Antes de começar — o que tens de ter à mão
| O quê | Onde obter |
|---|---|
| **Project ref** (ex.: `abcdxyz`) | Supabase → Settings → API → Project URL (a parte antes de `.supabase.co`) |
| **Chave anon** (pública) | Supabase → Settings → API → anon public |
| **Chaves ZumboPay** (`zk_live_...`, `MCH_...`, `wallet_id`, `whsec_...`) | Painel ZumboPay → Programadores / Carteiras |
| **Chave Resend** (`re_...`) | resend.com → API Keys |
| **Supabase CLI** | `npm i -g supabase` (ou https://supabase.com/docs/guides/cli) |

---
## 1. Base de dados — SQL Editor (Supabase → SQL Editor → New query)

### 1.1 Diagnóstico (só lê, não altera nada)
Cola `supabase/VERIFICAR_BD.sql` → Run. Cada linha "FALTA" diz o que corrigir.
- Se faltarem **tabelas base** (businesses, payments, room_reservations…): corre primeiro `SUPABASE_SETUP.sql` e depois `supabase/migrations/002` … `007` por ordem.
- Se só faltarem coisas dos pagamentos/reservas → passo 1.2.

### 1.2 Correções da v37 (OBRIGATÓRIO)
Cola **`supabase/1_RUN_NO_SUPABASE.sql`** → Run. (Junta as migrações 008, 009 e 010. Pode correr mais de uma vez.)
No fim aparecem 3 linhas, todas `OK`.
O que faz: aceita pagamentos ZumboPay e os pacotes de publicação/evento; bloqueia reservas para táxi e outras categorias; quartos com pagamento 100% ou sinal de 20% e prazo de resposta de 24h.

### 1.3 Ser administrador
```sql
insert into public.admins(id)
select id from auth.users where email = 'O-TEU-EMAIL@...'
on conflict do nothing;
```
(Tens de já ter criado conta na app com esse e-mail.)

### 1.4 Extensões e Realtime (cliques no dashboard)
- **Database → Extensions**: activar **pg_cron** e **pg_net**.
- **Database → Replication** (ou *Publications → supabase_realtime*): activar **payments**, **room_reservations**, **table_reservations** (a app confirma pagamentos e reservas em tempo real).
- Storage: os buckets `spotter-media` (público) e `spotter-chat` (privado) são criados pelo `SUPABASE_SETUP.sql`. Confirma em Storage que existem os dois.

---
## 2. Secrets das Edge Functions
Supabase → **Edge Functions → Secrets** (ou `supabase secrets set NOME=valor`).
`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já vêm automáticos — **não** os cries.

| Secret | Obrigatório | Valor |
|---|---|---|
| `ZUMBOPAY_API_KEY` | sim | `zk_live_...` |
| `ZUMBOPAY_MERCHANT_ID` | sim | `MCH_...` |
| `ZUMBOPAY_WALLET_ID` | **sim (novo)** | `wallet_id` da carteira de destino |
| `ZUMBOPAY_WEBHOOK_SECRET` | sim | `whsec_...` (o "signing secret" do webhook) |
| `FUNCTION_SECRET` | sim | inventa um texto longo e aleatório (ex.: 40 letras/números). Usa o MESMO no passo 4 |
| `RESEND_API_KEY` | sim (e-mails de reservas) | `re_...` |
| `RESEND_FROM` | não | por omissão `onboarding@resend.dev` |
| `ADMIN_NOTIFY_EMAIL` | sim | `xtackoficial@gmail.com` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | só para notificações push | JSON da conta de serviço do Firebase (ver `FIREBASE_SETUP.md`) |
| `ZUMBOPAY_WEBHOOK_URL` | não | já não é necessário (o webhook configura-se no painel da ZumboPay) |

Aviso Resend: com `onboarding@resend.dev` o Resend só entrega para o e-mail da tua própria conta Resend. Usa esse e-mail em `ADMIN_NOTIFY_EMAIL`, ou verifica um domínio teu e põe-no em `RESEND_FROM`.

---
## 3. Publicar as 8 Edge Functions
No PowerShell, na pasta do projecto:
```
supabase login
supabase link --project-ref <REF_DO_PROJECTO>
supabase functions deploy create-zumbopay-payment
supabase functions deploy zumbopay-webhook
supabase functions deploy reservation-respond
supabase functions deploy run-billing-engine
supabase functions deploy reactivate-rooms
supabase functions deploy send-scheduled-notifications
supabase functions deploy send-merchant-promo
supabase functions deploy delete-own-account
```
O ficheiro `supabase/config.toml` já desliga a verificação de JWT nas 4 funções chamadas por servidores (webhook + 3 cron).
Sem ele, o webhook da ZumboPay era recusado e os pagamentos nunca confirmavam.
Confirma em Edge Functions que as 8 aparecem como "Deployed".

---
## 4. Agendamentos automáticos
Abre `supabase/2_CRON_AGENDAMENTOS.sql`, **troca** `<REF_DO_PROJECTO>` e `<FUNCTION_SECRET>` (em todos os blocos), cola no SQL Editor → Run.
Cria: cobrança diária (06:00), reactivar quartos (05:00) e notificações agendadas (cada 5 min).
Confirmar: `select jobname, schedule, active from cron.job;` → 3 linhas activas.

---
## 5. Painel da ZumboPay — webhook
Programadores → Webhooks → adicionar:
- URL: `https://<REF_DO_PROJECTO>.supabase.co/functions/v1/zumbopay-webhook`
- Eventos: `payment.succeeded` e `payment.failed`
- O "signing secret" que aparece → vai para o secret `ZUMBOPAY_WEBHOOK_SECRET` (passo 2).

---
## 6. Authentication (Supabase → Authentication)
- **URL Configuration → Site URL**: o endereço da app (ex.: `https://spotter-local.xtackoficial.workers.dev`).
- **Redirect URLs**: adiciona esse endereço com `/` e `/reset-password` no fim, e o da Vercel se usares os dois.
- **Providers → Google** (para "Continuar com Google"): activa e cola o Client ID/Secret do Google Cloud; no Google põe como URI de redirecionamento o `https://<REF_DO_PROJECTO>.supabase.co/auth/v1/callback`.
- **Providers → Email**: activo. (Se "Confirm email" estiver ligado, os utilizadores têm de confirmar o e-mail antes de entrar.)

---
## 7. Variáveis do site (Vercel e Cloudflare → Settings → Environment Variables)
```
VITE_SUPABASE_URL=https://<REF_DO_PROJECTO>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave anon>
```
Opcionais (notificações push): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY`.
Nunca coloques aqui a service_role key nem as chaves da ZumboPay.
Depois de mudar variáveis, faz um novo deploy.

---
## 8. Verificação final
1. SQL Editor → corre outra vez `VERIFICAR_BD.sql` → nenhuma linha "FALTA" (a não ser Firebase, se não usares).
2. Edge Functions → `zumbopay-webhook` → **Logs** abertos enquanto fazes o teste.
3. Na app (conta de comerciante): paga uma **publicação de 24h (50 MZN)** → abre o checkout da ZumboPay → paga.
4. Esperado: log do webhook com status **200**; em `payments` a linha passa a `confirmed`; a publicação aparece.
5. Só depois testa reserva de quarto (sinal 20% e 100%) numa conta de hotel e uma conta de táxi (não pode ter reservas).

Se algum passo falhar, copia a mensagem de erro (SQL, log da função ou ecrã da app) e envia-ma.
