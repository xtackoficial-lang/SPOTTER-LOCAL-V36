// Testa a limpeza de dados ao sair/trocar de conta (sem browser).
const store = new Map();
globalThis.localStorage = {
  get length() {
    return store.size;
  },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const ss = new Map();
globalThis.sessionStorage = {
  getItem: (k) => ss.get(k) ?? null,
  setItem: (k, v) => ss.set(k, String(v)),
  clear: () => ss.clear(),
};
globalThis.window = { dispatchEvent() {}, localStorage };
globalThis.Event = class {};
const { wipeLocalUserData, wipeIfDifferentUser } = await import("../src/lib/session-cleanup.ts");
let fail = 0;
const ok = (n, c) => {
  console.log((c ? "ok    " : "FALHA ") + n);
  if (!c) fail++;
};
const fill = () =>
  [
    "chats.v1",
    "messages.v2",
    "favorites.v1",
    "orders.v1",
    "subscription.v1",
    "notifs.v1",
    "onboarding.v1",
    "reviews.v1",
    "payments.v1",
  ].forEach((k) => store.set("xlocal." + k, "dados-A"));
["locale.v1", "intro.seen.v1", "device-id.v1", "guard.v1", "admin.session.v2", "theme.v1"].forEach(
  (k) => store.set("xlocal." + k, "aparelho"),
);
ss.set("xlocal.play.v1", "1");
ss.set("outra", "x");
fill();
wipeLocalUserData();
ok(
  "apaga conversas, mensagens, favoritos, pedidos, plano, notificações, rascunho",
  ![
    "chats.v1",
    "messages.v2",
    "favorites.v1",
    "orders.v1",
    "subscription.v1",
    "notifs.v1",
    "onboarding.v1",
    "reviews.v1",
    "payments.v1",
  ].some((k) => store.has("xlocal." + k)),
);
ok(
  "mantém idioma, intro, id do aparelho, bloqueio de login, admin, tema",
  ["locale.v1", "intro.seen.v1", "device-id.v1", "guard.v1", "admin.session.v2", "theme.v1"].every(
    (k) => store.has("xlocal." + k),
  ),
);
ok(
  "sessionStorage limpo, mas mantém o sinal da Play Store",
  ss.get("xlocal.play.v1") === "1" && !ss.has("outra"),
);
fill();
store.set("xlocal.last-uid.v1", "A");
ok(
  "mesma conta a voltar: NÃO apaga",
  wipeIfDifferentUser("A") === false && store.has("xlocal.chats.v1"),
);
ok(
  "outra conta a entrar: apaga os dados da anterior",
  wipeIfDifferentUser("B") === true &&
    !store.has("xlocal.chats.v1") &&
    store.get("xlocal.last-uid.v1") === "B",
);
store.clear();
store.set("xlocal.chats.v1", "convidado");
ok(
  "convidado a fazer login (sem dono anterior): mantém",
  wipeIfDifferentUser("A") === false && store.has("xlocal.chats.v1"),
);
store.clear();
store.set("xlocal.chats.v1", "dados-A");
store.set("xlocal.onboarding.v1", JSON.stringify({ ownerUid: "A" }));
ok(
  "aparelho antigo (só rascunho com dono A) e entra B: apaga",
  wipeIfDifferentUser("B") === true && !store.has("xlocal.chats.v1"),
);
console.log(fail ? "FALHOU" : "LIMPEZA DE SESSÃO: tudo ok");
process.exit(fail ? 1 : 0);
