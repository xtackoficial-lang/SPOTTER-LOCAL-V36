// Teste FUNCIONAL real com DOM — monta os componentes React de produção
// do admin.tsx num jsdom real e clica nos botões a sério.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
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

const React = await import("react");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const { act } = React;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ FALHOU: ${name}`); }
}

// ── importa o Route real de admin.tsx e extrai o componente ──
const adminModule = await import("../src/routes/admin.tsx");
const AdminPage = adminModule.Route.options.component;

console.log("\n=== MONTAR AdminPage (AdminLogin, sem sessão) ===");
const container = document.createElement("div");
document.body.appendChild(container);
const root = createRoot(container);

let renderError = null;
const originalConsoleError = console.error;
console.error = (...args) => {
  const msg = args.join(" ");
  if (msg.includes("Warning:")) return; // ignora avisos React normais
  renderError = msg;
  originalConsoleError(...args);
};

await act(async () => {
  root.render(React.createElement(AdminPage));
  await new Promise((r) => setTimeout(r, 50));
});

check("montou sem exceção nem erro no console", renderError === null);
check("mostra o ecrã de login (campo de password presente)", !!container.querySelector('input[type="password"]'));

console.log("\n=== SIMULAR: escrever password errada e submeter ===");
const passwordInput = container.querySelector('input[type="password"]');
const setNativeValue = (el, value) => {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
};

await act(async () => {
  setNativeValue(passwordInput, "password-claramente-errada");
});

const form = container.querySelector("form") ?? container.querySelector("button");
await act(async () => {
  // encontra o botão de submeter (o form pode não existir, procura botão principal)
  const submitBtn = [...container.querySelectorAll("button")].find(
    (b) => !b.disabled && b.textContent.length > 0,
  );
  submitBtn?.click();
  await new Promise((r) => setTimeout(r, 100));
});

check("não crashou depois de submeter password errada", renderError === null);
check(
  "continua no ecrã de login (não entrou sem password certa)",
  !!container.querySelector('input[type="password"]'),
);

console.log(`\n${"=".repeat(50)}\nRESULTADO: ${pass} passaram, ${fail} falharam\n${"=".repeat(50)}`);
root.unmount();
process.exit(fail > 0 ? 1 : 0);
