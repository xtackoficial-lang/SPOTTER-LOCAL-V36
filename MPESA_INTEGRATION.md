# M-Pesa directo (substitui a ZumboPay) — v47

A ZumboPay foi desligada. Os pagamentos (planos, publicações, reservas de quarto e de mesa) são cobrados
directamente pela API M-Pesa da Vodacom: o cliente escreve o número M-Pesa (84/85), recebe o pedido de PIN no
telemóvel e, quando confirma, a app activa o que foi pago.

## O que mudou
| Parte | Antes (ZumboPay) | Agora (M-Pesa) |
|---|---|---|
| Função de cobrança | `create-zumbopay-payment` | `create-mpesa-payment` (nova) |
| Confirmação | webhook `zumbopay-webhook` | na própria resposta da cobrança (sem webhook) |
| Activar plano/reserva/publicação | dentro do webhook | `_shared/fulfill-payment.ts` (mesma lógica, extraída) |
| Cliente da API | — | `_shared/mpesa.ts` |
| App | abria um link de pagamento | pede o número M-Pesa e mostra "confirma no telemóvel" |

As duas funções da ZumboPay foram **apagadas** do projecto. Não há migração SQL: a tabela `payments` já aceita `method = 'mpesa'`
e já tem as colunas `phone` e `operator_ref`. Os pagamentos antigos (`zumbopay`) continuam visíveis no /admin.

## Passos
1. **Segredos** (Supabase → Edge Functions → Secrets, ou CLI):
   ```
   npx supabase secrets set MPESA_API_KEY=<API Key do portal> \
     MPESA_PUBLIC_KEY=<Public Key do portal> \
     MPESA_SERVICE_PROVIDER_CODE=171717 \
     MPESA_ENV=sandbox
   ```
   (`171717` é o shortcode de testes. Em produção é o shortcode da XTACK.)
2. **Deploy**:
   ```
   npx supabase functions deploy create-mpesa-payment
   npx supabase functions delete zumbopay-webhook
   npx supabase functions delete create-zumbopay-payment
   ```
   Depois podes apagar os segredos `ZUMBOPAY_*`. Deploy da app como de costume.
3. **Testar em sandbox**: no portal M-Pesa, o simulador usa o número `258843330333`. Faz um pagamento de teste (ex.: plano Starter)
   e vê nos logs da função (`mpesa c2b 200 INS-0 ...`). Em sandbox não aparece PIN real.
4. **Produção**: pede à Vodacom a passagem a produção (precisa do shortcode da XTACK). Eles dão uma API Key e Public Key novas.
   Muda os 3 segredos e `MPESA_ENV=production`. No portal, "Fontes confiáveis" fica `*` (as Edge Functions não têm IP fixo).

## O que confirmar no sandbox (não foi possível testar daqui)
- O Supabase consegue ligar à porta **18352** (cobrança). Se der erro de ligação nos logs, é isto.
- A porta da consulta de estado (**18353**, `MPESA_QUERY_PORT`) e o campo `output_ResponseTransactionStatus` — só são usados quando a resposta da cobrança fica em dúvida.
- Se a Vodacom recusar o cabeçalho `Origin`, define `MPESA_ORIGIN` com o valor que eles indicarem.

## Comportamento a saber
- Só **M-Pesa (84/85)** — e-Mola, mKesh e cartão deixam de estar disponíveis (a ZumboPay oferecia-os).
- A cobrança espera até ~60 s pelo PIN. Se a ligação do cliente cair, a app volta a perguntar de 6 em 6 s (`action: "check"`), e o servidor consulta a M-Pesa e activa se já foi pago.
- Duplo clique: um 2.º pedido ao mesmo número em < 90 s é recusado (evita dois pedidos de PIN).
- Se o dinheiro foi cobrado mas a activação falhou, aparece nos logs `PAGO MAS NÃO ACTIVADO` e `payments.fail_reason = fulfil_error: …`.
- A comissão de 8% da ZumboPay deixa de existir; passam a valer as tarifas M-Pesa do teu contrato com a Vodacom.
- `testes-locais/` simula a ZumboPay e ficou obsoleto.
