# Spotter Local v37 — correções (2026-09-30)

## 1. Pagamentos ZumboPay (PRIORIDADE 1)
Causa: a Edge Function chamava `api.zumbopay.com/v1/payments` — esse domínio não existe (erro DNS).
Corrigido conforme a doc oficial: `POST https://zumbopay.com/api/public/v1/payments` (checkout hospedado
M-Pesa/e-Mola/cartão) → devolve `data.checkout_url`.

Passos (por esta ordem):
1. Supabase → SQL Editor → correr `supabase/migrations/008_fix_payments_constraints.sql`
   (aceita method='zumbopay' e plan_id 'room'/'table' — sem isto as reservas pagas também falhavam).
2. Painel ZumboPay → Carteiras: copiar o `wallet_id` (UUID ou código de 6 dígitos) da carteira de destino.
3. Supabase → Edge Functions → Secrets:
   - ZUMBOPAY_API_KEY = zk_live_...
   - ZUMBOPAY_MERCHANT_ID = MCH_...
   - ZUMBOPAY_WALLET_ID = <wallet_id>            ← NOVO, obrigatório
   - ZUMBOPAY_WEBHOOK_SECRET = whsec_...
4. Publicar: `supabase functions deploy create-zumbopay-payment` e `supabase functions deploy zumbopay-webhook`
5. Painel ZumboPay → Programadores → Webhook: URL da função `zumbopay-webhook`, eventos payment.succeeded e payment.failed.

Nota: a doc diz que o checkout desconta 8% de comissão da plataforma. Confirmar com o suporte da ZumboPay
antes de fixar preços/comissões das reservas.
Erros da ZumboPay passam a aparecer na app com a mensagem real (antes: "non-2xx status code").

## 2. Ecrã cheio no computador (PRIORIDADE 2)
- `__root.tsx`: rotas largas (login, home, pesquisa, mapa, eventos, negócio, painéis) usam 100% da largura;
  formulários ficam numa coluna central legível. Fundo do body segue o tema.
- Login: em ecrã largo passa a 2 colunas (hero à esquerda, cartão à direita, ecrã inteiro).
- Listas de negócios: até 4 colunas em ecrãs muito largos.

## 3. SEO / desempenho (PRIORIDADE 3)
- Novos: `public/robots.txt`, `public/sitemap.xml`, `public/og-image.jpg` (1200x630).
- `index.html`: canonical, Open Graph absoluto, Twitter card, schema.org (Organization/WebSite/WebApplication), noscript com h1.
- Página de cada negócio: título e descrição dinâmicos + schema.org LocalBusiness + h1.
- Imagens do onboarding: 1,9 MB → 49 KB (WebP).
- Removido `public/_redirects` (causava "Infinite loop" no deploy Cloudflare).
- TROCAR o domínio `spotter-local.xtackoficial.workers.dev` pelo definitivo em: index.html, robots.txt, sitemap.xml.

## 4. Velocidade (Core Web Vitals)
- As 28 imagens de fundo (8,3 MB em base64 dentro do código) passaram a ficheiros WebP em `public/backgrounds/` (3,4 MB no total, só se descarrega a escolhida).
- Divisão automática do código por página (`autoCodeSplitting`): ficheiro principal 972 KB -> 382 KB (267 -> 127 KB comprimido).
- `loading="lazy"` em 19 imagens; h1 em todas as páginas públicas; `vercel.json` (rotas SPA + cache longo).
- Todas as imagens já tinham `alt`.

## Ainda por fazer
- Base de dados (próxima fase): rever SUPABASE_SETUP.sql + migrações 002-008, RLS e Realtime.
- Testar no browser depois do deploy (a divisão de código e o layout largo só foram validados por tsc + build, não em execução).
- Registar no Google Search Console e submeter o sitemap; correr Lighthouse.
- Trocar o domínio provisório workers.dev pelo definitivo.
