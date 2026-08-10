// ============================================================
// XTACK SPOTTER — Injecta credenciais Firebase no Service Worker
// ------------------------------------------------------------
// O Vite só processa import.meta.env dentro do código da app (src/),
// nunca em ficheiros estáticos servidos directamente de public/. Como
// o Service Worker (public/sw.js) PRECISA das credenciais Firebase para
// inicializar o Messaging em segundo plano, este script lê o TEMPLATE
// (public/sw.template.js, com placeholders __VITE_FIREBASE_*__) e
// escreve o resultado já preenchido em public/sw.js — que é o ficheiro
// que main.tsx regista e o Vite copia para dist/.
//
// IMPORTANTE: edita sempre sw.template.js, nunca sw.js directamente —
// sw.js é gerado/sobrescrito a cada build por este script.
//
// Corre automaticamente via "prebuild" (ver package.json). Não precisa
// de ser chamado manualmente.
// ============================================================
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env");
const SW_TEMPLATE_PATH = path.join(__dirname, "..", "public", "sw.template.js");
const SW_OUTPUT_PATH = path.join(__dirname, "..", "public", "sw.js");

function loadEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const content = readFileSync(ENV_PATH, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const keys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

let sw = readFileSync(SW_TEMPLATE_PATH, "utf-8");
let replaced = 0;
for (const key of keys) {
  const placeholder = `__${key}__`;
  const value = process.env[key] || env[key] || "";
  if (sw.includes(placeholder)) {
    sw = sw.split(placeholder).join(value);
    replaced++;
  }
}
writeFileSync(SW_OUTPUT_PATH, sw, "utf-8");

if (process.env.VITE_FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY) {
  console.log(`✓ sw.js: ${replaced} credenciais Firebase injectadas.`);
} else {
  console.log(
    "ℹ sw.js: Firebase ainda não configurado no .env ou nas variáveis de ambiente — notificações push ficam desactivadas até o configurares (ver FIREBASE_SETUP.md).",
  );
}
