# Tudo no Cloudflare, só com o telemóvel (v47)

## O que o código já faz (não precisas de mexer)
- **R2 (fotos):** está completo. Com `VITE_IMAGE_STORAGE=r2` a app pede um link temporário à função `r2-presign`, envia a foto direto ao R2 e guarda o endereço. Apagar fotos também passa pelo R2. Se o R2 falhar, a foto vai para o Supabase (ninguém fica sem publicar). Anexos de chat ficam sempre no Supabase (são privados).
- **Site:** `wrangler.jsonc` (rotas como `/admin` abrem ao recarregar) e `public/_headers` (mesmos cabeçalhos de segurança do `vercel.json`).
- **Corrigido:** o build não passava as variáveis `VITE_FIREBASE_*` ao `sw.js` quando vinham do painel do Cloudflare. Agora passa.
- **Funções do Supabase:** `supabase/colar-no-painel/` tem as 2 funções em ficheiro único para colares no painel do Supabase, sem computador.

## Passo A — pôr o site no Cloudflare (escolhe UM caminho)
**Caminho 1 (recomendado, actualiza sozinho): GitHub + Workers**
1. github.com → New repository (privado) → envia o código. (Se não conseguires enviar pasta pelo telemóvel, liga o GitHub ao Claude e diz-me `dono/repositório`: eu envio.)
2. Cloudflare → Workers e Pages → Criar → Importar um repositório.
3. Nome: `spotter-local` · Build: `npm run build` · Deploy: `npx wrangler deploy`.
4. Variáveis (de build): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_IMAGE_STORAGE=r2`, `VITE_R2_PUBLIC_URL=https://pub-1a9483a296b34e7498fa7053e5c56876.r2.dev`, e as `VITE_FIREBASE_*` / `VITE_TURNSTILE_SITE_KEY` que já tinhas.
5. Implantar → copia o endereço `https://spotter-local.….workers.dev`.

**Caminho 2 (sem GitHub): Pages com upload**
Pede-me um `dist` já construído com as tuas variáveis; depois: Workers e Pages → Criar → Pages → Carregar ativos → envias o zip. Cada actualização = novo zip.

## Passo B — CORS do R2 (com o endereço do site do passo A)
Bucket `spotter-local-images` → Configurações → Política de CORS:
```json
[{
  "AllowedOrigins": ["https://O-TEU-SITE.workers.dev"],
  "AllowedMethods": ["PUT"],
  "AllowedHeaders": ["content-type"],
  "MaxAgeSeconds": 3600
}]
```
(Se mais tarde usares um domínio próprio, acrescenta-o à lista.)

## Passo C — chave do R2
R2 → Gerir tokens da API R2 → Criar token → Leitura e gravação de objetos → só o bucket `spotter-local-images`. Copia o Access Key ID e o Secret (só aparece uma vez).

## Passo D — Supabase (tudo pelo navegador)
1. **Authentication → URL Configuration:** Site URL = o endereço do Worker; acrescenta-o também em Redirect URLs.
2. **Edge Functions → Secrets:**
   - `R2_ACCOUNT_ID` = `dcfbd151586122d203b6ec7235607697`
   - `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` = os do passo C
   - `R2_BUCKET` = `spotter-local-images`
   - `R2_PUBLIC_URL` = `https://pub-1a9483a296b34e7498fa7053e5c56876.r2.dev`
   - M-Pesa: `MPESA_API_KEY`, `MPESA_PUBLIC_KEY`, `MPESA_SERVICE_PROVIDER_CODE` = `171717`, `MPESA_ENV` = `sandbox`
3. **Edge Functions → Deploy a new function → Via Editor**, uma de cada vez:
   - nome `r2-presign` → apaga o texto de exemplo → cola o ficheiro `supabase/colar-no-painel/r2-presign.ts` → Deploy.
   - nome `create-mpesa-payment` → cola `supabase/colar-no-painel/create-mpesa-payment.ts` → Deploy.
   - Deixa **Verify JWT** ligado nas duas.
   - Se existirem `create-zumbopay-payment` e `zumbopay-webhook`, apaga-as.
   - Se mudares o código no futuro, repete a colagem (ou usa o deploy automático abaixo).

## Deploy automático das funções (opcional, via GitHub)
`.github/workflows/deploy-supabase-functions.yml` publica as funções sozinho quando mudas `supabase/functions`. Precisa dos secrets do GitHub `SUPABASE_ACCESS_TOKEN` (Supabase → Account → Access Tokens) e `SUPABASE_PROJECT_ID` (Project Settings → General → Reference ID).

## Teste final
1. Abre o endereço do Worker, faz login, muda a capa de um negócio.
2. Se a foto aparecer com endereço `pub-….r2.dev`, o R2 está a funcionar. Se ficar com endereço do Supabase, o R2 falhou em silêncio: vê o Passo B (CORS) e os segredos do passo D.
3. Abre `/admin` e recarrega a página: não pode dar 404.
4. Faz um pagamento de teste M-Pesa (ver `MPESA_INTEGRATION.md`).

## O que fica de fora
- **Fotos antigas** (já no Supabase) continuam a abrir. Migrá-las para o R2 (`scripts/migrate-images-to-r2.mjs`) precisa de um computador com Node. É opcional.
- Nada disto foi testado contra a tua conta real: o primeiro envio de foto é o teste.
