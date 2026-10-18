# v40 — Eventos: data de fim + gestão dos teus eventos

## Novo
- **Data de início e Data de fim (opcional)** no formulário. Validações: não pode ser no passado,
  o fim não pode ser antes do início.
- **"Visível na aba Eventos até DD/MM/AAAA"** (calculado pelos dias pagos). Se o evento acaba depois
  de a publicação terminar, aparece um aviso e um botão "Usar N dias" para cobrir o evento todo.
- **"Os teus eventos"** (no ecrã de publicar): estado de cada evento (Visível · faltam N dias /
  Terminado), **Repetir** (preenche o formulário com os dados e o cartaz, só pagas de novo) e
  **Remover**.
- Aba Eventos: mostra o intervalo de datas, etiqueta **A DECORRER** e botão **Partilhar**
  (partilha nativa no telemóvel; no PC copia o texto).
- A aba esconde eventos que já terminaram (data de fim, ou de início se não houver fim).

## Segurança contra falhas
- Se as migrações ainda não foram corridas, a app **não parte**: a lista de eventos volta à pesquisa
  antiga e o webhook publica o evento pago sem as colunas novas.

## Passos
1. Supabase → SQL Editor → correr `012_events_per_day.sql` e `013_event_end_date.sql`
   (ambas dentro de `1_RUN_NO_SUPABASE.sql`; idempotentes).
2. Deploy da Edge Function `zumbopay-webhook` (e `create-zumbopay-payment` se ainda não fizeste o da v39).
3. Publicar a app.

Verificado: tsc 0 erros, eslint 0 erros, vite build OK. Edge Functions só verificadas em sintaxe.
