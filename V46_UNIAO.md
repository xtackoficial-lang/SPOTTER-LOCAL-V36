# v46 = v45 (publicações) + o que só existia na pasta "v36-corrigido / auditoria"

Base: **v45 publicações** (eventos nos planos, carrossel, notificações, denúncias, Turbinar retirado, limites de plano 2/3, 6/8, 10/14, 15/20).

## Trazido da outra pasta
| O quê | Ficheiros |
|---|---|
| Até 4 fotos por quarto | `reservations-db.ts`, `manage-rooms.tsx`, `rooms.$businessId.tsx`, migração **`019_room_photos.sql`** (era a 015 da outra pasta), `migrate-images-to-r2.mjs` |
| Visualizador de fotos com zoom (capa, galeria e produtos do perfil; quartos) | `ImageViewer.tsx`, `ProfileBlocks.tsx` |
| Botão "Sair do painel" e navegação com `replace` (o botão "voltar" não fica em ciclo) | `panel-nav.ts`, `business.tsx` + 14 rotas |
| Cardápio só no Pro/Premium para bar e padaria | `profile-styles.ts`, `merchant.tsx`, `place.$id.tsx`, `tests/menu-rule.test.mjs` |
| Fundo do perfil com foto da própria galeria (Pro/Premium) | `profile-styles.ts`, `merchant.tsx`, `place.$id.tsx`, `i18n.ts` (4 línguas) |
| Palavra-passe validada na recuperação; e-mail validado na reserva de mesa/quarto | `reset-password.tsx`, `reserve-table…`, `reserve-room…` |
| Upload ao R2 com o **tamanho** assinado (além do tipo) | `functions/r2-presign/index.ts` |
| `makeKey` sem o caso `Math.random() = 0` | `_shared/r2-keys.ts` |

## Mantido da v45 (não trazido)
Turbinar retirado · eventos nos planos · `015_auth_guard.sql` (a versão mais segura) · migrações 016–018 · `sw.js` · carrossel, notificações, denúncias · textos de privacidade (Cloudflare/ZumboPay) · limites de plano da v45.
Não levei: `.env`, `.gitignore`, `1_RUN_NO_SUPABASE.sql`, `viewer-test.*`.

## Erro corrigido que vinha na v45
`subscription-storage.ts` usa as chaves `featStarterCatalog10`, `featProGallery20`, `featProCatalog50`, `featPremiumGallery40`,
mas `i18n.ts` tinha-as renomeadas (`…Catalog8`, `…Gallery10`, `…Catalog14`, `…Gallery15`) e com números errados
(Pro "até 20 fotos / 50 produtos", Premium "até 40 fotos"). A página de planos mostrava a chave crua ou números falsos.
Agora as chaves coincidem e os textos dizem os limites reais, nas 4 línguas (ver tabela de limites abaixo).

## Limites dos planos (galeria grande, como na outra pasta)
| Plano | Fotos na galeria | Produtos |
|---|---|---|
| Free | **6** | 3 |
| Starter | **13** | 8 |
| Pro | **17** | 14 |
| Premium | **26** | 20 |
Mudar em `src/lib/subscription-storage.ts` (`galleryLimit`, `maxProducts`) e nos textos `featFreePhotos`, `featStarterGallery`, `featProGallery20`, `featPremiumGallery40`, … em `src/lib/i18n.ts`; o teste `tests/plan-limits.test.mjs` usa os mesmos números.
Não há limite de fotos na base de dados nem nas funções do Supabase (só na app). As fotos vão para o Cloudflare R2 pelo `r2-presign`.

## Fotos ao estilo Instagram
- **Visualizador** (`ImageViewer.tsx`): fundo preto, SEM botões + e −, sem miniaturas. Contador "2/5" em cima, pontinhos em baixo (no máximo 5 visíveis; os das pontas encolhem).
  - **Pinça** aproxima à volta dos dedos e, ao largar, a foto **volta suavemente ao sítio** (como no Instagram). Para a pinça ficar onde a deixas: `PINCH_SPRINGS_BACK = false` no topo do ficheiro.
  - **Duplo toque** aproxima no ponto tocado e fica ampliada; com a foto ampliada arrasta-se; outro duplo toque afasta.
  - **Deslizar para o lado** segue o dedo e troca de foto; **arrastar para baixo/cima** fecha, com o fundo a esvanecer.
  - Computador: roda do rato aproxima no cursor, duplo clique, arrastar, setas ← → e Esc.
