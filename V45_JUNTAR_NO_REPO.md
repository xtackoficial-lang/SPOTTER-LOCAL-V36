# v45 = v44 + publicações com carrossel, notificações e "Ver publicações"

Extrai para `F:\Xtack\zip-v45`. O zip NÃO leva `.env`, `.gitignore` nem `supabase/1_RUN_NO_SUPABASE.sql`.

```powershell
git checkout -b feat/v45-publicacoes
```
```powershell
robocopy F:\Xtack\zip-v45\spotter-local-v45 . /E /XD node_modules .git dist /XF .env .gitignore
```
```powershell
git status
```

## Novidades desde a v44 (se já juntaste a v44, copia só estes)
Novos: `supabase/SUPABASE_TUDO_v45.sql`, `supabase/VERIFICAR_v45.sql`, `V45_PASSOS_SUPABASE.md`, `supabase/migrations/018_event_photos_notify.sql`, `supabase/3_CRON_EVENTOS.sql`,
`supabase/functions/notify-new-events/index.ts`, `supabase/functions/_shared/fcm.ts`, `supabase/functions/_shared/event-notify.ts`,
`src/components/PhotoCarousel.tsx`, `src/components/BusinessPublications.tsx`, `src/components/PublicationGuide.tsx`,
`src/lib/publication-rules.ts`, `tests/event-notify.test.mjs`, `V45_PUBLICACOES_E_NOTIFICACOES.md`.
Alterados: `src/routes/publish-event.tsx`, `src/routes/events.tsx`, `src/routes/place.$id.tsx`, `src/routes/business.tsx`,
`src/lib/posts-events-db.ts`, `src/lib/event-publish-db.ts`, `src/lib/subscription-storage.ts`, `src/lib/i18n.ts`,
`public/sw.js`, `PLAYSTORE_PREPARACAO.md`.

## Rever com `git diff` antes do commit (o teu repo v45 também mexeu nestes)
`src/routes/events.tsx`, `src/routes/publish-event.tsx`, `src/routes/business.tsx`, `src/lib/posts-events-db.ts`, `public/sw.js`.
Se algo se perder, `git checkout main -- <ficheiro>` e envia-me esse ficheiro: junto as duas versões.

## Depois
```powershell
npx tsc --noEmit
```
```powershell
npm run build
```
```powershell
node tests/event-notify.test.mjs
```
Supabase: seguir **`V45_PASSOS_SUPABASE.md`** — colar `supabase/SUPABASE_TUDO_v45.sql` (011 a 018 num só) e depois `VERIFICAR_v45.sql`;
deploy de `notify-new-events`; correr `3_CRON_EVENTOS.sql`. Detalhes e testes em `V45_PUBLICACOES_E_NOTIFICACOES.md`.
