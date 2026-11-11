// Teste do seletor "Forma da galeria" no editor do comerciante (Visual → estrutura com galeria). Precisa da app compilada: `npx vite build && npx vite preview --port 5188` (com VITE_SUPABASE_URL de teste) e depois `node tests/e2e-fotos/teste-editor-galeria.cjs`.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const draft = {
    profileType: "business",
    step: 0,
    completed: true,
    authMethod: "email",
    personal: {},
    business: {
      businessId: "11111111-1111-4111-8111-111111111111",
      language: "pt",
      country: "Moçambique",
      province: "Maputo",
      city: "Maputo",
      businessName: "Hotel Teste",
      category: "restaurant",
      hours: { open: "08:00", close: "18:00", alwaysOpen: false, openDays: [0, 1, 2, 3, 4, 5, 6] },
      description: "Teste",
      phone: "+258841234567",
      ownerName: "Abrão",
      website: "",
      gallery: [],
    },
  };
  const sub = {
    planId: "pro",
    status: "active",
    startedAt: new Date().toISOString(),
    renewsAt: new Date(Date.now() + 30 * 864e5).toISOString(),
    paymentMethod: "mpesa",
  };
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript(
    ([d, s]) => {
      if (!localStorage.getItem("xlocal.onboarding.v1")) {
        localStorage.setItem("xlocal.onboarding.v1", JSON.stringify(d));
        localStorage.setItem("xlocal.subscription.v1", JSON.stringify(s));
      }
    },
    [draft, sub],
  );
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message.split("\n")[0]));
  await p.goto("http://127.0.0.1:5188/merchant", { waitUntil: "load" });
  await p.waitForTimeout(1500);
  const ok = (n, c) => console.log((c ? "ok    " : "FALHA ") + n);
  await p
    .locator("button", { hasText: /^\s*Visual\s*$/ })
    .first()
    .click();
  await p.waitForTimeout(500);
  ok(
    "estrutura Clássica não tem galeria → sem seletor (como já era)",
    (await p.getByText("Forma da galeria").count()) === 0,
  );
  await p.getByRole("button", { name: "Vitrine de Fotos" }).click();
  await p.waitForTimeout(400);
  const label = p.getByText("Forma da galeria");
  ok('editor mostra "Forma da galeria"', (await label.count()) === 1);
  const names = await p.locator("button[aria-pressed]").allInnerTexts();
  ok(
    "3 opções: " + names.map((x) => x.trim()).join(" / "),
    names.length === 3 &&
      /Fila/.test(names[0]) &&
      /Mosaico/.test(names[1]) &&
      /Grelha/.test(names[2]),
  );
  const pressed = () => p.locator('button[aria-pressed="true"]').allInnerTexts();
  ok(
    "por defeito está escolhida a Fila deslizante (como era antes): " + (await pressed()).join(),
    /Fila/.test((await pressed())[0] || ""),
  );
  await p.screenshot({ path: "shots/editor-galeria-0.png" });
  await p.locator("button[aria-pressed]").nth(2).click();
  ok("clicar em Grelha marca Grelha", /Grelha/.test((await pressed())[0] || ""));
  await p.locator("button[aria-pressed]").nth(1).click();
  ok("clicar em Mosaico marca Mosaico", /Mosaico/.test((await pressed())[0] || ""));
  await p.locator("button[aria-pressed]").nth(2).click();
  await p
    .locator("label[for], section, div")
    .filter({ hasText: /Forma da galeria/ })
    .first()
    .scrollIntoViewIfNeeded();
  await p.screenshot({ path: "shots/editor-galeria-1.png" });
  // guardar (sem Supabase a gravação remota pode falhar; o rascunho local grava-se antes)
  const save = p.getByRole("button", { name: /guardar/i }).last();
  console.log("botões guardar:", await p.getByRole("button", { name: /guardar/i }).count());
  await save.click().catch((e) => console.log("guardar:", e.message.split("\n")[0]));
  await p.waitForTimeout(1500);
  const stored = await p.evaluate(
    () => JSON.parse(localStorage.getItem("xlocal.onboarding.v1")).business.galleryLayout,
  );
  ok("rascunho local guardou a forma: " + stored, stored === "grid");
  console.log("antes de recarregar:", p.url());
  await p.goto("http://127.0.0.1:5188/merchant", { waitUntil: "load" });
  await p.waitForTimeout(2500);
  console.log(
    "depois:",
    p.url(),
    (await p.locator("body").innerText()).slice(0, 120).replace(/\n/g, " | "),
  );
  await p
    .locator("button", { hasText: /^\s*Visual\s*$/ })
    .first()
    .click();
  await p.waitForTimeout(500);
  console.log(
    "estrutura guardada:",
    await p.evaluate(
      () => JSON.parse(localStorage.getItem("xlocal.onboarding.v1")).business.structureId,
    ),
  );
  ok(
    "ao reabrir, continua na Grelha: " + (await pressed()).join(),
    /Grelha/.test((await pressed())[0] || ""),
  );
  console.log(errs.length ? "ERROS: " + errs.join(" | ") : "sem erros de JavaScript");
  await b.close();
})();
