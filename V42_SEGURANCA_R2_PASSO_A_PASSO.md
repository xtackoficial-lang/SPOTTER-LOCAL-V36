# v42 (= v41 revisto) — Segurança + Cloudflare R2 (tudo desligado até ligares)

A app continua igual até preencheres as variáveis. Nada parte se faltar algo.

## O que entrou
- **Captcha Turnstile**: login, registo e recuperação de senha.
- **Limite de tentativas**: login = 3 erros → bloqueio 30 min (dobra se insistir, máx. 24 h);
  recuperação = 6 pedidos → mesmo bloqueio. Vale no servidor (migração 015) e no aparelho.
- **Dados verdadeiros**: telemóvel moçambicano (9 dígitos, 82–87, rejeita 888888888/123456789,
  dígitos a mais/menos), email real (formato, typos tipo gmial.com, emails temporários,
  domínio com MX), nome, senha. Aplicado em registo, reservas (mesa/quarto), eventos,
  pagamento, onboarding, comerciante, boost e definições de reservas.
- **R2**: `r2-presign` (Edge Function), `image-store.ts`, `scripts/migrate-images-to-r2.mjs`.

## Passos (por ordem)
1. Supabase → SQL Editor → correr `supabase/migrations/015_auth_guard.sql`
   (o número 014 já é `014_owner_delete_events.sql`; corre as duas, cada uma uma vez).
2. Cloudflare → Turnstile → criar site. Copiar **Site key** para `VITE_TURNSTILE_SITE_KEY`
   (Cloudflare Pages ou Vercel → Environment Variables) e a **Secret key** para Supabase →
   Authentication → Attack Protection → Captcha (provider Turnstile).
   **Esta é a protecção real no servidor.** Sem ela, quem chamar a API do Supabase
   directamente (sem passar pela app) ignora o limite de tentativas e o widget.
3. Cloudflare → R2 → criar bucket (ex: `spotter-local-images`), ligar domínio público,
   criar token "Object Read & Write" só para esse bucket.
   **CORS do bucket (obrigatório, senão o envio de fotos falha no browser):** R2 → o bucket →
   Settings → CORS Policy:
   ```json
   [{
     "AllowedOrigins": ["https://O-TEU-DOMINIO", "http://localhost:5173"],
     "AllowedMethods": ["PUT"],
     "AllowedHeaders": ["content-type"],
     "MaxAgeSeconds": 3600
   }]
   ```
   Ao domínio público das imagens junta, em Rules → Transform Rules → Response Headers,
   `X-Content-Type-Options: nosniff`. Usa um domínio de imagens **diferente** do da app.
4. Supabase → Edge Functions → Secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`. Depois: `supabase functions deploy r2-presign`.
5. Vercel/Cloudflare Pages → Variables: `VITE_IMAGE_STORAGE=r2` e `VITE_R2_PUBLIC_URL=` a URL pública do bucket e novo deploy.
6. Migrar fotos antigas: `node scripts/migrate-images-to-r2.mjs` (ler o cabeçalho do script).
Chaves secretas nunca vão no `.env` nem no repositório.

## Notas da revisão (v42)
- **Corrigido** `auth_guard_ok`: antes qualquer pessoa sem login apagava o contador de outra conta.
  Agora só funciona com sessão e para o email da própria sessão.
- **Corrigido** `r2-presign`: o tipo de ficheiro agora está assinado no link (antes só o host).
- **Corrigido** conflito de nome: migration `014_auth_guard.sql` → `015_auth_guard.sql`.
- **Limite conhecido:** o bloqueio por email permite que um mal-intencionado bloqueie a conta de
  outra pessoa de propósito (3 erros → 30 min, a dobrar até 24 h). O Turnstile reduz o risco, mas
  não o elimina. Se virar problema, junta o IP ao critério (função própria).
- **Limite conhecido:** o tamanho do ficheiro (6 MB) só é verificado no pedido do link, não no R2.
- Se o R2 falhar, a app grava no Supabase em silêncio. Para testar o R2 a sério, abre o DevTools
  (Console) e procura `uploadMedia: falha no R2` ao enviar uma foto.
