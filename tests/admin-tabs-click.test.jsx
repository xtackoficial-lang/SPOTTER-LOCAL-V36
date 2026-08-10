// Teste FUNCIONAL real — monta o AdminDashboard JÁ AUTENTICADO e clica
// literalmente em cada uma das 10 abas, apanhando qualquer crash de
// hooks/render que só apareça em runtime (o mesmo tipo de bug que
// encontrámos e corrigimos no merchant.tsx).
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
globalThis.localStorage = new MemoryStorage();
Object.defineProperty(dom.window, "localStorage", { value: globalThis.localStorage, configurable: true });

// Sessão admin já válida — simula login feito com sucesso
globalThis.localStorage.setItem(
  "xlocal.admin.session.v2",
  JSON.stringify({ token: "test-token", expires: Date.now() + 4 * 60 * 60 * 1000 }),
);

const React = await import("react");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const { act } = React;

let pass = 0, fail = 0;
const crashedTabs = [];
function check(name, cond) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ FALHOU: ${name}`); }
}

let renderError = null;
const originalConsoleError = console.error;
console.error = (...args) => {
  const msg = args.join(" ");
  if (msg.includes("Warning:") || msg.includes("not wrapped in act")) return;
  renderError = msg;
  originalConsoleError(...args);
};

const adminModule = await import("../src/routes/admin.tsx");
const AdminPage = adminModule.Route.options.component;

const container = document.createElement("div");
document.body.appendChild(container);
const root = createRoot(container);

console.log("\n=== MONTAR AdminDashboard (com sessão válida) ===");
await act(async () => {
  root.render(React.createElement(AdminPage));
  await new Promise((r) => setTimeout(r, 150));
});
check("montou o Dashboard sem crash", renderError === null);
check("NÃO mostra ecrã de login (entrou logo no dashboard)", !container.querySelector('input[type="password"]'));

const tabLabels = [
  "adminMerchantsTabLabel", // será o texto traduzido, procuramos pelos botões da barra de tabs
];

// Encontra os botões da barra de tabs (ficam logo a seguir ao header, antes do <main>)
function getTabButtons() {
  const main = container.querySelector("main");
  if (!main) return [];
  const tabBar = main.previousElementSibling; // div das tabs fica logo antes do <main>
  return tabBar ? [...tabBar.querySelectorAll("button")] : [];
}

const tabButtons = getTabButtons();
check(`encontrou botões de abas no ecrã (esperado 10, achou ${tabButtons.length})`, tabButtons.length === 10);

console.log("\n=== CLICAR em cada uma das 10 abas, uma a uma ===");
for (let i = 0; i < tabButtons.length; i++) {
  renderError = null;
  const label = tabButtons[i].textContent;
  await act(async () => {
    getTabButtons()[i].click();
    await new Promise((r) => setTimeout(r, 80));
  });
  const ok = renderError === null;
  check(`aba "${label}" renderiza sem crash`, ok);
  if (!ok) crashedTabs.push(label);
}

console.log("\n=== VOLTAR à primeira aba (testar re-render/troca) ===");
renderError = null;
await act(async () => {
  getTabButtons()[0].click();
  await new Promise((r) => setTimeout(r, 80));
});
check("voltar à 1ª aba não crasha", renderError === null);

console.log(`\n${"=".repeat(50)}\nRESULTADO: ${pass} passaram, ${fail} falharam`);
if (crashedTabs.length) console.log("Abas com crash:", crashedTabs.join(", "));
console.log("=".repeat(50));
root.unmount();
process.exit(fail > 0 ? 1 : 0);
