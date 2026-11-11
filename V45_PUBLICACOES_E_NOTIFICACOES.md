# v45 — Publicações com várias fotos, notificação aos seguidores, "Ver publicações" e vantagens dos planos

## O que há de novo
1. **Várias fotos por publicação (carrossel, como no Instagram).** Até 10 fotos; a 1.ª é a capa (podes mudar). Quem vê
   desliza para o lado, com contador "2/5" e pontinhos. Aparece na aba Eventos e no perfil do negócio.
2. **Notificação aos seguidores quando a publicação fica visível** (no dia e hora que escolheste):
   *"Hotel Bom Gosto publicou uma foto"* (ou *"…publicou 5 fotos"*), com o título como texto e a capa como imagem.
   Seguidores = clientes que têm o negócio nos **favoritos** (o dono não recebe).
3. **"Ver publicações" no perfil do comerciante** (botão com o número de publicações; abre uma folha com o carrossel de cada uma,
   contacto e link de bilhetes). Só mostra o que está visível agora: o que já saiu ou ainda não foi publicado não aparece.
4. **Painel do comerciante: "Publicar eventos e mais"**, com ideias do que **podes** e **não podes** publicar (a mesma lista
   aparece, aberta, na página de publicar). Antes de publicar, o comerciante confirma que cumpre as regras.
5. **Vantagens de cada plano** claras e verdadeiras. Acrescentei as linhas do carrossel e das notificações ao Pro e ao Premium.

## ⚠️ Corrigi números que a página de planos prometia e a app não dava
O texto prometia mais do que o código aplica. Alinhei o **texto** com os limites reais (não mexi nos limites):

| Plano | Texto antigo | Limite real (agora no texto) |
|---|---|---|
| Free | 3 fotos · 5 produtos | **2 fotos · 3 produtos** |
| Starter | catálogo 10 | **8 produtos** (galeria 6) |
| Pro | galeria 20 · catálogo 50 | **galeria 10 · 14 produtos** |
| Premium | galeria 40 · catálogo ilimitado | **galeria 15 · 20 produtos** |

**Confirma se estes são os limites que queres.** Se queres os números antigos, muda `galleryLimit` e `maxProducts` em
`src/lib/subscription-storage.ts` e o texto em `src/lib/i18n.ts` (chaves `feat…`).

## Como ativar (por ordem) — ver também `V45_PASSOS_SUPABASE.md`
1. **Cópia de segurança** do Supabase (Database → Backups).
2. SQL Editor: colar e correr **`supabase/SUPABASE_TUDO_v45.sql`** (é tudo-ou-nada e pode repetir-se). Depois correr `supabase/VERIFICAR_v45.sql`.
3. Deploy da função nova: `npx supabase functions deploy notify-new-events`
4. (Opcional) Secret `APP_URL` = o endereço da app, ex. `https://o-teu-dominio.com`.
5. Extensões `pg_cron` e `pg_net` ativas. Abre `supabase/3_CRON_EVENTOS.sql`, troca `<REF_DO_PROJECTO>` e `<FUNCTION_SECRET>`
   (os mesmos valores do `2_CRON_AGENDAMENTOS.sql`) e corre-o no SQL Editor.
6. Deploy da app (Vercel). O `public/sw.js` mudou (abre a aba Eventos e mostra a foto ao tocar na notificação).

## Como funciona a notificação
- O cron chama a função **de 5 em 5 minutos**: a notificação chega até 5 minutos depois da hora de publicação.
- Cada publicação é marcada como "notificada" **antes** do envio → nunca é enviada duas vezes.
- Não notifica publicações com mais de 24 h (se o cron estiver parado) nem as que já existiam antes da migração 018.
- Tokens mortos do Firebase são apagados. Cada envio fica em `push_log` (`target = 'event_followers'`).
- Se `FIREBASE_SERVICE_ACCOUNT_JSON` falhar, a função **não marca nada** como notificado e tenta de novo no ciclo seguinte.
- **Ainda não há** opção para o cliente desligar só estas notificações (usa a permissão de notificações do telemóvel).

## Testes feitos (nesta máquina)
- Migração 018 corrida duas vezes num PostgreSQL 16 de teste; função de publicar com 1, 5 e 10 fotos; recusa 0, 11, links
  que não são http(s), nulos e URLs enormes; capa = 1.ª foto; assinatura antiga removida.
- Notificações no SQL: só reclama o evento certo (visível, não removido, ≤ 24 h, não notificado); a 2.ª chamada não repete;
  seguidores corretos (sem o dono, sem quem não segue, vários tokens do mesmo cliente); `anon` e `authenticated` sem permissão.
- Repetidos os testes da 017 (quota, planos, horas, dias, dono, visibilidade) contra a função nova: todos iguais.
- `tests/event-notify.test.mjs` (texto da notificação), `tests/event-schedule.test.mjs`, `tsc`, `eslint` (0 erros reais) e `vite build`.
- **Não testado:** o envio real pelo Firebase (preciso das tuas chaves), o toque na notificação num telemóvel, o carrossel num
  ecrã real, e o cron no teu Supabase. Testa com 2 contas: uma Pro a publicar e outra com o negócio nos favoritos e as
  notificações ativas.

## Por decidir
- Seguidores = favoritos. Se quiseres avisar também clientes da mesma cidade, é uma alteração pequena em `event_follower_tokens`,
  mas aumenta o risco de spam.
- Publicações que já saíram da aba não aparecem no perfil (o comerciante escolheu a hora de remover). Se quiseres um arquivo
  visível, diz-me.
