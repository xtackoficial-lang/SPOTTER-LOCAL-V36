# XLOCAL — PARTE 2 COMPLETA (com funcionalidades online) ✅

## Novos ficheiros adicionados

| Ficheiro | Função |
|---|---|
| `src/lib/supabase.ts` | Cliente Supabase + Schema SQL completo |
| `src/lib/auth.ts` | Autenticação real (signUp, signIn, signOut) |
| `src/lib/auth-context.ts` | Hook global `useAuth()` |
| `src/lib/businesses-db.ts` | Negócios online + fallback local |
| `src/lib/products-db.ts` | Produtos online + fallback local |
| `src/lib/messages-db.ts` | Chats em tempo real (Supabase Realtime) |
| `src/lib/map-places.ts` | Pins do mapa com dados online |
| `src/routes/index.tsx` | Login/registo real com Supabase |
| `src/routes/map.tsx` | Mapa interactivo com pins (Leaflet + OSM) |
| `src/lib/admin-storage.ts` | Painel admin XTACK |
| `src/routes/admin.tsx` | Painel admin completo |
| `.env.example` | Template de variáveis de ambiente |

---

## Como activar o modo online

1. Criar projecto em https://supabase.com (gratuito)
2. Copiar `.env.example` → `.env`
3. Preencher `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
4. No Supabase SQL Editor, executar o schema em `src/lib/supabase.ts`
5. `bun install && bun dev`

**Sem o .env configurado**, o app funciona em modo demo (localStorage).

---

## Tabelas Supabase criadas

- `profiles` — utilizadores registados
- `businesses` — negócios/comerciantes com coordenadas GPS
- `products` — produtos de cada negócio
- `messages` — chats com Realtime activado
- `subscriptions` — histórico de pagamentos M-Pesa/e-Mola

---

## O que é online vs local

| Funcionalidade | Online (Supabase) | Offline (localStorage) |
|---|---|---|
| Autenticação | ✅ Email real | ✅ Simulado |
| Negócios no mapa | ✅ Base de dados central | ✅ 12 dados demo |
| Produtos dos comerciantes | ✅ Partilhados entre dispositivos | ✅ Apenas no dispositivo |
| Chats | ✅ Tempo real | ✅ Locais |
| Painel admin | ✅ Todos os comerciantes | ✅ 5 dados demo |
| Pagamentos | Parte 3 (M-Pesa webhook) | — |

---

## Parte 3 — Quando pedires
- Integração M-Pesa / e-Mola com webhook de confirmação
- Bloqueio automático por falta de pagamento
- Notificações push (renovação, nova mensagem)
- Dashboard analytics por comerciante
- Sistema de avaliações e reviews

---
© XTACK OFICIAL · Inhambane / Maputo

## v2.6 — Pagamentos, Painel Avançado & Feature Flags
- Admin: 10 cliques no logo para revelar campo de senha
- Admin: aba Pagamentos — configurar números M-Pesa/e-Mola via painel
- Admin: aba Comprovativos — revisar e confirmar/rejeitar pagamentos
- Admin: aba Push — disparar notificações segmentadas (por cidade, plano, inactivos)
- Admin: aba Feature Flags — ligar/desligar funções sem rebuild
- Payment: botão copiar número XTACK (M-Pesa/e-Mola) dinâmico
- Payment: fluxo de envio de comprovativo + botão WhatsApp
