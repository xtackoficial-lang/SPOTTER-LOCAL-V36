# Integração ZumboPay — Spotter Local (assinaturas)

## Melhorias desta versão vs a primeira entrega

| Problema na v1 | Correção |
|---|---|
| Realtime não estava activado na tabela `payments` — a confirmação automática nunca chegaria à app | Migração agora inclui `alter publication supabase_realtime add table public.payments;` |
| Clique duplo podia gerar 2 Payment Links para a mesma assinatura | `create-zumbopay-payment` reutiliza um pedido "pending" recente em vez de duplicar; `merchant_ref` passou a ter unique index |
| Se o Realtime falhasse/caísse, a app ficava presa em "a aguardar" para sempre | Adicionado polling de segurança a cada 5s como fallback, além do Realtime |
| Popup do link de pagamento podia ser bloqueado pelo browser sem aviso | Deteta bloqueio e mostra botão "Abrir link de pagamento" |
| Se o comerciante fechasse a aba do link sem querer, não havia forma de voltar a abrir | Botão "Reabrir link de pagamento" sempre visível no ecrã de espera |
| Webhook só reconhecia a transação pela `reference`; se a ZumboPay mandasse só o `id` deles, perdia-se | Lookup com fallback: primeiro por `reference`, depois por `zumbopay_payment_id` |
| Webhook processaria qualquer evento sem filtrar tipo | Ignora eventos que não sejam de pagamento (ex: payouts, refunds), caso a ZumboPay reutilize o mesmo endpoint |
| Erros de JSON inválido no webhook rebentavam como erro 500 genérico | Tratados explicitamente como 400 |

## Âmbito desta entrega

Só pagamento de assinaturas (starter/pro/premium). Reservas de mesa e
pagamentos de hotel ficam de fora, como combinado — integram-se depois,
reaproveitando o mesmo padrão.

## O que muda no teu projeto

| Ficheiro | O que aconteceu |
|---|---|
| `supabase/migrations/002_zumbopay_subscriptions.sql` | Novo — corre no SQL Editor do Supabase |
| `supabase/functions/create-zumbopay-payment/index.ts` | Novo — Edge Function |
| `supabase/functions/zumbopay-webhook/index.ts` | Novo — Edge Function |
| `src/lib/payments-db.ts` | Editado — adiciona `"zumbopay"` como método + `createZumboPayPayment()`. Tudo o resto (mpesa/emola/manual) fica exactamente igual |
| `src/routes/payment.tsx` | Editado — novo botão "Pagar online (ZumboPay)" + subscrição em tempo real que confirma sozinha |

**Nada do fluxo manual existente foi removido.** M-Pesa/e-Mola/Transferência manual continuam a funcionar como antes — o ZumboPay é só mais uma opção.

## Passo a passo para aplicar

### 1. Base de dados
No Supabase → SQL Editor, corre o ficheiro:
```
supabase/migrations/002_zumbopay_subscriptions.sql
```

### 2. Substituir os ficheiros no teu projeto
Copia por cima dos originais:
- `src/lib/payments-db.ts`
- `src/routes/payment.tsx`

(São os ficheiros completos, já com as tuas alterações anteriores preservadas — pode comparar com o teu original antes de substituir, se quiseres confirmar.)

### 3. Publicar as Edge Functions
Com a Supabase CLI instalada e autenticada:
```bash
supabase functions deploy create-zumbopay-payment
supabase functions deploy zumbopay-webhook
```

### 4. Configurar os secrets (nunca no `.env` do Vite!)
Isto é importante: como o projecto é uma SPA Vite, qualquer variável `VITE_*`
no `.env` fica **visível no browser** (faz parte do bundle). A chave da
ZumboPay NUNCA pode ir para lá. As Edge Functions correm no servidor —
é lá que os secrets ficam protegidos.

No Supabase → Edge Functions → Secrets (ou via CLI):
```bash
supabase secrets set ZUMBOPAY_API_KEY=zk_live_xxxxxxxxxxxx
supabase secrets set ZUMBOPAY_MERCHANT_ID=MCH_543CDD49F2
supabase secrets set ZUMBOPAY_WEBHOOK_SECRET=<secret que a ZumboPay te der ao criar o webhook>
supabase secrets set ZUMBOPAY_WEBHOOK_URL=https://<project-ref>.supabase.co/functions/v1/zumbopay-webhook
```
`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem por omissão em qualquer projecto Supabase.

### 5. Configurar o webhook no dashboard da ZumboPay
Developers → Webhooks → Novo webhook:
- URL: `https://<project-ref>.supabase.co/functions/v1/zumbopay-webhook`
- Guarda o **webhook secret** que eles derem — é diferente da API key, e é o que vai para `ZUMBOPAY_WEBHOOK_SECRET` acima.

## ⚠️ Pontos a confirmar com a documentação oficial da ZumboPay

Escrevi este código com base nos padrões mais comuns deste tipo de API,
mas há 3 coisas que só a documentação real deles confirma — estão marcadas
com `// AJUSTAR` no código:

1. **Endpoint exacto** — assumi `POST https://api.zumbopay.com/v1/payments`
2. **Nomes dos campos na resposta** — assumi `payment_url` (ou `url`/`link`) e `id`
3. **Header e algoritmo da assinatura do webhook** — assumi `X-Zumbopay-Signature` com HMAC-SHA256 sobre o corpo em bruto

Assim que tiveres a documentação (ou a resposta ao email/WhatsApp que já enviaste), manda-me e eu ajusto estes 3 pontos — é uma alteração pequena e localizada, não mexe no resto.

## Como testar

1. Gera a tua API key na ZumboPay (scopes: `payments:read`, `payments:write`, `webhooks:write`) — **modo sandbox se existir**
2. Configura os secrets acima
3. No Spotter Local, vai a `/payment`, escolhe um plano, escolhe "Pagar online (ZumboPay)"
4. Deve abrir o link de pagamento numa nova aba
5. Ao completar o pagamento (ou simular no sandbox), a página original deve avançar sozinha para "Plano activado" — sem precisares de fazer nada no `/admin`

Se ficar preso em "a aguardar confirmação", o mais provável é o webhook não estar a chegar — confirma a URL configurada no dashboard da ZumboPay e os logs da function `zumbopay-webhook` (Supabase → Edge Functions → Logs).
