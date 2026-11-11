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
  const box = await p.locator(".glass-float").last().boundingBox();
  const y = box.y + box.height / 2;
  const lensX = () =>
    p.evaluate(() => {
      const m = /translate3d\(([-\d.]+)px/.exec(
        document.querySelector(".glass-lens").style.transform,
      );
      return m ? +m[1] : null;
    });
  const x0 = await lensX();
  await p.touchscreen.tap(390 - 45, y);
  // amostra a posição durante a animação: deve ultrapassar o alvo (mola) e assentar
  const samples = [];
  for (let i = 0; i < 40; i++) {
    samples.push(await lensX());
    await p.waitForTimeout(25);
  }
  const final = samples[samples.length - 1];
  ok(
    "lente parte da 1.ª posição (" +
      x0.toFixed(0) +
      "px) e assenta no Perfil (" +
      final.toFixed(0) +
      "px)",
    x0 < 20 && final > 250,
  );
  const mono = samples.every((v, i) => i === 0 || v >= samples[i - 1] - 0.01);
  const overshoot = Math.max(...samples) > final + 0.5;
  console.log(samples.map((v) => v.toFixed(0)).join(" "));
  console.log("  máx " + Math.max(...samples).toFixed(1) + " vs final " + final.toFixed(1));
  ok("movimento com mola: ultrapassa o alvo e volta (ressalto físico)", overshoot);
  ok("lente fica quieta no fim (sem tremer)", Math.abs(samples[39] - samples[35]) < 0.3);
  // estica com velocidade
  const sc = await p.evaluate(() => 0);
  ok("sem erros JS", errs.length === 0);
  if (errs.length) console.log(errs);
  await b.close();
})();
