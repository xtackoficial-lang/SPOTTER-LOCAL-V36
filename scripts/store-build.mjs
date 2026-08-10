// ============================================================
// XTACK SPOTTER — Build "limpo" para Google Play / App Store
// ------------------------------------------------------------
// O painel de admin (src/routes/admin.tsx e src/lib/admin-storage.ts)
// nunca deve entrar no APK/bundle publicado nas lojas. Este script:
//   1. Move admin.tsx e admin-storage.ts para fora de src/
//   2. Corre `vite build` — o TanStack Router nem ve o admin.tsx
//   3. Repoe os ficheiros de volta no fim (sucesso ou erro)
//
// Uso:
//   npm run build:store  → gera dist-store/ sem admin (PWABuilder/APK)
//   npm run build         → build normal, com admin (Vercel/PWA)
// ============================================================
import { existsSync, mkdirSync, renameSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const HIDE_DIR = path.join(ROOT, "_store-build-excluded");

const FILES_TO_HIDE = [
  ["src/routes/admin.tsx", "admin.tsx"],
  ["src/lib/admin-storage.ts", "admin-storage.ts"],
];

function hideAdminFiles() {
  if (existsSync(HIDE_DIR)) rmSync(HIDE_DIR, { recursive: true, force: true });
  mkdirSync(HIDE_DIR);
  for (const [from, hiddenName] of FILES_TO_HIDE) {
    const src = path.join(ROOT, from);
    if (!existsSync(src)) {
      console.warn(`⚠ Aviso: ${from} não encontrado, a saltar.`);
      continue;
    }
    renameSync(src, path.join(HIDE_DIR, hiddenName));
    console.log(`✓ Escondido: ${from}`);
  }
}

function restoreAdminFiles() {
  if (!existsSync(HIDE_DIR)) return;
  for (const [to, hiddenName] of FILES_TO_HIDE) {
    const hidden = path.join(HIDE_DIR, hiddenName);
    if (!existsSync(hidden)) continue;
    renameSync(hidden, path.join(ROOT, to));
    console.log(`✓ Reposto: ${to}`);
  }
  rmSync(HIDE_DIR, { recursive: true, force: true });
}

console.log("\n🏪 Build para lojas (Google Play / App Store) — sem painel admin\n");

try {
  hideAdminFiles();
  execSync("npx vite build --mode store", {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, VITE_STORE_BUILD: "true" },
  });
  console.log("\n✅ Build de loja concluída em dist-store/ — sem qualquer código do painel admin.");
  console.log("   Este dist-store/ está pronto para o PWABuilder gerar o APK.\n");
} catch (err) {
  console.error("\n❌ Build de loja falhou:", err.message);
  process.exitCode = 1;
} finally {
  restoreAdminFiles();
}
