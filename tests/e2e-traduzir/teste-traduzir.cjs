// Botão "Traduzir" no chat, com Supabase e função simulados no browser.
// Compilar: VITE_SUPABASE_URL=https://mock.supabase.test VITE_SUPABASE_ANON_KEY=chave-de-teste-com-mais-de-20-letras npx vite build && npx vite preview --port 5191
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const ME = "33333333-3333-4333-8333-333333333333",
    OWNER = "44444444-4444-4444-8444-444444444444",
    BID = "55555555-5555-4555-8555-555555555555";
  const biz = {
    id: BID,
    owner_id: OWNER,
    business_name: "Café Baía",
    category: "restaurant",
    province: "Inhambane",
    city: "Inhambane",
    country: "Moçambique",
    address: "Av. 1",
    phone: "+258841234567",
    description: "x",
    tags: [],
    plan_id: "free",
    plan_status: "active",
    rating: 4.5,
    reviews_count: 3,
    gallery: [],
    open_days: [1, 2, 3],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const msgs = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      business_id: BID,
      sender_id: OWNER,
      receiver_id: ME,
      text: "Hello, we have a table for four at eight.",
      read: true,
      created_at: new Date(Date.now() - 60000).toISOString(),
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      business_id: BID,
      sender_id: ME,
      receiver_id: OWNER,
      text: "Olá, queria reservar uma mesa.",
      read: true,
      created_at: new Date(Date.now() - 30000).toISOString(),
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      business_id: BID,
      sender_id: OWNER,
      receiver_id: ME,
      text: "Sem limite este.",
      read: true,
      created_at: new Date().toISOString(),
    },
  ];
  const calls = [];
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const req = route.request(),
      u = req.url();
    if (!/mock\.supabase\.test/.test(u)) return route.abort();
    const p = new URL(u).pathname;
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    const send = (o, s = 200) =>
      route.fulfill({
        status: s,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify(o),
      });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (p.includes("/functions/v1/translate-message")) {
      const body = JSON.parse(req.postData() || "{}");
      calls.push(body);
      if (body.messageId.endsWith("1"))
        return send({
          text: "Olá, temos uma mesa para quatro às oito.",
          detected: "en",
          sameLanguage: false,
          cached: false,
        });
      if (body.messageId.endsWith("2"))
        return send({
          text: "Olá, queria reservar uma mesa.",
          detected: "pt",
          sameLanguage: true,
          cached: false,
        });
      return send({ error: "limite mensal de traduções atingido", code: "quota" }, 429);
    }
    if (p.includes("businesses_public") || p.endsWith("/businesses"))
      return send(/id=eq/.test(u) ? biz : [biz]);
    if (p.endsWith("/messages")) return send(msgs);
    if (p.includes("/auth/v1/user"))
      return send({
        id: ME,
        aud: "authenticated",
        email: "a@x.com",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      });
    return send(p.includes("/rpc/") ? null : []);
  });
  await ctx.addInitScript((ME) => {
    if (location.protocol !== "http:" || window.name === "s") return;
    window.name = "s";
    localStorage.setItem("xlocal.intro.seen.v1", "1");
    localStorage.setItem(
      "xlocal.auth.user.v1",
      JSON.stringify({ id: ME, email: "a@x.com", name: "Ana", profileType: "personal" }),
    );
    localStorage.setItem("xlocal.last-uid.v1", ME);
    localStorage.setItem(
      "sb-mock-auth-token",
      JSON.stringify({
        access_token: "a.b.c",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "r",
        user: {
          id: ME,
          aud: "authenticated",
          role: "authenticated",
          email: "a@x.com",
          app_metadata: {},
          user_metadata: { name: "Ana" },
          created_at: new Date().toISOString(),
        },
      }),
    );
    localStorage.setItem(
      "xlocal.onboarding.v1",
      JSON.stringify({
        profileType: "personal",
        step: 0,
        completed: true,
        authMethod: "email",
        personal: { name: "Ana" },
        business: {},
        ownerUid: ME,
      }),
    );
  }, ME);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, c) => {
    console.log((c ? "ok    " : "FALHA ") + n);
    if (!c) process.exitCode = 1;
  };
  await p.goto("http://127.0.0.1:5191/chat/" + BID, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  if (process.env.DBG) {
    console.log(p.url());
    console.log((await p.evaluate(() => document.body.innerText)).slice(0, 400));
    await p.screenshot({ path: process.env.SHOT + "dbg.png" });
  }
  const btns = p.locator('button[aria-label="Traduzir"]');
  ok("há um botão Traduzir por mensagem de texto (3)", (await btns.count()) === 3);
  await btns.nth(0).click();
  await p.waitForTimeout(900);
  ok(
    "tocar traduz e mostra o texto traduzido",
    /temos uma mesa para quatro/.test(
      await p.locator('[data-testid="translation"]').first().innerText(),
    ),
  );
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + "traduzir-1.png" });
  ok(
    "pedido enviou messageId e idioma da app (pt)",
    calls[0] && calls[0].to === "pt" && calls[0].messageId.endsWith("1"),
  );
  await p.locator('button[aria-label="Ver original"]').click();
  await p.waitForTimeout(300);
  ok(
    '"Ver original" esconde a tradução',
    (await p.locator('[data-testid="translation"]').count()) === 0,
  );
  await p.locator('button[aria-label="Ver tradução"]').click();
  await p.waitForTimeout(300);
  ok(
    '"Ver tradução" mostra-a outra vez sem novo pedido',
    (await p.locator('[data-testid="translation"]').count()) === 1 && calls.length === 1,
  );
  await btns.nth(0).click();
  await p.waitForTimeout(900);
  ok(
    "mensagem já no meu idioma avisa e não mostra tradução",
    /Já está no teu idioma/.test(await p.evaluate(() => document.body.innerText)),
  );
  await btns.nth(0).click();
  await p.waitForTimeout(900);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + "traduzir-2.png" });
  ok(
    "limite mensal mostra aviso em português",
    /Tradução indisponível até ao início do próximo mês/.test(
      await p.evaluate(() => document.body.innerText),
    ),
  );
  ok("sem erros de JavaScript", errs.length === 0);
  if (errs.length) console.log(errs);
  await b.close();
})();
