# XLOCAL — PARTE 3 COMPLETA ✅

## Novos ficheiros

| Ficheiro | Função |
|---|---|
| `src/lib/payments-db.ts` | Pedidos M-Pesa/e-Mola, instruções de pagamento |
| `src/lib/billing-engine.ts` | Cobrança recorrente, bloqueio automático, notificações |
| `src/lib/analytics-db.ts` | Tracking de visitas, cliques, conversões por negócio |
| `src/lib/reviews-db.ts` | Sistema de avaliações 1–5 estrelas com stats |
| `src/routes/payment.tsx` | Página de pagamento com instruções M-Pesa/e-Mola |
| `src/routes/analytics.tsx` | Dashboard analytics por comerciante |
| `src/routes/reviews.$id.tsx` | Avaliações de um negócio |
| `src/routes/admin.tsx` | Actualizado com tabs Billing + Notificações |

---

## Funcionalidades da Parte 3

### Pagamentos M-Pesa / e-Mola (`/payment`)
- Seleccionar plano (Starter/Pro/Premium)
- Seleccionar método: M-Pesa, e-Mola ou Transferência Bancária
- Instruções passo a passo com código USSD
- Referência única de pagamento (`XL-XXXXX-XX-XXXXX`)
- Countdown de 10 minutos para expirar o pedido
- Confirmação simulada em modo demo
- Em produção: webhook confirma automaticamente

### Motor de Cobrança Recorrente (`billing-engine.ts`)
- Corre uma vez por hora (throttle automático)
- Trial com ≤3 dias → notificação
- Trial expirado → muda para `overdue`
- Active com renovação em ≤2 dias → alerta
- Overdue por mais de 5 dias → **bloqueio automático**
- Registo de todas as acções como notificações
- Painel admin: botão "Correr billing agora" para forçar execução

### Analytics por Comerciante (`/analytics`)
- Tracking de visitas ao perfil, cliques, mensagens, pins no mapa
- Gráfico de barras (últimos 14 dias)
- Taxa de conversão: visitas → cliques → mensagens
- Top 5 dias com mais visitas
- Tabela completa de 30 dias
- Dados demo gerados automaticamente se sem registos reais

### Avaliações (`/reviews/:id`)
- Submeter avaliação com 1–5 estrelas e texto
- Distribuição por estrelas com barra de progresso
- Média calculada automaticamente
- Marcar avaliação como "útil"
- Reportar avaliação inapropriada
- Dados demo realistas (5 avaliações de exemplo)
- Integração Supabase quando configurado

### Painel Admin — Novas tabs
**Tab Billing:**
- KPIs: MRR, ARR estimado, receita em risco, taxa de conversão
- Distribuição de comerciantes por plano (Starter/Pro/Premium)
- Botão para forçar execução do motor de billing

**Tab Notificações:**
- Feed de todas as notificações de billing
- Código de cor por tipo: trial, overdue, bloqueado, renovado
- Botão "Marcar todas como lidas"
- Badge no cabeçalho da tab com contagem de não lidas

---

## SQL adicional para Supabase

```sql
-- TABELA: payments (pedidos de pagamento)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  merchant_ref text not null unique,
  plan_id text check (plan_id in ('starter','pro','premium')),
  amount numeric(10,2),
  currency text default 'MZN',
  method text check (method in ('mpesa','emola','manual')),
  phone text,
  status text check (status in ('pending','confirmed','failed','expired')) default 'pending',
  operator_ref text,
  confirmed_at timestamptz,
  fail_reason text,
  created_at timestamptz default now(),
  expires_at timestamptz
);
alter table public.payments enable row level security;
create policy "Dono vê os seus pagamentos" on public.payments
  for all using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );

-- TABELA: analytics (tracking de eventos)
create table if not exists public.analytics (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  date date not null,
  views int default 0,
  clicks int default 0,
  messages int default 0,
  map_pins int default 0,
  unique(business_id, date)
);
alter table public.analytics enable row level security;
create policy "Dono vê as suas analytics" on public.analytics
  for select using (
    auth.uid() = (select owner_id from public.businesses where id = business_id)
  );

-- TABELA: reviews (avaliações)
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  rating int check (rating between 1 and 5),
  text text,
  verified boolean default false,
  helpful int default 0,
  reported boolean default false,
  created_at timestamptz default now()
);
alter table public.reviews enable row level security;
create policy "Todos vêem reviews não reportadas" on public.reviews
  for select using (reported = false);
create policy "Autenticados podem submeter" on public.reviews
  for insert with check (auth.uid() = author_id);

-- FUNÇÃO: incrementar analytic (upsert)
create or replace function public.increment_analytic(
  p_business_id uuid, p_date date, p_type text
) returns void language plpgsql security definer as $$
begin
  insert into public.analytics (business_id, date, views, clicks, messages, map_pins)
  values (p_business_id, p_date, 0, 0, 0, 0)
  on conflict (business_id, date) do nothing;

  if p_type = 'view' then
    update public.analytics set views = views + 1 where business_id = p_business_id and date = p_date;
  elsif p_type = 'click' then
    update public.analytics set clicks = clicks + 1 where business_id = p_business_id and date = p_date;
  elsif p_type = 'message' then
    update public.analytics set messages = messages + 1 where business_id = p_business_id and date = p_date;
  elsif p_type = 'mapPin' then
    update public.analytics set map_pins = map_pins + 1 where business_id = p_business_id and date = p_date;
  end if;
end;
$$;

-- FUNÇÃO: actualizar média de rating do negócio
create or replace function public.update_business_rating(p_business_id uuid)
returns void language plpgsql security definer as $$
declare
  v_avg numeric;
  v_count int;
begin
  select avg(rating), count(*) into v_avg, v_count
  from public.reviews
  where business_id = p_business_id and reported = false;
  
  update public.businesses
  set rating = coalesce(v_avg, 0), reviews_count = coalesce(v_count, 0)
  where id = p_business_id;
end;
$$;

-- FUNÇÃO: incrementar helpful em review
create or replace function public.increment_helpful(p_review_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.reviews set helpful = helpful + 1 where id = p_review_id;
end;
$$;
```

---

## Como integrar webhook real M-Pesa

Em produção, a Vodacom M-Pesa envia um POST ao confirmar pagamento:

```typescript
// Exemplo de handler (Node/Express/Supabase Edge Function)
export async function POST(req: Request) {
  const body = await req.json();
  // body.transactionReference = referência do comerciante
  // body.responseCode = "0" = sucesso
  
  if (body.responseCode === "0") {
    const payment = await supabase
      .from("payments")
      .select("*")
      .eq("merchant_ref", body.transactionReference)
      .single();
    
    if (payment.data) {
      await confirmPayment(payment.data.id, body.mpesaReference);
      await activatePlanAfterPayment(
        payment.data.business_id,
        payment.data.plan_id,
        body.mpesaReference
      );
    }
  }
  return Response.json({ ok: true });
}
```

**Contacto para conta merchant M-Pesa Moçambique:**
- Vodacom Business: business.mz@vodacom.co.mz
- e-Mola (Emtel): developers@emtel.co.mz

---

## Como escalar

| Fase | Acção |
|---|---|
| **Agora** | Demo local com confirmação manual |
| **Fase 2** | Supabase + webhook M-Pesa/e-Mola sandbox |
| **Fase 3** | Conta merchant Vodacom + go-live |
| **Fase 4** | Notificações push (Firebase FCM) |
| **Fase 5** | Dashboard analytics em tempo real |

---

© XTACK OFICIAL · Inhambane / Maputo
