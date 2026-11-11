// Sair da conta com confirmação, limpeza dos dados e página de notificações.
// Precisa da app compilada SEM Supabase: `npx vite build && npx vite preview --port 5190`
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript(() => {
    if (location.protocol !== "http:" || window.name === "seeded") return;
    window.name = "seeded";
    localStorage.setItem(
      "xlocal.auth.user.v1",
      JSON.stringify({ id: "user-A", email: "a@x.com", name: "Ana", profileType: "personal" }),
    );
    localStorage.setItem("xlocal.last-uid.v1", "user-A");
    localStorage.setItem(
      "xlocal.onboarding.v1",
      JSON.stringify({
        profileType: "personal",
        step: 0,
        completed: true,
        authMethod: "email",
        personal: { name: "Ana" },
        business: {},
        ownerUid: "user-A",
      }),
    );
    localStorage.setItem(
      "xlocal.chats.v1",
      JSON.stringify({
        p1: { placeId: "p1", placeName: "Segredo da Ana", messages: [], unread: 1, updatedAt: "" },
      }),
    );
    localStorage.setItem(
      "xlocal.notifs.v1",
      JSON.stringify([
        { id: "1", title: "Aviso da Ana", body: "x", at: new Date().toISOString(), read: false },
      ]),
    );
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, c) => {
    console.log((c ? "ok    " : "FALHA ") + n);
    if (!c) process.exitCode = 1;
  };
  const U = "http://127.0.0.1:5190";
  await p.goto(U + "/profile", { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  await p.getByRole("link", { name: /Notificações/ }).click();
  await p.waitForTimeout(800);
  ok(
    "Perfil → Notificações abre a página",
    p.url().endsWith("/notifications") && (await p.getByText("Aviso da Ana").count()) === 1,
  );
  await p.goto(U + "/profile", { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  await p
    .getByRole("button", { name: /Sair|Terminar/ })
    .first()
    .click();
  await p.waitForTimeout(400);
  ok(
    "Sair pede confirmação (diálogo aberto)",
    (await p.getByRole("dialog").count()) === 1 &&
      /Sair da conta/.test(await p.getByRole("dialog").innerText()),
  );
  await p.getByRole("button", { name: /Cancelar/ }).click();
  await p.waitForTimeout(300);
  ok(
    "Cancelar fecha o diálogo e mantém a sessão",
    (await p.getByRole("dialog").count()) === 0 &&
      (await p.evaluate(() => !!localStorage.getItem("xlocal.auth.user.v1"))),
  );
  await p
    .getByRole("button", { name: /Sair|Terminar/ })
    .first()
    .click();
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: /Sim, sair/ }).click();
  await p.waitForTimeout(1800);
  const left = await p.evaluate(() => ({
    chats: localStorage.getItem("xlocal.chats.v1"),
    notifs: localStorage.getItem("xlocal.notifs.v1"),
    user: localStorage.getItem("xlocal.auth.user.v1"),
  }));
  ok(
    "Confirmar: sessão terminada e voltou ao início",
    new URL(p.url()).pathname === "/" && !left.user,
  );
  ok(
    "Dados da conta A apagados do telemóvel (conversas, notificações)",
    !left.chats && !left.notifs,
  );
  await p.goto(U + "/privacy", { waitUntil: "networkidle" });
  ok("/privacy abre (não é 404)", (await p.evaluate(() => document.body.innerText)).length > 200);
  ok("sem erros de JavaScript", errs.length === 0);
  if (errs.length) console.log(errs);
  await b.close();
})();
