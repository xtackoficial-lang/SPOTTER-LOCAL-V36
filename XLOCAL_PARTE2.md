# XLOCAL — PARTE 2 COMPLETA ✅

## O que foi adicionado

### Ficheiros novos
- `src/lib/admin-storage.ts` — CRUD de comerciantes, sessão admin, seed de demo
- `src/routes/admin.tsx` — Painel XTACK Admin completo

### Ficheiros modificados
- `src/routeTree.gen.ts` — Rota `/admin` registada
- `src/routes/profile.tsx` — Link discreto "xtack" → /admin

---

## Funcionalidades da Parte 2

### Painel Admin XTACK (`/admin`)
- Login protegido por password: **xtack2026admin**
- KPIs: Total, Activos, Em atraso, MRR em MZN
- Listagem de todos os comerciantes com filtros por estado
- Busca por nome, proprietário ou cidade
- Cartão de cada comerciante:
  - Nome, proprietário, cidade, telefone
  - Plano (Starter/Pro/Premium) + preço MZN
  - Estado (Activo / Trial / Em atraso / Bloqueado)
  - Método de pagamento (M-Pesa / e-Mola / Manual)
  - Dias até renovação (com alerta visual)
  - Notas internas
- Acções rápidas: Activar, Bloquear, Ligar
- Modal de edição completa de cada comerciante
- Adicionar novo comerciante
- Remover comerciante (com confirmação)
- Notificação de planos a vencer em ≤3 dias
- Seed com 5 comerciantes demo (Bom Gosto, Ponte Cais, Ibiza, A Fornalha, Hotel Bom Amigo)
- Botão Sair (logout)

### Sistema de mensalidades (`subscription-storage.ts`) — já existia
- Estados: active / trial / overdue / blocked
- Trial 14 dias → overdue → blocked automático
- Método activate() para renovar plano

### Gestão de produtos (`products-storage.ts`) — já existia
- CRUD completo com limite por plano
- Bloqueio quando conta bloqueada

---

## Como aceder ao painel admin
1. Ir ao perfil → clicar no texto "xtack" (discreto, em baixo)
2. Ou navegar directamente para `/admin`
3. Password: `xtack2026admin`

---

## Parte 3 — Quando pedires
- Integração M-Pesa / e-Mola real
- Supabase (tabelas, auth, RLS)
- Cobrança mensal recorrente
- Bloqueio automático por webhook
- Documentação de como cobrar e escalar

---
© XTACK OFICIAL · Inhambane / Maputo