- **Carrossel** (`PhotoCarousel.tsx`): desliza uma foto de cada vez a seguir o dedo, contador no canto, pontinhos POR BAIXO da foto (cor do tema), setas só no computador ao passar o rato. Tocar abre o visualizador na foto certa.
- **Galeria do perfil: o comerciante escolhe a forma** (Editar perfil → Visual → "Forma da galeria"; aparece nas estruturas que têm o bloco de galeria, por exemplo "Vitrine de Fotos", "Com Cardápio", "Completa"):
  - **Fila deslizante** — a forma de antes e a PREDEFINIDA (quem não escolhe nada continua com ela).
  - **Mosaico** — 1 foto grande + até 4 pequenas, "+N" na última (precisa de 4 ou mais fotos; com menos, mostra a fila).
  - **Grelha** — quadrados, 3 por linha, como o perfil do Instagram; mostra 9 e "Ver todos (N)" abre o resto (1 foto = grande, 2 = duas colunas).
  - Em qualquer forma, tocar numa foto abre o visualizador. A escolha é grátis em todos os planos.
  - **Onde fica guardada:** dentro de `block_order` (etiqueta `galeria:mosaic` ou `galeria:grid`; a fila não leva etiqueta). **Não há migração nem coluna nova.** Versões antigas da app ignoram a etiqueta.
  - Corrigido: num aparelho novo (ou depois de limpar os dados) o editor mostrava os valores predefinidos e, ao guardar, apagava a escolha. `account-recovery.ts` passou a repor estrutura, tema, fundo, ordem dos blocos e forma da galeria a partir da base de dados.
- Corrigido o aviso de hooks em `manage-rooms.tsx`.

## Correção na v46: cron das notificações
`supabase/config.toml` passou a ter `[functions.notify-new-events] verify_jwt = false`. Sem isto o Supabase recusava (401) o pedido do cron, que usa o `FUNCTION_SECRET` e não um JWT, e as notificações aos seguidores nunca saíam. Faz o deploy da função de novo depois de aplicar esta versão.

## Como aplicar
1. Supabase → SQL Editor: correr `supabase/migrations/019_room_photos.sql` (idempotente). Sem ela, os quartos guardam só a 1.ª foto (a app não parte).
2. `npx supabase functions deploy r2-presign`
3. Deploy da app. Os passos da v45 (`V45_PASSOS_SUPABASE.md`) continuam iguais.

## Testado nesta máquina
- `tsc --noEmit` sem erros · `vite build` ok · testes de unidade: event-notify, event-schedule, r2-keys, reservation-filters (38), admin-auth (12), plan-limits (18), menu-rule.
- **No browser (Chromium, formato telemóvel)** — `tests/e2e-fotos/` (README lá): carrossel (deslizar, contador, 5 pontinhos, sem setas no telemóvel), visualizador (SEM + e −, pinça à volta dos dedos, volta ao sítio ao largar, duplo toque aproxima e fica, arrastar com zoom não troca de foto, deslizar troca, arrastar para baixo fecha, Esc, fundo), as 3 formas da galeria (fila com 96 px como antes, mosaico com "+N", grelha 3×3 com "Ver todos (26)"; cada foto abre o visualizador na foto certa) e o seletor do editor (escolher, guardar, reabrir). Todas ok, consola sem erros.
- **App inteira compilada**: 34 rotas abrem sem erro; painel do comerciante nos planos Free, Pro e Premium; página de planos nas 4 línguas sem chaves cruas e com os números certos.
- **Migração 019** num PostgreSQL 16 de teste: corre duas vezes, aceita 4 fotos por quarto e recusa 5.
- **r2-presign**: o link assinado inclui `content-length;content-type;host`.
- `/reservation-settings` e `/business-inbox` ficam em branco no teste, tal como na v45 original (Supabase de teste desligado).

**Não testado (precisa das tuas contas e de um telemóvel):** envio real ao R2/Firebase, a migração no teu Supabase, pagamentos, e a sensação dos gestos num telemóvel físico (testei com toques simulados).

