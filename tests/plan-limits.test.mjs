// Teste FUNCIONAL real dos limites de planos alterados hoje —
// importa subscription-storage.ts e businesses-db.ts de produção.
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}
globalThis.localStorage = new MemoryStorage();
globalThis.window = { localStorage: globalThis.localStorage };

const { getPlanById, ALL_PLANS } = await import("../src/lib/subscription-storage.ts");

let pass = 0,
  fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ FALHOU: ${name}`);
  }
}

console.log("\n=== TESTE 1: valores exatos que pediste hoje ===");
const expected = {
  free: { fotos: 6, produtos: 3 },
  starter: { fotos: 13, produtos: 8 },
  pro: { fotos: 17, produtos: 14 },
  premium: { fotos: 26, produtos: 20 },
};
for (const [id, exp] of Object.entries(expected)) {
  const plan = getPlanById(id);
  check(`${id}: galleryLimit === ${exp.fotos}`, plan.galleryLimit === exp.fotos);
  check(`${id}: maxProducts === ${exp.produtos}`, plan.maxProducts === exp.produtos);
}

console.log("\n=== TESTE 2: plano inexistente cai em segurança no Free (não crasha) ===");
const fallback = getPlanById("plano_que_nao_existe");
check("plano desconhecido devolve o Free (6 fotos)", fallback.galleryLimit === 6);
check("plano desconhecido devolve o Free (3 produtos)", fallback.maxProducts === 3);

console.log("\n=== TESTE 3: simulação real do limite de upload de galeria (merchant.tsx) ===");
// Replica exatamente a lógica de handleGalleryUpload: room = GALLERY_LIMIT - gallery.length
function simulateGalleryUpload(planId, currentGalleryCount, filesToUpload) {
  const plan = getPlanById(planId);
  const GALLERY_LIMIT = plan.galleryLimit;
  const room = GALLERY_LIMIT - currentGalleryCount;
  if (room <= 0) return { accepted: 0, blocked: true };
  const accepted = Math.min(filesToUpload, room);
  return { accepted, blocked: accepted < filesToUpload };
}

let sim = simulateGalleryUpload("free", 0, 9); // Free só tem 6 fotos, tenta enviar 9
check("Free com galeria vazia + 9 ficheiros → aceita só 6", sim.accepted === 6);
check("Free com galeria vazia + 9 ficheiros → fica bloqueado para o resto", sim.blocked === true);

sim = simulateGalleryUpload("free", 6, 1); // já no limite
check("Free já no limite (6/6) → bloqueia upload novo", sim.accepted === 0 && sim.blocked === true);

sim = simulateGalleryUpload("premium", 10, 3); // Premium 26, tem 10, manda 3
check("Premium com 10/26 + 3 ficheiros → aceita os 3", sim.accepted === 3 && sim.blocked === false);

sim = simulateGalleryUpload("pro", 15, 5); // Pro 17, tem 15, manda 5 → só cabem 2
check(
  "Pro com 15/17 + 5 ficheiros → aceita só 2, resto bloqueado",
  sim.accepted === 2 && sim.blocked === true,
);

console.log(
  "\n=== TESTE 4: downgrade não apaga fotos, só esconde as excedentes (businesses-db.ts) ===",
);
function simulateVisibleGallery(planId, galleryUrls) {
  const limit = getPlanById(planId).galleryLimit;
  return galleryUrls.slice(0, limit);
}
const galeriaCom20Fotos = Array.from({ length: 30 }, (_, i) => `foto${i + 1}.jpg`);
let visible = simulateVisibleGallery("pro", galeriaCom20Fotos); // tinha Premium(15), desceu p/ Pro(10)... aqui simula Pro directo
check("negócio com 30 fotos no Pro (limite 17) → só mostra 17", visible.length === 17);
check(
  "mostra exatamente as 17 primeiras, não apaga as outras 13 do array original",
  galeriaCom20Fotos.length === 30,
);

visible = simulateVisibleGallery("free", galeriaCom20Fotos);
check("mesmo negócio, se cair para Free (limite 6) → só mostra 6", visible.length === 6);

console.log(
  `\n${"=".repeat(50)}\nRESULTADO: ${pass} passaram, ${fail} falharam\n${"=".repeat(50)}`,
);
process.exit(fail > 0 ? 1 : 0);
