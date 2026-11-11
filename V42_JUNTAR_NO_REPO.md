# v42 — como juntar no teu repositório (PowerShell, um comando de cada vez)

O zip NÃO leva `.env`, `.gitignore` nem `supabase/1_RUN_NO_SUPABASE.sql` (para não
sobrescrever os do teu repo). Extrai para `F:\Xtack\zip-v42` e, na pasta do projecto:

```powershell
git checkout -b feat/v42-seguranca-r2
```
```powershell
robocopy F:\Xtack\zip-v42\spotter-local-v42 . /E /XD node_modules .git dist /XF .env .gitignore
```
```powershell
git status
```

## Ficheiros a rever antes do commit (o teu repo v45 também mexeu neles)
- `supabase/functions/create-zumbopay-payment/index.ts`
- `src/routes/publish-event.tsx`
- `src/routes/reserve-room.$roomId.tsx`

Para ver o que mudou em cada um: `git diff -- <ficheiro>`. Se o zip apagou trabalho teu
da v45, volta atrás nesse ficheiro com `git checkout main -- <ficheiro>` e diz-me,
que junto as duas versões.

## Verificar e enviar
```powershell
npx tsc --noEmit
```
```powershell
npm run build
```
```powershell
git add -A
```
```powershell
git commit -m "feat: v42 seguranca (Turnstile, limite de login) e R2 (desligado ate configurar)"
```
```powershell
git push --set-upstream origin feat/v42-seguranca-r2
```

## Supabase (por ordem, depois do deploy)
1. SQL Editor: `014_owner_delete_events.sql` (já no teu repo) e `supabase/migrations/015_auth_guard.sql`.
2. Seguir `V42_SEGURANCA_R2_PASSO_A_PASSO.md` (Turnstile, bucket R2 com CORS, secrets, deploy `r2-presign`).
3. Deploy: `npx supabase functions deploy create-zumbopay-payment` (mudou) e `r2-presign` (nova).
