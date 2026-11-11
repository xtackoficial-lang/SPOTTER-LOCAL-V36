// Teste da versão Play Store: planos/pagamento/publicação paga escondidos só quando aberta pela TWA.
// Precisa de: `npx vite build && npx vite preview --port 5188` e `node tests/e2e-fotos/teste-play.cjs`
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
  const mk = async () => {
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
    p.errs = [];
    p.on("pageerror", (e) => p.errs.push(e.message.split("\n")[0]));
    return [ctx, p];
  };
  const ok = (n, c) => {
    console.log((c ? "ok    " : "FALHA ") + n);
    if (!c) process.exitCode = 1;
  };
  const U = "http://127.0.0.1:5188";
  const notice = (p) => p.locator("[data-play-plan-notice]").count();
  const txt = (p) => p.evaluate(() => document.body.innerText);

  // 1) site normal
  let [c, p] = await mk();
  await p.goto(U + "/subscribe", { waitUntil: "load" });
  await p.waitForTimeout(1200);
  ok(
    "site normal: /subscribe mostra os planos com preço",
    (await notice(p)) === 0 && /300|500|900/.test(await txt(p)),
  );
  await c.close();

  // 2) TWA por ?origem=play
  [c, p] = await mk();
  await p.goto(U + "/subscribe?origem=play", { waitUntil: "load" });
  await p.waitForTimeout(1200);
  let t = await txt(p);
  ok(
    "Play (?origem=play): /subscribe mostra aviso e o plano atual",
    (await notice(p)) === 1 && /Pro/.test(t),
  );
  ok(
    "Play: sem preços nem botão de continuar/pagar",
    !/MZN|\/mês|Continuar com/i.test(t) &&
      (await p.locator("button", { hasText: /Continuar|Pagar/ }).count()) === 0,
  );
  await p.goto(U + "/payment", { waitUntil: "load" });
  await p.waitForTimeout(800);
  ok(
    "Play: /payment (mesmo sem o parâmetro, na mesma sessão) mostra o aviso",
    (await notice(p)) === 1,
  );
  await p.goto(U + "/publish-post", { waitUntil: "load" });
  await p.waitForTimeout(800);
  ok("Play: /publish-post mostra o aviso", (await notice(p)) === 1);
  await p.goto(U + "/merchant", { waitUntil: "load" });
  await p.waitForTimeout(1200);
  ok("Play: o painel do comerciante continua a abrir", /Painel do comerciante/.test(await txt(p)));
  ok("Play: sem erros de JavaScript", p.errs.length === 0);
  await c.close();

  // 3) TWA por referrer android-app://
  [c, p] = await mk();
  // O Chrome de escritório não deixa pôr um referrer android-app:// real; simula-se o valor que a TWA envia.
  await p.addInitScript(() =>
    Object.defineProperty(document, "referrer", {
      get: () => "android-app://mz.xtack.spotterlocal",
    }),
  );
  await p.goto(U + "/subscribe", { waitUntil: "load" });
  await p.waitForTimeout(1200);
  ok("Play (referrer android-app://): aviso mostrado", (await notice(p)) === 1);
  await c.close();

  // 4) sessão nova no mesmo "browser": sem marca → site normal
  [c, p] = await mk();
  await p.goto(U + "/subscribe", { waitUntil: "load" });
  await p.waitForTimeout(1200);
  ok("nova sessão sem sinal: volta ao normal", (await notice(p)) === 0);
  await c.close();
  await b.close();
})();