## Velocidade e correções (27/10/2026)
- **Arranque mais leve:** o pacote principal caiu de 393 kB (131 kB comprimido) para 224 kB (73 kB). O inglês, espanhol e francês deixaram de estar dentro dele: `src/lib/locales/{en,es,fr}.ts` carregam só quando o idioma é usado (`loadLocale` em `i18n.ts`; `main.tsx` espera no máximo 1,5 s por ele antes de abrir). Português continua dentro (idioma predefinido e de recurso).
- **Imagens:** todas as fotos fora do ecrã inicial passaram a `loading="lazy" decoding="async"`.
- **Lista de negócios:** `fetchBusinesses` fazia 2–4 pedidos iguais por ecrã (Home chama duas vezes, mais Busca e notificações de proximidade). Agora há cache de 30 s e pedido partilhado; é limpa ao gravar um negócio (`upsertBusiness`) e ao puxar para atualizar (`reload`).
- **Service Worker (v20):** `/assets/*`, `/backgrounds/*`, `/onboarding-intro/*` e ícones passam a "cache primeiro" (ficheiros com hash/imutáveis), com limite de 200 entradas. HTML e o resto continuam "rede primeiro".
- **Envio de fotos:** o lote (até 26 fotos) enviava tudo ao mesmo tempo, o que esgota a memória de telemóveis fracos. Agora vão 3 de cada vez; se uma falhar, as outras ficam guardadas em vez de se perder o lote. PNG com transparência deixa de ficar preto ao virar JPEG. O campo de ficheiro limpa-se para se poder escolher as mesmas fotos de novo.
- **Testado:** tsc limpo; todos os testes unitários; eslint sem erros (12 avisos antigos); 37 rotas × PT/FR sem erro de consola nem ecrã em branco; francês carrega a pedido; testes de browser do visualizador e do seletor de galeria passam.
- **Não testado:** velocidade em telemóvel real com rede móvel; Supabase/R2 reais.
- **Limite conhecido:** a Home ainda lê todos os negócios ativos de uma vez. Com centenas de negócios convém filtrar por cidade no servidor (próximo passo).

## Versão da Play Store (28/10/2026)
- **O que muda quando a app abre pela Play Store (TWA):** `/subscribe`, `/payment` e `/publish-post` mostram só o plano atual (`PlayPlansNotice`), sem preços, sem botão de pagar e sem dizer onde pagar. Reservas de quarto/mesa e pedidos (serviços/produtos físicos, ZumboPay) **não mudam**. O painel do comerciante continua a abrir e o plano Free pode ser usado. Os botões "fazer upgrade" espalhados pela app levam ao mesmo aviso.
- **No site e na PWA instalada pelo Chrome nada muda.**
- **Deteção:** `src/lib/play-context.ts` — referrer `android-app://` ou `?origem=play`, guardado só em `sessionStorage` (o armazenamento normal é partilhado com o Chrome). **No PWABuilder, pôr o Start URL como `/?origem=play`**: é o sinal mais fiável; o referrer real só se confirma num telemóvel.
- **Testado:** `tests/e2e-fotos/teste-play.cjs` (site normal / `?origem=play` / referrer simulado / nova sessão). **Não testado:** num Android real com o pacote TWA.
- **Risco:** a Google decide na revisão. Se recusar por haver plano pago ativado fora da app, as alternativas são Play Billing ou deixar o painel do comerciante só no site.

## Vidro nas barras e botões (31/10/2026)
- `expo-glass-effect` só existe em React Native/Expo; esta app é web, por isso o equivalente é CSS (`backdrop-filter`) em `src/styles.css`: `.glass-bar` (31 barras de topo/fundo, incluindo as duas navegações inferiores e a caixa de escrever do chat) e `.glass-btn` (19 botões redondos de ícone + pastilha do separador ativo).
- Contraste reforçado (reflexo, tom da cor principal, rebordo e sombra) para o vidro se notar em fundo claro. Adapta-se ao tema claro/escuro; sem suporte a `backdrop-filter` ou com "reduzir transparência" ligado no sistema volta ao fundo sólido de antes.
- Não mexi em botões de ação com gradiente laranja (Guardar, Pagar…), cartões nem janelas modais.
- Para desfazer: tirar `glass-bar`/`glass-btn` das classes, ou apagar o bloco no fim de `styles.css`.

