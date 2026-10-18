# v38 — Aba/categoria PENSÃO (quartos por hora e por dia)

## O que muda na app
- Nova categoria de negócio: **Pensão** (aparece ao criar/editar o negócio).
- A Pensão pode ter reservas de quarto online, como o hotel.
- Em cada quarto da Pensão o comerciante define **preço por dia** e/ou **preço por hora**
  (pode deixar um em branco, ex.: só por hora).
- O cliente, ao reservar, escolhe **Por horas** (dia + hora de entrada + nº de horas, 1 a 12)
  ou **Por dia** (entrada e saída). O total é calculado pelo servidor.
- Comissão da plataforma: **10% do valor total** (hora × preço/hora, ou noites × preço/dia).
  Continua a opção do cliente pagar 100% ou sinal de 20%.
- Dashboard, "As minhas reservas", e-mail e mensagens mostram "2026-10-12 às 14:00 (3h)"
  nas reservas por hora.

## Passos para pôr a funcionar (por esta ordem)
1. Supabase → SQL Editor → correr `supabase/migrations/011_pension_hourly.sql`
   (já está também dentro de `1_RUN_NO_SUPABASE.sql`). É idempotente.
2. Fazer deploy das 2 Edge Functions alteradas:
   `supabase functions deploy create-zumbopay-payment`
   `supabase functions deploy zumbopay-webhook`
3. Publicar a app (push para o GitHub → Vercel/Cloudflare).
4. Um negócio que já exista tem de mudar a categoria para "Pensão" (editar negócio),
   e depois ligar "aceita reservas de quarto" e criar os quartos com os preços.

## Ficheiros alterados
src/lib: onboarding-storage, reservation-eligibility, profile-styles, reservations-db,
payments-db, reservation-filters
src/routes: manage-rooms, reserve-room.$roomId, rooms.$businessId, my-reservations,
reservations-dashboard
supabase: migrations/011_pension_hourly.sql (novo), 1_RUN_NO_SUPABASE.sql,
functions/create-zumbopay-payment, functions/zumbopay-webhook

Verificado: `tsc --noEmit` 0 erros, eslint 0 erros, `vite build` OK.
As Edge Functions só foram verificadas em sintaxe (sem Deno aqui) — testar um pagamento real.
