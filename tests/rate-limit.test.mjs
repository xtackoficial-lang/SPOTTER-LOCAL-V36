// node tests/rate-limit.test.mjs  (precisa de: npx tsx)
import {
  rateLimit,
  tooManyRequests,
  clientIp,
  LIMITS,
} from "../supabase/functions/_shared/rate-limit.ts";
let f = 0;
const t = (n, c) => {
  console.log((c ? "ok    " : "FALHOU ") + n);
  if (!c) f++;
};
// cliente falso com a mesma lógica da função SQL (janela fixa)
const mk = () => {
  const m = new Map();
  return {
    rpc: async (_fn, a) => {
      const w = Math.floor(Date.now() / 1000 / a.p_window_seconds);
      const k = a.p_key + w;
      const c = (m.get(k) ?? 0) + 1;
      m.set(k, c);
      return {
        data: [
          {
            allowed: c <= a.p_limit,
            remaining: Math.max(a.p_limit - c, 0),
            retry_after: c <= a.p_limit ? 0 : 7,
          },
        ],
        error: null,
      };
    },
  };
};
const sb = mk();
const r = [];
for (let i = 0; i < 5; i++) r.push(await rateLimit(sb, "x", 3, 60));
t(
  "3 primeiros passam",
  r.slice(0, 3).every((x) => x.allowed),
);
t("4.º e 5.º bloqueados", !r[3].allowed && !r[4].allowed);
t("remaining desce 2,1,0", r[0].remaining === 2 && r[1].remaining === 1 && r[2].remaining === 0);
t("chaves diferentes não se misturam", (await rateLimit(sb, "y", 3, 60)).allowed);
const bad = await rateLimit(
  { rpc: async () => ({ data: null, error: { message: "boom" } }) },
  "z",
  3,
  60,
);
t("falha da base de dados deixa passar (fail-open)", bad.allowed);
const res = tooManyRequests(7, { "Access-Control-Allow-Origin": "*" });
t(
  "429 + Retry-After + CORS",
  res.status === 429 &&
    res.headers.get("Retry-After") === "7" &&
    res.headers.get("Access-Control-Allow-Origin") === "*",
);
const body = await res.json();
t(
  "mensagem em português e código",
  /demasiados pedidos/.test(body.error) && body.code === "rate_limited",
);
t("minutos quando espera é longa", /3 minutos/.test((await tooManyRequests(150).json()).error));
t(
  "IP por cf-connecting-ip",
  clientIp(
    new Request("http://x", {
      headers: { "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" },
    }),
  ) === "1.2.3.4",
);
t(
  "IP por x-forwarded-for (1.º)",
  clientIp(new Request("http://x", { headers: { "x-forwarded-for": "5.6.7.8, 9.9.9.9" } })) ===
    "5.6.7.8",
);
t("IP desconhecido", clientIp(new Request("http://x")) === "unknown");
t("limites definidos", LIMITS.payment.limit > 0 && LIMITS.deleteAccount.window === 3600);
process.exit(f ? 1 : 0);
