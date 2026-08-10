# 🔔 Configurar Notificações Push — Spotter Local (v14)

Este guia explica como ligar o sistema de notificações push que já está
todo construído no código. Sem completar estes passos, os botões de
notificação no admin funcionam (agendam, guardam), mas as notificações
**não chegam de facto** aos telemóveis das pessoas.

Tempo estimado: 30–45 minutos, feito uma única vez.

---

## Parte 1 — Criar o projecto Firebase (10 min)

1. Vai a [console.firebase.google.com](https://console.firebase.google.com) e inicia sessão com uma conta Google (pode ser a mesma do XTACK).
2. Clica em **"Adicionar projecto"**. Nome sugerido: `Spotter Local`.
3. Podes desativar o Google Analytics (não é necessário). Clica em **Criar projecto**.
4. Dentro do projecto, clica no ícone **`</>`** (Web) para registar uma app web.
   - Apelido: `Spotter Local Web`.
   - **Não** marques "Firebase Hosting".
5. O Firebase mostra um bloco `firebaseConfig` com vários valores (`apiKey`, `authDomain`, etc). **Não feches esta página ainda** — vais precisar destes valores no Passo 3.

---

## Parte 2 — Activar o Cloud Messaging e gerar a chave VAPID (5 min)

1. No menu lateral esquerdo, vai a **Project Settings** (ícone de engrenagem, junto a "Project Overview") → aba **Cloud Messaging**.
2. Em **"Web configuration" → "Web Push certificates"**, clica em **"Generate key pair"**.
3. Copia o valor gerado (uma string longa) — é a tua `VITE_FIREBASE_VAPID_KEY`.

---

## Parte 3 — Preencher o `.env` do projecto (5 min)

Abre o ficheiro `.env` na raiz do projecto e preenche estas linhas com os valores que viste no Passo 1 e 2:

```
VITE_FIREBASE_API_KEY=cole_aqui_o_apiKey
VITE_FIREBASE_AUTH_DOMAIN=cole_aqui_o_authDomain
VITE_FIREBASE_PROJECT_ID=cole_aqui_o_projectId
VITE_FIREBASE_STORAGE_BUCKET=cole_aqui_o_storageBucket
VITE_FIREBASE_MESSAGING_SENDER_ID=cole_aqui_o_messagingSenderId
VITE_FIREBASE_APP_ID=cole_aqui_o_appId
VITE_FIREBASE_VAPID_KEY=cole_aqui_a_chave_VAPID_do_Passo_2
```

**Importante:** estas mesmas variáveis também têm de ser adicionadas nas **Environment Variables do projecto no Vercel** (Settings → Environment Variables), senão o site publicado não vai ter Firebase configurado mesmo que o `.env` local esteja certo.

Depois de preencher, corre `npm run build` ou `npm run dev` normalmente — um script automático (`scripts/inject-sw-env.mjs`) injecta estes valores no Service Worker antes de cada build. Não precisas de fazer mais nada manualmente aqui.

---

## Parte 4 — Criar as tabelas no Supabase (5 min)

1. Abre o teu projecto em [supabase.com](https://supabase.com) → **SQL Editor**.
2. Abre o ficheiro `SUPABASE_SETUP.sql` (na raiz deste projecto) e copia o bloco a partir do comentário `-- NOTIFICAÇÕES PUSH REAIS` até ao fim do ficheiro (correr o ficheiro todo de novo também não tem problema, porque usa `if not exists`).
3. Cola no SQL Editor e clica em **Run**.

---

## Parte 5 — Criar a Service Account (para o servidor poder enviar) (10 min)

A app (o telemóvel do utilizador) só **recebe** notificações. Para **enviar**, é preciso uma credencial de servidor — chamada Service Account.

1. No Firebase Console → **Project Settings** → aba **Service accounts**.
2. Clica em **"Generate new private key"**. Confirma. Vai descarregar um ficheiro `.json`.
3. **Abre esse ficheiro** num editor de texto e copia todo o conteúdo (é um objecto JSON grande, com `"private_key": "-----BEGIN PRIVATE KEY-----..."` lá dentro).

Este ficheiro é uma credencial secreta — nunca o partilhes, nunca o coloques no GitHub. Vamos guardá-lo apenas dentro do Supabase (passo seguinte), que é um sítio seguro para isto.

---

## Parte 6 — Publicar a Edge Function no Supabase (10 min)

A Edge Function é o "robô" que corre no servidor do Supabase e dispara os envios. O código já está pronto em `supabase/functions/send-scheduled-notifications/index.ts`.

### Instalar a CLI do Supabase (uma vez só, no teu computador)

```bash
npm install -g supabase
```

### Publicar a função

No terminal, dentro da pasta do projecto:

```bash
supabase login
supabase link --project-ref <o-teu-project-ref>
```

(`<o-teu-project-ref>` está na URL do teu projecto Supabase: `https://app.supabase.com/project/AQUI-ESTA-O-REF`)

```bash
supabase functions deploy send-scheduled-notifications
```

### Configurar o segredo (a Service Account do Passo 5)

```bash
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON='{cola_aqui_todo_o_conteudo_do_json}'
```

Cola o JSON inteiro entre aspas simples, tal como está no ficheiro descarregado.

---

## Parte 7 — Agendar a função para correr automaticamente (5 min)

Sem isto, a função existe mas só corre quando alguém a chama manualmente. Precisamos que corra sozinha de X em X minutos, para verificar se há notificações agendadas para "agora".

1. No Supabase → **SQL Editor**, corre:

```sql
-- Activa a extensão de agendamento (cron), se ainda não estiver activa
create extension if not exists pg_cron;

-- Chama a função a cada 5 minutos
select cron.schedule(
  'enviar-notificacoes-agendadas',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<o-teu-project-ref>.supabase.co/functions/v1/send-scheduled-notifications',
    headers := '{"Authorization": "Bearer <a-tua-service-role-key>"}'::jsonb
  );
  $$
);
```

Substitui `<o-teu-project-ref>` pelo mesmo valor do Passo 6, e `<a-tua-service-role-key>` pela chave em **Project Settings → API → service_role** (não é a `anon` key — é a `service_role`, que também é secreta).

2. Se a extensão `pg_net` não estiver disponível no teu plano, ativa-a primeiro: **Database → Extensions → procura "pg_net" → Enable**.

---

## Como testar se está tudo a funcionar

1. Abre a app no telemóvel (ou no browser), entra na conta, vai a **Perfil → Notificações** e toca para ativar. O browser/telemóvel vai pedir permissão — aceita.
2. No painel **Admin → Push**, cria uma notificação de teste com **"Enviar agora"** (não precisa de agendamento para testar).
3. Devias receber a notificação no telemóvel em poucos segundos, mesmo com a app fechada.
4. Se não chegar nada, confirma:
   - O `.env` (e o Vercel) têm as 7 variáveis `VITE_FIREBASE_*` preenchidas?
   - A Edge Function foi publicada (`supabase functions deploy`)?
   - O segredo `FIREBASE_SERVICE_ACCOUNT_JSON` foi definido (`supabase secrets set`)?
   - A tabela `push_tokens` no Supabase tem pelo menos uma linha (confirma em Table Editor)?

---

## Limitações actuais (para evolução futura)

- A sugestão de "local a visitar" na mensagem automática escolhe um negócio aberto na cidade e categoria preferida do utilizador, com alguma aleatoriedade — não é ainda baseada nos favoritos reais da pessoa (os favoritos hoje só vivem no telemóvel, não no servidor).
- O segmento "Comerciantes Premium" usa por agora o mesmo filtro que "Comerciantes" (todos) — afinar isto exigiria cruzar com o plano de cada negócio.
- O agendamento "uma vez" sem data marcada dispara na primeira janela horária que bater depois de criado (não acumula envios em atraso).

Qualquer uma destas pode ser refinada depois — a base toda já está montada e funcional.