## Sair da conta, dados de outra conta, notificações, privacidade 404 (01/11/2026)
- **Sair da conta:** passou a pedir confirmação (Cancelar / Sim, sair) e recarrega a app do zero. Antes saía logo, sem perguntar.
- **Dados de outra conta (grave):** ao sair só o rascunho do perfil era apagado; conversas, mensagens, favoritos, pedidos, plano, avaliações e notificações da conta anterior ficavam no telemóvel (`src/lib/session-cleanup.ts`). Agora tudo o que é "da pessoa" é apagado ao sair, ao apagar a conta e quando entra uma conta diferente da última usada no aparelho. Mantém só idioma, introdução já vista, id do aparelho, bloqueio de tentativas de login, tema e admin.
- **Notificações da conta anterior:** o token de push do telemóvel ficava preso à conta antiga (a regra da tabela `push_tokens` impedia a nova conta de o reclamar, e a app só o registava uma vez por abertura). Agora: o token é solto ao sair; é registado de novo sempre que muda a conta; e a nova função `claim_push_token` (**migração `020_claim_push_token.sql`, correr no Supabase — não está dentro de SUPABASE_TUDO_v45.sql**) passa o token à conta que entrou. Testada num Postgres temporário.
- **Página de notificações:** não existia (o botão só pedia permissão). Nova rota `/notifications`: estado, ligar/desligar neste aparelho e lista das notificações recebidas com a app aberta (guardada só no aparelho, apagada ao sair). Limite: notificações recebidas com a app fechada aparecem no sistema do telemóvel mas não ficam nesta lista.
- **Eliminar conta:** agora também termina a sessão local e apaga os dados do aparelho; se a função `delete-own-account` não estiver publicada no Supabase, a mensagem diz isso (404). **Tem de estar publicada:** `npx supabase functions deploy delete-own-account`. Fotos da conta no R2 não são apagadas (ficam órfãs) — a tratar.
- **/privacy dá 404 na Cloudflare:** não é a app, é o alojamento: falta a regra "devolver index.html para endereços desconhecidos". Se for um Worker: renomear `wrangler.jsonc.exemplo` para `wrangler.jsonc`. Pages e Vercel já tratam disto. **Importante para a Play Store**: o link da política de privacidade tem de abrir.
- **Testes novos:** `tests/session-cleanup.test.mjs` (regras de limpeza) e `tests/e2e-fotos/teste-sair-conta.cjs` (confirmação, cancelar, limpeza, página de notificações, /privacy).

## Código por e-mail (OTP) em vez de link (01/11/2026)
- **O que mudou:** confirmar conta (registo ou login numa conta por confirmar) e recuperar senha passam a pedir um **código de 6 dígitos** enviado por e-mail. Componente `src/components/OtpInput.tsx` (6 caixas, colar/preenchimento automático na 1.ª caixa, backspace, setas). `src/lib/auth.ts`: `verifySignupCode`, `verifyRecoveryCode` (`verifyOtp` tipos `signup`/`recovery`), limite local de 5 erros → bloqueio 15 min, erros traduzidos. Ecrãs: `routes/index.tsx` (confirmar conta, Reenviar com espera de 60 s) e `routes/forgot-password.tsx` (depois do código segue para `/reset-password`).
- **OBRIGATÓRIO fora do código:** nos *Email Templates* do Supabase (Confirm signup e Reset password) usar `{{ .Token }}` em vez de `{{ .ConfirmationURL }}`; manter Email OTP Length = 6; ligar SMTP próprio (Resend). Sem isto o utilizador recebe link e o ecrã do código não serve. Detalhe no guia PDF, tarefa 6B.
- **Testado:** `tests/e2e-otp/teste-otp.cjs` com Supabase simulado no browser (11 verificações: ecrã de código, código errado, espera do Reenviar, código certo, recuperação, colar, bloqueio por tentativas, sem erros JS). **Não testado:** entrega real de e-mail, templates reais, preenchimento automático num telemóvel.

## Vidro nos filtros (02/11/2026)
- Os botões de filtro não selecionados (categorias, "Aberto agora", ordenação em `routes/search.tsx` e separadores de `ReservationFilters.tsx`) passaram a usar `glass-btn`. O selecionado continua laranja sólido.

