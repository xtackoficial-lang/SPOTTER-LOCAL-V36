#!/usr/bin/env node
// ============================================================
// SPOTTER LOCAL — Migrar fotos antigas do Supabase Storage → Cloudflare R2 (v41)
// ------------------------------------------------------------
// SEGURO por desenho:
//   • Por omissão é um ENSAIO (dry-run): só conta e lista, não mexe em nada.
//   • COPIA as fotos (nunca apaga as originais no Supabase).
//   • Só troca o URL numa linha da BD depois de confirmar que a cópia no R2 abre.
//   • Antes de alterar, grava um ficheiro de cópia de segurança com os valores antigos
//     (migracao-r2-backup-AAAA-MM-DD-HHMMSS.json) — dá para desfazer com --rollback.
//   • Pode correr várias vezes: o que já foi migrado é ignorado.
//
// Uso (no teu computador, na pasta do projecto):
//   npm i --no-save aws4fetch
//   export SUPABASE_URL=https://xxxx.supabase.co
//   export SUPABASE_SERVICE_ROLE_KEY=...      # NUNCA colocar isto no .env do site
//   export R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=...
//   export R2_BUCKET=spotter-local-images R2_PUBLIC_URL=https://imagens.teudominio.com
//   node scripts/migrate-images-to-r2.mjs            # ensaio
//   node scripts/migrate-images-to-r2.mjs --apply    # migra de verdade
//   node scripts/migrate-images-to-r2.mjs --rollback migracao-r2-backup-....json
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import { AwsClient } from "aws4fetch";

const env = (k, req = true) => {
  const v = (process.env[k] ?? "").trim();
  if (!v && req) {
    console.error(`Falta a variável ${k}.`);
    process.exit(1);
  }
  return v;
};

const SUPABASE_URL = env("SUPABASE_URL").replace(/\/+$/, "");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const R2_ACCOUNT_ID = env("R2_ACCOUNT_ID");
const R2_BUCKET = env("R2_BUCKET");
const R2_PUBLIC_URL = env("R2_PUBLIC_URL").replace(/\/+$/, "");
const R2_ENDPOINT = (
  env("R2_ENDPOINT", false) || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
).replace(/\/+$/, "");
const APPLY = process.argv.includes("--apply");
const ri = process.argv.indexOf("--rollback");
const ROLLBACK_FILE = ri > -1 ? process.argv[ri + 1] : null;

const OLD_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/spotter-media/`;
const REST = `${SUPABASE_URL}/rest/v1`;
const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// tabela, coluna, tipo
const TARGETS = [
  { table: "businesses", col: "cover_image", array: false },
  { table: "businesses", col: "gallery", array: true },
  { table: "products", col: "image_url", array: false },
  { table: "business_posts", col: "photo_url", array: false },
  { table: "events", col: "poster_url", array: false },
  { table: "business_rooms", col: "photo_url", array: false },
  { table: "business_rooms", col: "photo_urls", array: true }, // v42: até 4 fotos por quarto
];

async function rest(path, init = {}) {
  const res = await fetch(`${REST}${path}`, {
    ...init,
    headers: { ...H, ...(init.headers ?? {}) },
  });
  if (!res.ok)
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const r2 = new AwsClient({
  accessKeyId: env("R2_ACCESS_KEY_ID"),
  secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
  service: "s3",
  region: "auto",
});

const copied = new Map(); // URL antigo → URL novo (evita copiar duas vezes a mesma foto)

async function migrateUrl(oldUrl) {
  if (typeof oldUrl !== "string" || !oldUrl.startsWith(OLD_PREFIX)) return oldUrl; // já migrada / externa / base64
  if (copied.has(oldUrl)) return copied.get(oldUrl);
  const key = decodeURIComponent(oldUrl.slice(OLD_PREFIX.length).split("?")[0]);
  const dl = await fetch(oldUrl);
  if (!dl.ok) throw new Error(`não consegui descarregar ${oldUrl} (${dl.status})`);
  const body = Buffer.from(await dl.arrayBuffer());
  const type = dl.headers.get("content-type") || "image/jpeg";
  const put = await r2.fetch(`${R2_ENDPOINT}/${R2_BUCKET}/${key}`, {
    method: "PUT",
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" },
    body,
  });
  if (!put.ok) throw new Error(`R2 recusou ${key} (${put.status})`);
  const newUrl = `${R2_PUBLIC_URL}/${key}`;
  const check = await fetch(newUrl, { method: "HEAD" });
  if (!check.ok)
    throw new Error(
      `a cópia não abre em ${newUrl} (${check.status}) — o domínio público do R2 está ligado?`,
    );
  copied.set(oldUrl, newUrl);
  return newUrl;
}

async function rollback(file) {
  const backup = JSON.parse(readFileSync(file, "utf8"));
  for (const b of backup.rows) {
    await rest(`/${b.table}?id=eq.${b.id}`, {
      method: "PATCH",
      body: JSON.stringify({ [b.col]: b.old }),
    });
    console.log(`↩ ${b.table}.${b.col} ${b.id}`);
  }
  console.log(`Desfeito: ${backup.rows.length} linhas repostas.`);
}

async function main() {
  if (ROLLBACK_FILE) return rollback(ROLLBACK_FILE);
  console.log(
    APPLY
      ? "MODO: MIGRAR DE VERDADE\n"
      : "MODO: ENSAIO (nada é alterado). Usa --apply para migrar.\n",
  );
  const backup = { createdAt: new Date().toISOString(), rows: [] };
  let found = 0,
    migrated = 0,
    failed = 0;

  for (const t of TARGETS) {
    const rows = await rest(`/${t.table}?select=id,${t.col}&${t.col}=not.is.null&limit=10000`);
    for (const row of rows) {
      const old = row[t.col];
      const urls = t.array ? (Array.isArray(old) ? old : []) : [old];
      if (!urls.some((u) => typeof u === "string" && u.startsWith(OLD_PREFIX))) continue;
      found += urls.filter((u) => typeof u === "string" && u.startsWith(OLD_PREFIX)).length;
      if (!APPLY) {
        console.log(`• ${t.table}.${t.col} ${row.id}: ${urls.length} foto(s) por migrar`);
        continue;
      }
      try {
        const nu = [];
        for (const u of urls) nu.push(await migrateUrl(u));
        const value = t.array ? nu : nu[0];
        backup.rows.push({ table: t.table, id: row.id, col: t.col, old });
        // guarda a cópia de segurança ANTES de alterar a linha
        writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2));
        await rest(`/${t.table}?id=eq.${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({ [t.col]: value }),
        });
        migrated += urls.length;
        console.log(`✓ ${t.table}.${t.col} ${row.id}`);
      } catch (e) {
        failed++;
        console.error(`✗ ${t.table}.${t.col} ${row.id}: ${e.message}`);
      }
    }
  }
  console.log(`\nFotos no Supabase por migrar: ${found}`);
  if (APPLY) {
    console.log(`Migradas: ${migrated} · Linhas com erro: ${failed}`);
    if (backup.rows.length)
      console.log(`Cópia de segurança: ${BACKUP_FILE}  (desfazer: --rollback ${BACKUP_FILE})`);
    if (failed) process.exitCode = 2;
  }
}
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const BACKUP_FILE = `migracao-r2-backup-${stamp}.json`;
main().catch((e) => {
  console.error("Erro:", e.message);
  process.exit(1);
});
