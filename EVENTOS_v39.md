# v39 — Só "Publicar evento", com preço por dia

## O que muda
- No painel do comerciante saiu o botão "Publicar foto no feed". Fica só **Publicar evento — 50 MZN/dia**,
  com uma frase a explicar para que serve.
- No ecrã de publicar evento há uma caixa "Para que serve?" e "Quanto custa".
- O preço é **50 MZN por dia**, de 1 a 30 dias (atalhos 1, 3, 7, 14, 30 + botões − / +).
  Exemplo: 3 dias = 150 MZN. O servidor calcula o valor (o cliente não o consegue alterar).
- Passados os dias pagos, o evento **sai sozinho** da aba Eventos.
- A antiga escolha "Listagem simples / Destaque" foi retirada.

## Passos
1. Supabase → SQL Editor → correr `supabase/migrations/012_events_per_day.sql`
   (também está dentro de `1_RUN_NO_SUPABASE.sql`; idempotente).
2. Deploy das Edge Functions: `create-zumbopay-payment` e `zumbopay-webhook`.
3. Publicar a app.

Notas: eventos já publicados antes ficam sem data de fim (como antes). Apps antigas em cache
continuam a pagar o preço antigo até atualizarem. A rota /publish-post continua no código, só
deixou de ter botão no painel.
Verificado: tsc 0 erros, eslint 0 erros, vite build OK. Edge Functions só verificadas em sintaxe.
