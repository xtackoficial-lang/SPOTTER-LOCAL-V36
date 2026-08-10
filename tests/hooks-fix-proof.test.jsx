// Prova empírica do bug corrigido no merchant.tsx: recria a MESMA
// estrutura (hydrated flip de false->true, useState declarados antes/
// depois do return condicional) para confirmar, por execução real, que
// o padrão ANTIGO crashava e o padrão NOVO (aplicado na correção) não.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;

const React = await import("react");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const { act, useState } = React;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ FALHOU: ${name}`); }
}

// ── Padrão ANTIGO (o que estava no merchant.tsx antes da correção) ──
let triggerOld;
function ComponentComBug() {
  const [hydrated, setHydrated] = useState(false);
  triggerOld = () => setHydrated(true);
  if (!hydrated) return React.createElement("div", null, "a carregar...");
  // hooks declarados DEPOIS do return condicional — violação real
  const [uploadingCover] = useState(false);
  const [uploadingGallery] = useState(false);
  const [uploadingProductImage] = useState(false);
  return React.createElement("div", null, "painel carregado");
}

// ── Padrão NOVO (a correção aplicada hoje) ──
let triggerNew;
function ComponentCorrigido() {
  const [hydrated, setHydrated] = useState(false);
  triggerNew = () => setHydrated(true);
  // hooks movidos para ANTES do return condicional
  const [uploadingCover] = useState(false);
  const [uploadingGallery] = useState(false);
  const [uploadingProductImage] = useState(false);
  if (!hydrated) return React.createElement("div", null, "a carregar...");
  return React.createElement("div", null, "painel carregado");
}

async function testComponent(Component, trigger) {
  let caughtError = null;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container, {
    onUncaughtError: (error) => { caughtError = error; },
    onCaughtError: (error) => { caughtError = error; },
    onRecoverableError: (error) => { caughtError = error; },
  });
  try {
    await act(async () => {
      root.render(React.createElement(Component));
    });
    // dispara a mudança de hydrated=false -> true de forma determinística,
    // DENTRO do act(), tal como o React realmente processa o update
    await act(async () => {
      trigger();
    });
  } catch (err) {
    caughtError = err; // React 19 lança de facto a partir do act() neste caso
  }
  root.unmount();
  return { crashed: caughtError !== null, error: caughtError };
}

console.log("\n=== Padrão ANTIGO (hooks depois do return) — deve CRASHAR ===");
const oldResult = await testComponent(ComponentComBug, () => triggerOld());
check(
  "confirma que o padrão antigo REALMENTE crashava (prova que o bug era real)",
  oldResult.crashed === true,
);
if (oldResult.crashed) console.log(`   → erro real apanhado: "${oldResult.error?.message}"`);

console.log("\n=== Padrão NOVO (hooks antes do return, igual à correção aplicada) — NÃO deve crashar ===");
const newResult = await testComponent(ComponentCorrigido, () => triggerNew());
check("confirma que a correção aplicada resolve o crash", newResult.crashed === false);

console.log(`\n${"=".repeat(50)}\nRESULTADO: ${pass} passaram, ${fail} falharam\n${"=".repeat(50)}`);
process.exit(fail > 0 ? 1 : 0);
