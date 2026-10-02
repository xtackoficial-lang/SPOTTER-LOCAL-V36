// Imita o Supabase: /auth/v1/user (getUser), /auth/v1/admin/users/:id, /rest/v1/* -> PostgREST
import http from "node:http";
import fs from "node:fs";
import { verify } from "./lib.mjs";
http.createServer((req, res) => {
  const url = req.url;
  if (url.startsWith("/auth/v1/user")) {
    const tok = (req.headers.authorization || "").replace(/^Bearer /, "");
    const c = verify(tok);
    if (!c || !c.sub) { res.writeHead(401, {"content-type":"application/json"}); return res.end(JSON.stringify({ msg: "invalid JWT", code: 401 })); }
    res.writeHead(200, {"content-type":"application/json"});
    return res.end(JSON.stringify({ id: c.sub, email: c.email || `${c.sub}@test`, aud: "authenticated", role: "authenticated", user_metadata: {}, app_metadata: {} }));
  }
  if (url.startsWith("/auth/v1/admin/users/")) {
    fs.appendFileSync("/tmp/h/admin-calls.log", req.method + " " + url + "\n");
    res.writeHead(200, {"content-type":"application/json"}); return res.end("{}");
  }
  if (url.startsWith("/rest/v1/")) {
    const target = url.replace("/rest/v1", "");
    const p = http.request({ host: "127.0.0.1", port: 3000, path: target, method: req.method, headers: { ...req.headers, host: "127.0.0.1:3000" } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
    return req.pipe(p);
  }
  res.writeHead(404); res.end("not found: " + url);
}).listen(54321, "127.0.0.1", () => console.log("gateway :54321"));
