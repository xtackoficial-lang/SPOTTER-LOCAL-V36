// Copia src/lib/validators.ts para a Edge Function (_shared). Correr depois de alterar as regras.
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync("src/lib/validators.ts", "utf8");
const head =
  "// CÓPIA EXACTA de src/lib/validators.ts — o servidor valida de novo tudo o que o ecrã validou\n" +
  "// (quem chama a API directamente, sem passar pela app, não contorna as regras).\n" +
  "// Se alterares um, altera o outro: scripts/sync-validators.mjs faz a cópia.\n";
writeFileSync("supabase/functions/_shared/validators.ts", head + src);
console.log("validators sincronizados.");
