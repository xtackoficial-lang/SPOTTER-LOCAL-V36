const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript(() => {
    if (location.protocol !== "http:" || window.name === "s") return;
    window.name = "s";
    localStorage.setItem("xlocal.intro.seen.v1", "1");
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
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  const ok = (n, c) => {
    console.log((c ? "ok    " : "FALHA ") + n);
    if (!c) process.exitCode = 1;
  };
  await p.goto("http://127.0.0.1:5190/home", { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  const nav = p.locator(".glass-float").last();
  const box = await nav.boundingBox();
  const y = box.y + box.height / 2;
  // toque simples em Perfil
  await p.touchscreen.tap(390 - 45, y);
  await p.waitForTimeout(900);
  ok("toque abre Perfil", p.url().endsWith("/profile"));
  // arrastar de Perfil até QR via CDP touch
  const cdp = await ctx.newCDPSession(p);
  const t = (type, x) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
    });
  await t("touchStart", 390 - 45);
  await p.waitForTimeout(100);
  for (let x = 345; x >= 195; x -= 15) {
    await t("touchMove", x);
    await p.waitForTimeout(25);
  }
  await p.screenshot({
    path: "tab-drag.png",
    clip: { x: 0, y: box.y - 30, width: 390, height: box.height + 50 },
  });
  const isDrag = await p.evaluate(() => !!document.querySelector(".glass-lens.is-dragging"));
  ok("durante o arrasto a pastilha está em modo lente", isDrag);
  await t("touchEnd", 195);
  await p.waitForTimeout(1000);
  ok("soltar sobre QR abre /qr", p.url().endsWith("/qr"));
  await p.screenshot({
    path: "tab-after.png",
    clip: { x: 0, y: box.y - 30, width: 390, height: box.height + 50 },
  });
  ok("sem erros JS", errs.length === 0);
  if (errs.length) console.log(errs);
  await b.close();
})();