## Barra inferior em vidro líquido + botões principais (02/11/2026)
- Novo `src/components/GlassTabBar.tsx` (usado por `BottomNav` e `BusinessBottomNav`): pastilha de vidro que desliza com mola entre separadores, cresce ao tocar e **segue o dedo ao arrastar** pela barra (abre o separador onde soltas; vibração leve ao mudar). Toque simples = ligação normal. Respeita "reduzir movimento".
- Botões principais com gradiente laranja (Entrar, Criar conta, Guardar…) ganham brilho de vidro e animação elástica ao carregar, por regra global em `styles.css` (`button[style*="gradient-primary"]`).
- Testado: `tests/e2e-fotos/teste-barra-vidro.cjs` (toque, arrasto Perfil→QR, sem erros; usa build sem Supabase na porta 5190). **Não testado:** sensação real no telemóvel (suavidade, vibração).
- (02/11/2026) Ecrã de entrada (`routes/index.tsx`): cartão em vidro com sombras laterais (`.glass-card`), botões Google/Criar conta/Entrar com Email em vidro (`glass-btn glass-wide`), botão laranja com sombras laterais. Só CSS/classes; textos e lógica iguais.
- (02/11/2026) Barra inferior agora **flutuante em cápsula** (`GlassTabBar`): vidro com o conteúdo a aparecer desfocado por baixo, e uma **lente de vidro** (mais alta que a barra, reflexo e borda com brilho) no separador ativo; continua o arrastar do dedo. Um espaço de 92 px no fim da página evita tapar o conteúdo. CSS: `.glass-float`, `.glass-lens` em `styles.css`.
- (02/11/2026) **Mola física (estilo Apple)**: `src/lib/spring.ts` (massa-mola-amortecedor com velocidade preservada). A lente da barra inferior usa-a: assenta com ressalto, continua com inércia ao largar o dedo e estica/achata com a velocidade; cada página retoma a posição/velocidade da anterior (a barra é montada por página). No CSS, `--spring-soft/bouncy/snappy` (curvas `linear()` geradas por simulação de mola) agora movem todos os botões `.press`, ícones da barra, botões laranja e folhas `animate-slide-up`; browsers sem `linear()` usam curva normal; "reduzir movimento" desliga. Testes: `tests/e2e-fotos/teste-mola.cjs`.

## Rate limiting no servidor (03/11/2026)
- **Migração `supabase/migrations/021_rate_limits.sql`** (correr no Supabase; não está no SUPABASE_TUDO_v45.sql): tabela `rate_limits` + função `check_rate_limit(chave, limite, janela_s)` (janela fixa, atómica) só para a `service_role`; limpeza horária se houver pg_cron. Testada num Postgres temporário (bloqueia à 4.ª chamada com limite 3; `anon`/`authenticated` sem acesso; migração corre 2×).
- **Módulo `supabase/functions/_shared/rate-limit.ts`**: `rateLimit`, `tooManyRequests` (429 + `Retry-After` + mensagem em português), `clientIp`, e `LIMITS` (números ajustáveis num só sítio). Se a base falhar, o pedido passa (fail-open).
- **Aplicado em:** r2-presign (60/min), create-zumbopay-payment (10/10 min por utilizador, 30/10 min por IP), delete-own-account (3/h), reservation-respond (30/min), send-merchant-promo (10/h). **É preciso republicar estas funções.** O envio de fotos mostra a mensagem em português no 429 (`image-store.ts`).
- Login/registo/OTP/e-mails: limites do próprio Supabase Auth (Authentication → Rate Limits) — ver guia PDF, tarefa 6C. Webhook ZumboPay e crons sem limite.
- Teste: `npx tsx tests/rate-limit.test.mjs` (12 verificações). **Não testado:** funções publicadas no Supabase real.

## Vidro em todos os botões e elementos flutuantes (03/11/2026)
- `src/styles.css` (fim): regras automáticas — botões com fundo card/muted/accent/branco, linhas-ligação do Perfil (sem fotos), botões de cor sólida (`bg-primary`, âmbar, verde, vermelho…: mantêm a cor e ganham brilho de vidro), janelas/folhas/menus/avisos (`[role=dialog]`, `[role=menu]`, `[data-sonner-toast]`, `rounded-t-3xl`). Sem necessidade de mexer em cada ecrã.
- Página do negócio (cores de tema inline): classes `theme-glass`, `theme-glass-wide`, `theme-gloss` em `ProfileBlocks.tsx`; `--g-base`/`--g-tint` na raiz de `place.$id.tsx` fazem o vidro seguir o tema de cada negócio (claro/escuro).
- Não tocado de propósito: interruptores, caixas de marcar, separadores (`role=tab`), cartões com fotos (para não pesar em telemóveis fracos). Para desfazer, apagar os blocos no fim de `styles.css`.

## Tradução de mensagens (04/11/2026)
- Botão Traduzir em todas as mensagens de texto (enviadas e recebidas) no chat e na caixa do negócio; só ao tocar. Idiomas PT/EN/ES/FR.
- Servidor: `supabase/functions/translate-message` (Azure Translator; Google opcional), migração `022_message_translations.sql` (cache + contador mensal, teto 1,8 M caracteres), limite 40/min por utilizador.
- Cliente: `src/lib/translate-message.ts`, `src/components/TranslateMessage.tsx`; textos nos 4 idiomas; frase na política de privacidade.
- Testes: `tests/translate.test.mjs` (16) e `tests/e2e-traduzir` (8), simulados. Não testado: Azure real, função publicada.
- Tarefa 6D no PDF.
