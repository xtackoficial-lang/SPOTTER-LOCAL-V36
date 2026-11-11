// Teste no browser (Chromium, formato telemóvel) do carrossel, mosaico e visualizador ao estilo Instagram.
const { chromium } = require("playwright");
const URL = process.env.URL || "http://127.0.0.1:5199/tests/e2e-fotos/index.html";
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errs.push("console: " + m.text());
  });
  await p.goto(URL, { waitUntil: "networkidle" });
  let falhas = 0;
  const ok = (n, c) => {
    console.log((c ? "ok    " : "FALHA ") + n);
    if (!c) falhas++;
  };
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
  const wait = (ms) => p.waitForTimeout(ms);
  const swipe = async (x, y, dx, dy) => {
    // Toques reais (touchStart → vários touchMove → touchEnd). O synthesizeScrollGesture não rola contentores com encaixe.
    // dx < 0 = dedo para a esquerda = foto seguinte.
    await touch("touchStart", [{ x, y }]);
    for (let k = 1; k <= 6; k++)
      await touch("touchMove", [{ x: x + (dx * k) / 6, y: y + (dy * k) / 6 }]);
    await touch("touchEnd", []);
    await wait(700);
  };
  const dlg = p.locator("[role=dialog]");
  const tf = async () => {
    const t = await p.evaluate(() => {
      const d = document.querySelector("[role=dialog]");
      if (!d) return null;
      const n = [...d.querySelectorAll("[data-slide] img")].find((i) => i.style.transform);
      return n ? n.style.transform : null;
    });
    if (!t) return null;
    const m = t.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/);
    return m ? { x: +m[1], y: +m[2], s: +m[3] } : null;
  };
  const counter = async () => (await dlg.innerText()).match(/(\d+)\/(\d+)/)?.[0];

  // ── galeria do perfil: o comerciante escolhe a forma (fila / mosaico / grelha) ──
  const tiles = (id) => p.locator(`#${id} button[aria-label*="foto"]`).count();
  const kind = (id) => p.locator(`#${id} [data-gallery]`).getAttribute("data-gallery");
  // FILA (a forma original, predefinida)
  ok("sem escolha → fila deslizante", (await kind("strip5")) === "strip");
  for (const n of [1, 2, 5, 12, 26])
    ok(
      `fila com ${n} fotos → ${await tiles("strip" + n)} fotos (todas, deslizando)`,
      (await tiles("strip" + n)) === n,
    );
  const stripBox = await p
    .locator("#strip12 .overflow-x-auto")
    .evaluate((e) => [e.scrollWidth > e.clientWidth, getComputedStyle(e).display]);
  ok(
    "fila: desliza para o lado (" + stripBox.join(", ") + ")",
    stripBox[0] === true && stripBox[1] === "flex",
  );
  const sz = await p
    .locator('#strip5 button[aria-label*="foto"]')
    .first()
    .evaluate((e) => [e.offsetWidth, e.offsetHeight]);
  ok("fila: quadrados de 96 px como antes (" + sz.join("×") + ")", sz[0] === 96 && sz[1] === 96);
  // MOSAICO
  ok("mosaico escolhido → mosaico", (await kind("mosaic7")) === "mosaic");
  ok("mosaico com 3 fotos cai para a fila (precisa de 4+)", (await kind("mosaic3")) === "strip");
  ok(
    "mosaico: 4 fotos → 4 · 5 → 5 · 7 → 5 · 26 → 5",
    (await tiles("mosaic4")) === 4 &&
      (await tiles("mosaic5")) === 5 &&
      (await tiles("mosaic7")) === 5 &&
      (await tiles("mosaic26")) === 5,
  );
  ok(
    'mosaico de 7 fotos mostra "+3"',
    (await p.locator("#mosaic7 button span").innerText()) === "+3",
  );
  ok(
    'mosaico de 26 fotos mostra "+22"',
    (await p.locator("#mosaic26 button span").innerText()) === "+22",
  );
  // GRELHA (estilo perfil do Instagram)
  ok("grelha escolhida → grelha", (await kind("grid7")) === "grid");
  for (const n of [1, 2, 4, 5, 7])
    ok(
      `grelha com ${n} fotos → ${await tiles("grid" + n)} na grelha`,
      (await tiles("grid" + n)) === n,
    );
  const cols = async (id) =>
    await p
      .locator(`#${id} .grid`)
      .evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length);
  ok(
    "grelha: 1 foto = 1 coluna; 2 fotos = 2; 4+ = 3",
    (await cols("grid1")) === 1 &&
      (await cols("grid2")) === 2 &&
      (await cols("grid4")) === 3 &&
      (await cols("grid26")) === 3,
  );
  const sq = await p
    .locator('#grid7 button[aria-label*="foto"]')
    .first()
    .evaluate((e) => [e.offsetWidth, e.offsetHeight]);
  ok("grelha: quadrados (" + sq.join("×") + ")", Math.abs(sq[0] - sq[1]) <= 1);
  ok(
    'grelha com 26 fotos: 9 à vista + botão "Ver todos (26)"',
    (await tiles("grid26")) === 9 &&
      /26/.test(await p.locator('#grid26 button:not([aria-label*="foto"])').innerText()),
  );
  await p.locator('#grid26 button:not([aria-label*="foto"])').tap();
  await wait(200);
  ok('"Ver todos" mostra as 26 fotos', (await tiles("grid26")) === 26);
  await p.locator('#grid26 button:not([aria-label*="foto"])').tap();
  await wait(200);
  ok("▲ volta a recolher para 9", (await tiles("grid26")) === 9);
  // Em qualquer forma, tocar numa foto abre o visualizador na foto certa
  for (const [id, k, total] of [
    ["strip12", 4, 12],
    ["mosaic12", 2, 12],
    ["grid12", 4, 12],
  ]) {
    const el = p.locator(`#${id} button[aria-label*="foto"]`).nth(k);
    await el.scrollIntoViewIfNeeded();
    await el.tap();
    await p.waitForSelector("[role=dialog]");
    await wait(300);
    ok(
      `${id}: tocar na foto ${k + 1} abre o visualizador em ${k + 1}/${total}`,
      (await counter()) === `${k + 1}/${total}`,
    );
    await p.keyboard.press("Escape");
    await wait(300);
  }
  await p.locator("#strip5").scrollIntoViewIfNeeded();
  await wait(300);
  await p.locator("#strip5").screenshot({ path: "/tmp/gal-strip.png" });
  await p.locator("#mosaic7").scrollIntoViewIfNeeded();
  await wait(300);
  await p.locator("#mosaic7").screenshot({ path: "/tmp/gal-mosaic.png" });
  await p.locator("#grid7").scrollIntoViewIfNeeded();
  await wait(300);
  await p.locator("#grid7").screenshot({ path: "/tmp/gal-grid.png" });

  // ── carrossel (estilo Instagram) ──
  await p.locator("#carousel").scrollIntoViewIfNeeded();
  const cBox = await p.locator("#carousel > div > div").first().boundingBox();
  const dotsBox = await p.locator("#carousel > div > div").nth(1).boundingBox();
  ok("pontinhos ficam POR BAIXO da foto", dotsBox && cBox && dotsBox.y >= cBox.y + cBox.height - 1);
  ok("contador 1/5 na foto", (await p.locator("#carousel").innerText()).includes("1/5"));
  ok(
    "sem setas visíveis no telemóvel",
    await p
      .locator('#carousel button[aria-label^="Foto"]')
      .evaluateAll((a) => a.every((e) => getComputedStyle(e).display === "none")),
  );
  await swipe(200, cBox.y + 200, -250, 0);
  ok(
    "deslizar no carrossel passa para 2/5",
    (await p.locator("#carousel").innerText()).includes("2/5"),
  );
  await swipe(200, cBox.y + 200, -250, 0);
  ok("...e para 3/5", (await p.locator("#carousel").innerText()).includes("3/5"));
  const dots = await p
    .locator("#carousel7 > div > div")
    .nth(1)
    .locator("span")
    .evaluateAll((a) => a.map((e) => e.offsetWidth));
  ok(
    "7 fotos: só 5 pontinhos visíveis (" + dots.join(",") + ")",
    dots.filter((w) => w > 0).length === 5,
  );

  // ── abrir o visualizador na foto certa ──
  await p.locator("#carousel img").nth(2).tap();
  await p.waitForSelector("[role=dialog]");
  await wait(300);
  ok("abre na foto onde estava o carrossel (3/5)", (await counter()) === "3/5");
  ok(
    "SEM botões + e −",
    (await dlg.locator('button[aria-label="+"], button[aria-label="−"]').count()) === 0,
  );
  ok("SEM tira de miniaturas", (await dlg.locator('img[loading=lazy][alt=""]').count()) === 0);
  ok("pontinhos no fundo", (await dlg.locator("div[aria-hidden=true] span").count()) === 5);
  await p.screenshot({ path: "/tmp/viewer.png" });

  const sbox = await dlg.locator("[data-slide] img").nth(2).boundingBox();
  const cx = 195,
    cy = 422;
  // pinça com o centro à direita → a foto desloca-se para a esquerda (o ponto fica entre os dedos)
  await touch("touchStart", [
    { x: 280, y: cy },
    { x: 320, y: cy },
  ]);
  await touch("touchMove", [
    { x: 250, y: cy },
    { x: 350, y: cy },
  ]);
  await wait(100);
  let t = await tf();
  ok(
    `pinça aproxima à volta dos dedos (escala ${t.s.toFixed(2)}, x ${t.x.toFixed(0)})`,
    t.s > 2 && t.x < -20,
  );
  await p.screenshot({ path: "/tmp/viewer-zoom.png" });
  // ao largar, volta suavemente ao sítio (como no Instagram)
  await touch("touchEnd", []);
  await wait(500);
  const back = await tf();
  ok(
    `largar a pinça: a foto volta ao sítio (escala ${back.s})`,
    back.s === 1 && back.x === 0 && back.y === 0,
  );
  // duplo toque aproxima e FICA; com zoom: arrastar mexe na foto e não troca
  const dtap = async (x, y) => {
    await touch("touchStart", [{ x, y }]);
    await touch("touchEnd", []);
    await wait(70);
    await touch("touchStart", [{ x, y }]);
    await touch("touchEnd", []);
    await wait(350);
  };
  await dtap(300, cy);
  t = await tf();
  ok(`duplo toque aproxima e fica (escala ${t.s})`, t.s === 2.5);
  await touch("touchStart", [{ x: 250, y: cy }]);
  await touch("touchMove", [{ x: 280, y: cy + 10 }]);
  await touch("touchEnd", []);
  await wait(250);
  const t2 = await tf();
  ok(
    "com zoom, arrastar desloca a foto (x " +
      t.x.toFixed(0) +
      " → " +
      t2.x.toFixed(0) +
      ") e fica em 3/5",
    t2.x > t.x && (await counter()) === "3/5",
  );
  // pinça a partir de uma foto já ampliada por duplo toque: não volta sozinha
  await touch("touchStart", [
    { x: 150, y: cy },
    { x: 240, y: cy },
  ]);
  await touch("touchMove", [
    { x: 130, y: cy },
    { x: 260, y: cy },
  ]);
  await touch("touchEnd", []);
  await wait(400);
  const kept = await tf();
  ok(`pinça sobre foto ampliada por duplo toque fica (escala ${kept.s.toFixed(2)})`, kept.s > 2.5);
  ok(
    "controlos escondem-se com zoom",
    (await dlg
      .locator("div.pointer-events-none")
      .first()
      .evaluate((e) => +getComputedStyle(e).opacity)) < 0.1,
  );
  // duplo toque afasta
  await dtap(cx, cy);
  t = await tf();
  ok("duplo toque afasta (escala " + t.s + ")", t.s === 1 && t.x === 0);
  // duplo toque num ponto à esquerda aproxima nesse ponto
  await dtap(90, cy);
  t = await tf();
  ok(
    `duplo toque à esquerda aproxima nesse ponto (escala ${t.s}, x ${t.x.toFixed(0)})`,
    t.s === 2.5 && t.x > 20,
  );
  await dtap(cx, cy);
  // largar a pinça abaixo do tamanho normal → volta ao sítio
  await touch("touchStart", [
    { x: 150, y: cy },
    { x: 240, y: cy },
  ]);
  await touch("touchMove", [
    { x: 175, y: cy },
    { x: 215, y: cy },
  ]);
  const mid = await tf();
  await touch("touchEnd", []);
  await wait(400);
  t = await tf();
  ok(
    `pinça para dentro e largar: volta a 1 (de ${mid.s.toFixed(2)} para ${t.s})`,
    mid.s < 1 && t.s === 1,
  );

  // deslizar para o lado segue o dedo e troca de foto
  await swipe(300, 500, -260, 0);
  ok("deslizar no visualizador passa para 4/5", (await counter()) === "4/5");
  await swipe(100, 500, 260, 0);
  ok("...e volta para 3/5", (await counter()) === "3/5");

  // arrastar para baixo: pouco volta, muito fecha
  await touch("touchStart", [{ x: cx, y: 300 }]);
  await touch("touchMove", [{ x: cx, y: 320 }]);
  await touch("touchMove", [{ x: cx, y: 345 }]);
  const bgDrag = await dlg.evaluate((e) => getComputedStyle(e).backgroundColor);
  await touch("touchEnd", []);
  await wait(400);
  ok("arrasto curto: volta e continua aberto", (await dlg.count()) === 1 && (await tf()).y === 0);
  ok(
    "durante o arrasto o fundo esvanece (" + bgDrag + ")",
    /rgba/.test(bgDrag) && parseFloat(bgDrag.split(",")[3]) < 0.95,
  );
  await touch("touchStart", [{ x: cx, y: 300 }]);
  await touch("touchMove", [{ x: cx, y: 340 }]);
  await touch("touchMove", [{ x: cx, y: 520 }]);
  await touch("touchEnd", []);
  await wait(600);
  ok("arrasto longo para baixo fecha", (await dlg.count()) === 0);

  // Esc, fundo, foto única
  // (o Chromium simulado engole o 1.º toque a seguir a um arrasto vertical: toque neutro antes)
  await touch("touchStart", [{ x: 5, y: 840 }]);
  await touch("touchEnd", []);
  await wait(300);
  await p.locator("#carousel img").first().tap();
  await p.waitForSelector("[role=dialog]");
  await wait(300);
  await p.keyboard.press("Escape");
  await wait(200);
  ok("Esc fecha", (await dlg.count()) === 0);
  await p.locator("#single img").tap();
  await p.waitForSelector("[role=dialog]");
  await wait(300);
  ok(
    "foto única: sem contador nem pontinhos",
    !(await counter()) && (await dlg.locator("div[aria-hidden=true] span").count()) === 0,
  );
  await p.mouse.click(5, 5);
  await wait(200);
  ok("toque no fundo fecha", (await dlg.count()) === 0);

  // mosaico abre na foto tocada
  await p.locator("#mosaic5 button").nth(2).scrollIntoViewIfNeeded();
  await p.locator("#mosaic5 button").nth(2).tap();
  await p.waitForSelector("[role=dialog]");
  await wait(300);
  ok("mosaico: 3.ª foto abre em 3/5", (await counter()) === "3/5");

  console.log(errs.length ? "ERROS NA CONSOLA:\n" + errs.join("\n") : "consola sem erros");
  console.log(falhas ? falhas + " FALHAS" : "TUDO OK");
  await b.close();
})();
