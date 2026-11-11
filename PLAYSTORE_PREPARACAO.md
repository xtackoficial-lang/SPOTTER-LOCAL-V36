# Spotter Local — Preparação para a Google Play (checklist)

Baseado no código da v43 e nas regras da Google Play pesquisadas em 21/10/2026.
Os pontos marcados **(confirma)** dependem de decisões tuas ou do formulário actual do Play Console.

## 0. Decisões antes de pagar os 25 USD
1. **Tipo de conta:** pessoal (exige teste fechado: 12 testadores, 14 dias seguidos, por cada app) ou organização (isenta, pede D-U-N-S). **(confirma)**
2. **Pagamentos dentro da app Android.** A política da Google obriga a usar o Google Play Billing em
   subscrições e "service upgrades". Desde a v44 o que a app vende como digital é **só a subscrição do comerciante**
   (Starter, Pro, Premium): o Turbinar foi retirado e os eventos passaram a estar incluídos no Pro e no Premium.
   Reservas de quarto/mesa são serviços físicos (tratados à parte). A rota `/publish-post` (publicação paga no feed)
   continua no código, sem botão — decide se a mantens. Opções para a subscrição: (a) Play Billing; (b) na app Android
   esconder o pagamento dos planos e cobrar só no site; (c) arriscar e submeter como está. **(confirma)**
   Não confirmei se o Play Billing/perfil de pagamentos está disponível para contas de Moçambique — vê no Play Console.

## 1. Gerar o pacote Android (TWA)
1. Em https://www.pwabuilder.com mete o endereço da app já publicada (Vercel/Cloudflare) e escolhe Android.
2. **Package name** (não se muda depois), ex.: `mz.xtack.spotterlocal`. Escolhe **Play App Signing**.
3. Garante que o pacote aponta para **Android 16 (API 36)** — obrigatório desde 31/08/2026 em apps novas e atualizações.
4. Carrega o `.aab` numa faixa de teste no Play Console.
5. Play Console → *Integridade da app* → copia o **SHA-256** da chave de assinatura da Play.
6. Edita `public/.well-known/assetlinks.json`: troca `SUBSTITUIR_PELO_PACKAGE_NAME_DA_APP` e
   `SUBSTITUIR_PELO_SHA256_DA_ASSINATURA_DO_PLAY`. Faz deploy e abre
   `https://O-TEU-DOMINIO/.well-known/assetlinks.json` — tem de abrir o JSON (sem login, sem redirecionar).
   Sem isto a app abre com a barra do browser por cima.

## 2. Play Console → Conteúdo da app
- **Política de privacidade:** `https://O-TEU-DOMINIO/privacy` (abre sem login). Já lista localização, câmara, notificações,
  Supabase, Firebase, Unsplash, Cloudflare e ZumboPay, e o direito de apagar/exportar os dados.
- **Acesso à app:** dá credenciais de teste: uma conta de cliente e uma de **comerciante** (o painel /business está atrás de login).
  Cria-as antes e confirma que entram.
- **Anúncios:** a app mostra publicações patrocinadas — responde a pensar nisso. **(confirma)**
- **Classificação de conteúdo:** responde ao questionário; a app tem chat, avaliações e posts de utilizadores (UGC).
- **Público-alvo:** não é para crianças.
- **Apagar conta:** já existe (Perfil → eliminar conta, função `delete-own-account`). Indica o caminho no formulário
  e, se pedirem URL web, usa a página de privacidade + o email xtackoficial@gmail.com.

## 3. Segurança dos dados (rascunho para o formulário) **(confirma cada linha)**
Declara o que a app recolhe de facto. Um formulário que não bate com a realidade é a principal causa de rejeição.

| Categoria | Dado | Para quê | Opcional? |
|---|---|---|---|
| Informações pessoais | Nome, email, telemóvel | Conta, reservas, pagamentos | Não (conta) |
| Localização | Aproximada/precisa | Mostrar negócios perto | Sim |
| Fotos e vídeos | Fotos enviadas | Perfil de negócio, posts, eventos, chat | Sim |
| Áudio | Mensagens de voz | Chat | Sim |
| Mensagens | Mensagens da app | Chat cliente–negócio | Sim |
| Identificadores | Token de notificações (Firebase) | Notificações | Sim |
| Pagamentos | Processados pelo ZumboPay (a app não guarda cartão/carteira) | Pagar | Sim |

- Dados encriptados em trânsito: **sim** (HTTPS).
- O utilizador pode pedir a eliminação: **sim** (apagar conta + email).
- Permissões usadas: localização, câmara (QR), microfone (voz), notificações. Não peças outras.
- Supabase, Firebase, Cloudflare e ZumboPay tratam dados por conta da app; confirma no formulário se contam como "partilha".

## 4. Texto da ficha (rascunho em português)
**Nome:** Spotter Local — Negócios em Moçambique
**Descrição curta (80):** Descobre restaurantes, hotéis e negócios locais perto de ti, reserva e fala com eles.
**Descrição longa:** Spotter Local ajuda-te a encontrar negócios locais em Moçambique: restaurantes, hotéis, pensões,
farmácias e mais. Vê perfis, fotos, avaliações e eventos, lê o QR dos negócios, reserva mesa ou quarto e conversa
diretamente com o comerciante. Se tens um negócio, cria o teu perfil, mostra produtos, promoções e eventos e recebe
reservas e mensagens. *(ajusta ao que realmente está ativo)*
Capturas de ecrã reais, ícone 512×512 e imagem de destaque 1024×500.

## 5. Conteúdo de utilizadores (UGC) — o que a v43 já faz
- **Reportar** mensagens recebidas no chat, posts patrocinados e avaliações (migração `016_content_reports.sql`).
- Ver denúncias: `select * from public.content_reports order by created_at desc;` no SQL Editor. Depois de analisar,
  atua (apaga o post/evento ou bloqueia a conta) e marca `status = 'reviewed'`.
- Desde a v45 também há **Reportar** nos eventos (aba Eventos e "Ver publicações" no perfil) e regras claras do que se pode
  publicar (`src/lib/publication-rules.ts`), com confirmação obrigatória antes de publicar.
- **Falta (recomendado):** **bloquear utilizador** no chat e uma página no `/admin` para ver as denúncias (hoje vês no SQL Editor).

## 6. Antes de submeter
- [ ] Todos os itens da checklist de segurança v42 feitos (SQL 011–016, Edge Functions, variáveis na Vercel).
- [ ] Pagamentos de teste feitos (evento 50 MZN, Pensão, reserva de hotel).
- [ ] `assetlinks.json` com valores reais e a abrir.
- [ ] Política de privacidade abre sem login, no domínio final.
- [ ] Contas de teste (cliente + comerciante) a funcionar.
- [ ] Teste fechado concluído (se conta pessoal).
- [ ] App abre sem crashes num telemóvel Android real.

## 7. Se rejeitarem
- Rejeição **não** afeta o estado da conta; se for uma atualização, a versão anterior continua publicada.
- Lê o motivo em Play Console → **Política → Estado da política** (não só o email).
- Corrige a causa, **sobe o número da versão**, carrega o novo pacote e submete. Não voltes a submeter antes de corrigir tudo.
- Se achas que foi engano: **recurso** (um por cada ação). Várias suspensões contam como avisos e podem levar ao
  encerramento da conta de programador (com todas as apps) — corrige com calma, não submetas várias vezes seguidas.
