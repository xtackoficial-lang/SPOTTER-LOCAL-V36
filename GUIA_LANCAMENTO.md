> **Versão simples, só do Supabase, com tudo por ordem: abre `SUPABASE_PASSO_A_PASSO.md`.** Os SQL prontos a colar estão em `supabase/1_RUN_NO_SUPABASE.sql` e `supabase/2_CRON_AGENDAMENTOS.sql`.

# Spotter Local v37 — guia para ficar 100% funcional

Feito em 2026-09-30, testes das funções em 2026-10-01. O SQL foi testado numa base Postgres real (base nova: 0 erros com as migrações 002→010; 12 testes de
segurança passaram; funções: 93 testes automáticos a correr as 8 Edge Functions reais em Deno contra uma BD Postgres + API tipo Supabase e uma ZumboPay simulada, 0 falhas — ver `testes-locais/`). Código: `tsc` e `vite build` passam. NÃO foi testado: chamada real à ZumboPay, deploy das funções,
nem o visual no browser — isso só se confirma depois do deploy (passo 6).

## Erros encontrados (e o estado de cada um)
| # | Erro | Estado |
|---|------|--------|
| 1 | `api.zumbopay.com` não existe → nenhum pagamento arrancava | Corrigido (endpoint real da doc) |
| 2 | BD recusava `method='zumbopay'` e `plan_id='room'/'table'` | Corrigido (migração 008) |
| 3 | **Webhook da ZumboPay seria recusado com 401** (Supabase exige JWT por omissão) → pagavas na ZumboPay e a app nunca confirmava | Corrigido (`supabase/config.toml`, verify_jwt=false nas 4 funções servidor-a-servidor) |
| 4 | `SUPABASE_SETUP.sql`: `is_admin()` usada na linha 443 mas criada na 1004 → em base nova as políticas de admin falhavam | Corrigido (criada no topo) |
| 5 | `SUPABASE_SETUP.sql`: agendamento diário activo com marcadores `<o-teu-...>` → motor de cobrança nunca corria | Corrigido (comentado; preencher e activar no passo 4) |
| 6 | `public/_redirects` a voltar ("Infinite loop" no Cloudflare) | Removido (apagar também no repositório) |
| 7 | Sem `.gitignore` (node_modules/dist podiam ir para o GitHub) | Criado |
| 8 | Variáveis Firebase vazias → sem notificações push; `.env.example` nem as listava | `.env.example` actualizado; preencher (passo 6) |
| 9 | Falta o secret `ZUMBOPAY_WALLET_ID` (obrigatório na API real) | Passo 2 |
| 10 | Erros da ZumboPay chegavam à app só como "non-2xx" | Corrigido (mensagem real) |
| 11 | 169 avisos de formatação (prettier) | Corrigido nos ficheiros alterados; restam 12 avisos inofensivos |
| 12 | **Pagar uma publicação (24h/3d) ou qualquer evento falhava** com "Falha ao registar o pagamento": a constraint `payments_boost_package_id_check` só aceitava '1d','7d','30d' | Corrigido (migração 008, ponto 4) |
| 13 | **Cliente B recebia o link e os dados do cliente A**: a função reaproveitava qualquer pagamento pendente do mesmo negócio+plano nos 10 min seguintes (quarto, mesa, post, evento, boost) | Corrigido: só assinaturas reaproveitam (anti duplo-clique); o resto cria sempre pagamento novo |

Ponto em aberto de negócio: a doc da ZumboPay diz que o checkout desconta 8% de comissão. Confirma com o suporte antes de fixar preços/comissões.

## Ordem para lançar
### 1. Código (10 min)
```
# no PowerShell, na pasta do projecto
git rm public/_redirects        # se ainda existir
# substituir o conteúdo pelo do zip v37, depois:
git add -A
git commit -m "v37: pagamentos ZumboPay, reservas por categoria, 100%/20%, SEO, layout largo"
git push
```
### 2. Base de dados (20 min)
1. Supabase → SQL Editor → colar `supabase/VERIFICAR_BD.sql` → Run. Cada linha "FALTA" diz o ficheiro a correr.
2. Correr, por esta ordem, o que faltar: `008` → `009` → `010` (são seguros de repetir). Se faltar algo anterior, correr também 002–007 por ordem.
3. Database → Extensions: activar `pg_cron` e `pg_net`. Database → Replication: activar `payments`, `room_reservations`, `table_reservations`.
4. Voltar a correr `VERIFICAR_BD.sql` até não haver "FALTA".
5. Garantir que és admin: `insert into public.admins(id) select id from auth.users where email='o-teu-email' on conflict do nothing;`

### 3. Secrets das funções (Supabase → Edge Functions → Secrets)
`ZUMBOPAY_API_KEY`, `ZUMBOPAY_MERCHANT_ID`, `ZUMBOPAY_WALLET_ID`, `ZUMBOPAY_WEBHOOK_SECRET`, `FUNCTION_SECRET` (inventa um valor longo),
`RESEND_API_KEY`, `RESEND_FROM`, `ADMIN_NOTIFY_EMAIL=xtackoficial@gmail.com`, `FIREBASE_SERVICE_ACCOUNT_JSON` (se usares push).
Nunca pôr estas chaves no código do browser nem no GitHub.

### 4. Publicar as funções (na pasta do projecto)
```
supabase login
supabase link --project-ref <ref-do-projecto>
supabase functions deploy create-zumbopay-payment
supabase functions deploy zumbopay-webhook
supabase functions deploy reservation-respond
supabase functions deploy run-billing-engine
supabase functions deploy reactivate-rooms
supabase functions deploy send-scheduled-notifications
supabase functions deploy send-merchant-promo
supabase functions deploy delete-own-account
```
O `config.toml` já desliga a verificação de JWT nas 4 funções que o precisam. Depois, no SQL Editor, activa o agendamento diário
(bloco comentado no fim da secção do motor de cobrança em `SUPABASE_SETUP.sql`): troca `<o-teu-project-ref>` e `<o-teu-FUNCTION_SECRET>`.

### 5. Painel ZumboPay
Programadores → Webhooks: URL `https://<ref>.supabase.co/functions/v1/zumbopay-webhook`, eventos `payment.succeeded` e `payment.failed`,
e o "signing secret" vai para `ZUMBOPAY_WEBHOOK_SECRET`. Carteiras: copiar o `wallet_id`.

### 6. Testes antes de abrir ao público (Ctrl+Shift+R em cada ecrã)
- [ ] Pagamento pequeno (ex.: Turbinar) → abre o checkout → paga → a app confirma sozinha.
- [ ] Em Supabase → Edge Functions → zumbopay-webhook → Logs: pedido recebido com status 200.
- [ ] Conta de HOTEL: Definições de reserva aparecem; reservar quarto com "Sinal 20%" e com "Pagar tudo"; o e-mail de controlo chega com o prazo.
- [ ] Aceitar e recusar uma reserva (mensagem certa ao cliente; e-mail de reembolso com o valor pago).
- [ ] Conta de TÁXI: não vê Definições de reserva nem botões de reserva.
- [ ] PC em ecrã largo: login em 2 colunas, listas em grelha, sem moldura de telemóvel.
- [ ] Telemóvel rodado e botão "voltar" várias vezes (navegação sem empilhar).

### 7. Antes do lançamento público
Firebase (push), domínio definitivo (trocar em `index.html`, `robots.txt`, `sitemap.xml`), Google Search Console + enviar `sitemap.xml`,
Lighthouse, e confirmar a comissão de 8% com a ZumboPay.
