// Código OTP: registo (confirmar conta) e recuperar senha, contra o servidor de mentira.
// O Supabase é simulado dentro do teste (aceita o código 123456). Compilar assim:
//   VITE_SUPABASE_URL=https://mock.supabase.test VITE_SUPABASE_ANON_KEY=chave-de-teste-com-mais-de-20-letras npx vite build && npx vite preview --port 5191
//   node tests/e2e-otp/teste-otp.cjs
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const calls = [];
  const user = {
    id: "22222222-2222-4222-8222-222222222222",
    aud: "authenticated",
    role: "authenticated",
    email: "nova.teste@gmail.com",
    user_metadata: { name: "Nova" },
    app_metadata: {},
    created_at: new Date().toISOString(),
  };
  await ctx.route(/mock\.supabase\.test/, async (route) => {
    const req = route.request();
    const u = new URL(req.url()).pathname;
    let j = {};
    try {
      j = JSON.parse(req.postData() || "{}");
    } catch {}
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    const send = (status, o) =>
      route.fulfill({
        status,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify(o),
      });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    calls.push(req.method() + " " + u + " " + (j.type || "") + " " + (j.token || ""));
    if (u === "/auth/v1/signup")
      return send(200, {
        ...user,
        email: j.email || user.email,
        confirmation_sent_at: new Date().toISOString(),
      });
    if (u === "/auth/v1/verify")
      return j.token === "123456"
        ? send(200, {
            access_token: "a.b.c",
            token_type: "bearer",
            expires_in: 3600,
            refresh_token: "r",
            user: { ...user, email: j.email },
          })
        : send(403, {
            code: 403,
            error_code: "otp_expired",
            msg: "Token has expired or is invalid",
          });
    if (u === "/auth/v1/resend" || u === "/auth/v1/recover") return send(200, {});
    if (u === "/auth/v1/user") return send(200, user);
    if (u.startsWith("/rest/v1/rpc/"))
      return send(404, { code: "PGRST202", message: "Could not find the function" });
    if (u.startsWith("/rest/v1/")) return send(200, []);
    return send(200, {});
  });
  await ctx.addInitScript(() => {
    if (location.protocol === "http:") localStorage.setItem("xlocal.intro.seen.v1", "1");
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, c) => {
    console.log((c ? "ok    " : "FALHA ") + n);
    if (!c) process.exitCode = 1;
  };
  const U = "http://127.0.0.1:5191";
  const type = async (code) => {
    const boxes = p.locator('input[aria-label^="Dígito"]');
    await boxes.first().click();
    await p.keyboard.type(code, { delay: 30 });
  };

  // ---------- REGISTO ----------
  await p.goto(U + "/", { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  await p
    .getByRole("button", { name: /E-?mail|Email/i })
    .first()
    .click()
    .catch(() => {});
  await p.waitForTimeout(400);
  const nameBox = p.locator('input[autocomplete="name"], input[placeholder*="nome" i]').first();
  if (await nameBox.count()) await nameBox.fill("Nova Pessoa");
  await p.locator('input[type="email"]').first().fill("nova.teste@gmail.com");
  await p.locator('input[type="password"]').first().fill("Senha#2026ok");
  await p
    .getByRole("button", { name: /Criar conta|Continuar/i })
    .last()
    .click();
  await p.waitForTimeout(1500);

  ok(
    "registo: aparece o ecrã com 6 caixas para o código",
    (await p.locator('input[aria-label^="Dígito"]').count()) === 6,
  );
  ok(
    "registo: texto fala em código de 6 dígitos (não em link)",
    /código de 6 dígitos/.test(await p.evaluate(() => document.body.innerText)),
  );
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + "1-registo-codigo.png" });
  await type("000000");
  await p.waitForTimeout(900);
  if (process.env.SHOT)
    await p.screenshot({ path: process.env.SHOT + "2-registo-codigo-errado.png" });
  ok(
    "registo: código errado mostra erro e esvazia as caixas",
    /errado ou expirado/i.test(await p.evaluate(() => document.body.innerText)) &&
      (await p.locator('input[aria-label="Dígito 1"]').inputValue()) === "",
  );
  ok(
    "registo: botão Reenviar está em espera (60 s)",
    /Reenviar código em \d+s/.test(await p.evaluate(() => document.body.innerText)),
  );
  await type("123456");
  await p.waitForTimeout(1800);
  ok(
    "registo: código certo abre a sessão e segue para o onboarding",
    /\/onboarding|\/home/.test(p.url()),
  );

  // ---------- COLAR O CÓDIGO ----------
  await ctx.clearCookies();
  await p.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  // ---------- RECUPERAR SENHA ----------
  await p.goto(U + "/forgot-password", { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  await p.locator('input[type="email"]').fill("nova.teste@gmail.com");
  await p
    .getByRole("button", { name: /Enviar|Recuperar/i })
    .last()
    .click();
  await p.waitForTimeout(1200);
  ok(
    "recuperar: aparece o ecrã com 6 caixas",
    (await p.locator('input[aria-label^="Dígito"]').count()) === 6,
  );
  if (process.env.SHOT)
    await p.screenshot({ path: process.env.SHOT + "3-recuperar-senha-codigo.png" });
  await p.locator('input[aria-label="Dígito 1"]').click();
  await p.evaluate(() => {
    const el = document.querySelector('input[aria-label="Dígito 1"]');
    const dt = new DataTransfer();
    dt.setData("text", "123456");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  });
  await p.waitForTimeout(300);
  // Chromium não aplica o "paste" sintético; escreve o valor completo na 1.ª caixa (é o que faz o preenchimento automático do teclado)
  if ((await p.locator('input[aria-label="Dígito 6"]').inputValue()) === "") {
    await p.locator('input[aria-label="Dígito 1"]').fill("123456");
  }
  await p.waitForTimeout(1800);
  ok(
    "recuperar: código completo (colado/auto-preenchido) leva à página da senha nova",
    p.url().endsWith("/reset-password"),
  );
  ok(
    'o servidor recebeu verify tipo "signup" e tipo "recovery"',
    calls.some((c) => /verify signup/.test(c)) && calls.some((c) => /verify recovery/.test(c)),
  );
  // ---------- LIMITE DE TENTATIVAS ----------
  await p.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await p.goto(U + "/forgot-password", { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  await p.locator('input[type="email"]').fill("outra.pessoa@gmail.com");
  await p
    .getByRole("button", { name: /Enviar|Recuperar/i })
    .last()
    .click();
  await p.waitForTimeout(1200);
  for (let i = 0; i < 5; i++) {
    await type("000000");
    await p.waitForTimeout(700);
  }
  if (process.env.SHOT)
    await p.screenshot({ path: process.env.SHOT + "4-bloqueio-tentativas.png" });
  ok(
    "5 códigos errados seguidos bloqueiam novas tentativas",
    /Demasiadas tentativas/.test(await p.evaluate(() => document.body.innerText)),
  );
  await type("123456");
  await p.waitForTimeout(800);
  ok("durante o bloqueio nem o código certo é aceite", p.url().endsWith("/forgot-password"));
  ok("sem erros de JavaScript", errs.length === 0);
  if (errs.length) console.log(errs);
  await b.close();
})();
