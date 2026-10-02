-- ============================================================
-- Spotter Local — 010: reservas de quarto com 2 opções de pagamento
-- Pedido do Abrão (2026-09-30): o cliente escolhe pagar 100% do quarto
-- OU um sinal de 20% para garantir a reserva (a opção de 10% acabou).
-- Depois de pago, o hotel tem um prazo para responder.
-- Correr no Supabase → SQL Editor, depois da 009 (idempotente).
-- ============================================================

alter table public.room_reservations
  add column if not exists payment_option text not null default 'deposit',
  add column if not exists amount_paid numeric,
  add column if not exists balance_due numeric,
  add column if not exists response_deadline timestamptz;

alter table public.room_reservations drop constraint if exists room_reservations_payment_option_check;
alter table public.room_reservations
  add constraint room_reservations_payment_option_check
  check (payment_option in ('full', 'deposit'));

-- Reservas antigas (fluxo dos 10%): o que o cliente pagou foi a "comissão".
update public.room_reservations
   set amount_paid = commission_amount,
       balance_due = greatest(total_price - commission_amount, 0)
 where amount_paid is null;

create index if not exists idx_room_reservations_deadline
  on public.room_reservations(response_deadline)
  where status = 'pending_approval';
