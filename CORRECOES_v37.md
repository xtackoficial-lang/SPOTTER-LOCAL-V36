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

## 5. Reservas online só para os tipos certos (pedido de 2026-09-30)
- Quarto: só `hotel` e `hotel_restaurant`. Mesa/espaço: `hotel`, `hotel_restaurant`, `restaurant`, `snack_bar` (Lanchonete, nova categoria) e `tourism_site` (parques).
- Táxi, farmácia, barbearia, etc. deixam de ver "Definições de reserva", "Gerir quartos" e os botões de reserva no perfil.
- Protegido em 3 camadas: app (`src/lib/reservation-eligibility.ts`), Edge Function `create-zumbopay-payment` (recusa o pagamento) e BD (migração `009_reservation_categories.sql`: limpa dados antigos e trigger que força "desligado").
- Correr no Supabase, depois da 008: `009_reservation_categories.sql`.

## 6. Reservas de quarto: 100% ou sinal de 20% + prazo de resposta (pedido de 2026-09-30)
- A opção de 10% foi removida. Cada hotel passa a oferecer: **pagar tudo (100%)** ou **sinal de 20%** (o resto paga-se no hotel).
- O servidor calcula o valor (o cliente só escolhe a opção). `ZUMBOPAY` cobra exactamente esse valor.
- Depois de pago, o hotel tem **24 horas** para aceitar/recusar (`RESPONSE_DEADLINE_HOURS` em `_shared/reservation-notify.ts`). O prazo aparece ao cliente (A minhas reservas + chat), ao hotel (dashboard: "Responder até..." ou "Prazo excedido") e no e-mail de controlo.
- Aceite: a mensagem ao cliente diz quanto resta pagar (ou que já pagou tudo). Recusa: o e-mail de reembolso usa o valor realmente pago.
- Comissão Spotter mantida em 10% do valor total da estadia (sai do que o cliente pagou); o e-mail mostra "A repassar ao hotel". Constantes: `ROOM_DEPOSIT_PCT` e `ROOM_COMMISSION_PCT` em `create-zumbopay-payment`.
- Correr no Supabase depois da 009: `010_room_payment_options.sql`. Publicar de novo: `create-zumbopay-payment`, `zumbopay-webhook`, `reservation-respond`.
- Nota: passado o prazo não há acção automática (só o aviso "Prazo excedido"); reembolsos continuam manuais.

## 7. Auditoria da base de dados e das funções (2026-09-30)
Ver `GUIA_LANCAMENTO.md` (lista de erros encontrados + ordem de lançamento) e `supabase/VERIFICAR_BD.sql` (diagnóstico para correr no SQL Editor).
Novos ficheiros: `supabase/config.toml`, `.gitignore`. `SUPABASE_SETUP.sql`: `is_admin()` movida para o topo; agendamento diário deixou de estar activo com marcadores.

## 8. Testes das Edge Functions (2026-10-01) — 93 testes, 0 falhas
Encontrados e corrigidos 2 bugs reais: (a) posts 24h/3d e eventos não conseguiam criar o pagamento (migração 008, ponto 4); (b) a função
reaproveitava pagamentos pendentes entre clientes diferentes (agora só assinaturas). Detalhes em `GUIA_LANCAMENTO.md` e `testes-locais/`.

## 9. Reservas: pesquisa e filtros melhores + teste de navegação (2026-10-02)
- Novo `src/lib/reservation-filters.ts` + `src/components/ReservationFilters.tsx`. Hotel/restaurante (Reservas): pesquisa por nome, telefone (com ou sem +258/espaços), quarto, pedido especial e referência; estados com contagem (Todas, Pendentes, Prazo excedido, Confirmadas, Recusadas, Reembolso por fazer / Repasse por fazer, Canceladas); filtros avançados (pagamento 20%/100%, data de check-in ou da reserva, ordenar por); resumo (pago pelos clientes, a cobrar no check-in, a reembolsar) e "Exportar" CSV para Excel. Cliente (As minhas reservas): pesquisa e estados.
- Logo real do Spotter (`/icon-192.png`) no cabeçalho do login (telemóvel e PC); confirmado no browser.
- BUG corrigido pelo teste de navegação: o perfil público de um negócio SEM telefone na BD rebentava ("Cannot read properties of null"). Também deixaram de ser feitos pedidos inválidos à BD com o id provisório "default" e com ids de exemplo (p1, p2…).
- Teste real no browser (Chromium): 68 verificações sem falhas — rotas do cliente, hotel, restaurante e táxi; filtros; layout no PC; navegação sem empilhar histórico.

## 10. Pacote "o que correr no Supabase" (2026-10-03)
`SUPABASE_PASSO_A_PASSO.md` (ordem completa) + `supabase/1_RUN_NO_SUPABASE.sql` (008+009+010 num só script, testado numa BD só com 002–007 e repetido sem erros) + `supabase/2_CRON_AGENDAMENTOS.sql` (3 agendamentos; `reactivate-rooms` não tinha agendamento nenhum).

## Ainda por fazer
- Base de dados (próxima fase): rever SUPABASE_SETUP.sql + migrações 002-008, RLS e Realtime.
- Testar no browser depois do deploy (a divisão de código e o layout largo só foram validados por tsc + build, não em execução).
- Registar no Google Search Console e submeter o sitemap; correr Lighthouse.
- Trocar o domínio provisório workers.dev pelo definitivo.
