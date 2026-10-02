// Imita a ZumboPay (porta 4000) e o Resend; guarda tudo em /tmp/h/mock.log
import http from "node:http";
import fs from "node:fs";
let mode = "ok";
http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    const rec = { path: req.url, method: req.method, headers: req.headers, body };
    fs.appendFileSync("/tmp/h/mock.log", JSON.stringify(rec) + "\n");
    if (req.url === "/__mode") { mode = body.trim(); res.writeHead(200); return res.end("ok"); }
    if (req.url === "/api/public/v1/payments" && req.method === "POST") {
      const h = req.headers; let b = {}; try { b = JSON.parse(body); } catch {}
      // Valida como a ZumboPay real faria (doc oficial)
      const problemas = [];
      if (!/^Bearer zk_/.test(h.authorization || "")) problemas.push("Authorization Bearer zk_...");
      if (!h["x-merchant-id"]) problemas.push("X-Merchant-Id");
      if (!b.wallet_id) problemas.push("wallet_id");
      if (typeof b.amount !== "number" || b.amount <= 0) problemas.push("amount>0");
      if (!b.title) problemas.push("title");
      if (b.currency !== "MZN") problemas.push("currency MZN");
      if (problemas.length) { res.writeHead(422, {"content-type":"application/json"}); return res.end(JSON.stringify({ error: "validation", missing: problemas })); }
      if (mode === "down") { res.writeHead(503); return res.end("service unavailable"); }
      if (mode === "badjson") { res.writeHead(201); return res.end(JSON.stringify({ data: {} })); }
      const ref = "ZP_" + Math.random().toString(36).slice(2, 10).toUpperCase();
      res.writeHead(201, {"content-type":"application/json"});
      return res.end(JSON.stringify({ data: { id: crypto.randomUUID(), reference: ref, slug: ref.toLowerCase(), checkout_url: "https://zumbopay.com/pay/" + ref.toLowerCase(), amount: b.amount } }));
    }
    if (req.url === "/emails") { res.writeHead(200); return res.end("{}"); }
    res.writeHead(404); res.end("nf");
  });
}).listen(4000, "127.0.0.1", () => console.log("mocks :4000"));
