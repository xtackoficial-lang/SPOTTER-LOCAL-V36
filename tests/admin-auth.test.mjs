// Teste FUNCIONAL real — importa o código de produção admin-storage.ts
// e executa o fluxo de login/bloqueio com um localStorage de verdade
// (via polyfill em memória), sem mocks da lógica em si.
import { webcrypto } from "node:crypto";

// ── polyfills mínimos de browser ──
// (Node 20+ já expõe globalThis.crypto com .subtle e .randomUUID)
class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.window = { localStorage: globalThis.localStorage };

const {
  adminLogin,
  isLockedOut,
  getFailedAttempts,
  getLockoutRemaining,
  getAdminSession,
  adminLogout,
} = await import("../src/lib/admin-storage.ts");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ FALHOU: ${name}`); }
}

console.log("\n=== TESTE 1: password errada não deixa entrar ===");
let r = await adminLogin("password-errada-123");
check("password errada devolve 'wrong'", r === "wrong");
check("sessão continua falsa depois de falhar", getAdminSession() === false);
check("contador de tentativas falhadas = 1", getFailedAttempts() === 1);

console.log("\n=== TESTE 2: bloqueio ao fim de 5 tentativas erradas ===");
await adminLogin("errada-2");
await adminLogin("errada-3");
await adminLogin("errada-4");
r = await adminLogin("errada-5");
check("5ª tentativa errada ainda devolve 'wrong' (bloqueia DEPOIS)", r === "wrong");
check("isLockedOut() fica true após 5 falhas", isLockedOut() === true);
check("getLockoutRemaining() > 0", getLockoutRemaining() > 0);
check("getLockoutRemaining() <= 15 minutos", getLockoutRemaining() <= 15 * 60 * 1000);

console.log("\n=== TESTE 3: mesmo com password CERTA, bloqueado continua bloqueado ===");
r = await adminLogin("qualquer-coisa-mesmo-certa");
check("login recusado com 'locked' mesmo sem saber a password certa", r === "locked");
check("sessão continua falsa durante bloqueio", getAdminSession() === false);

console.log("\n=== TESTE 4: logout limpa a sessão ===");
globalThis.localStorage.setItem("xlocal.admin.session.v2", JSON.stringify({ token: "fake", expires: Date.now() + 999999 }));
check("sessão fica válida depois de simular login", getAdminSession() === true);
await adminLogout();
check("sessão fica inválida depois de logout()", getAdminSession() === false);

console.log("\n=== TESTE 5: sessão expirada não conta como logada ===");
globalThis.localStorage.setItem("xlocal.admin.session.v2", JSON.stringify({ token: "fake", expires: Date.now() - 1000 }));
check("sessão expirada devolve false", getAdminSession() === false);

console.log(`\n${"=".repeat(50)}\nRESULTADO: ${pass} passaram, ${fail} falharam\n${"=".repeat(50)}`);
process.exit(fail > 0 ? 1 : 0);
