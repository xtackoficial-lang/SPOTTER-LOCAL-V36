# Testes locais das Edge Functions (2026-10-01)
Resultado da última corrida: 93 testes, 0 falhas (create 31 · webhook+respond 34 · restantes 18 · segurança API 10).
Imitam o Supabase (Postgres + PostgREST + gateway de auth) e a ZumboPay/Resend (mocks). NÃO falam com a ZumboPay real.
São material de referência; só servem num ambiente com Postgres 16, PostgREST e Deno (não são necessários para publicar a app).

## Teste de navegação no browser (2026-10-02)
`navegacao-browser.mjs` abre a app num Chromium real (telemóvel 390×844 e PC 1440×900), com contas de cliente, hotel, restaurante e táxi
contra a BD local, e verifica: logo real no login, ecrã cheio no PC, todas as rotas sem ecrã de erro, filtros e pesquisa das reservas,
bloqueio de reservas para o táxi e que o botão "voltar" não fica preso nas abas. Resultado: 68 verificações, 0 falhas (nas rotas e
filtros) + login/PC validados por captura de ecrã. `filtros-reservas.test.ts`: 37 testes unitários dos filtros.
