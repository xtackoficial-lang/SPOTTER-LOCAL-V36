// npx tsx tests/translate.test.mjs
import {
  parseAzure,
  parseGoogle,
  decodeEntities,
  translateText,
  isLang,
  monthKey,
  baseLang,
  MAX_CHARS,
} from "../supabase/functions/_shared/translate.ts";
let f = 0;
const t = (n, c) => {
  console.log((c ? "ok    " : "FALHOU ") + n);
  if (!c) f++;
};
const env = (o) => ({ get: (k) => o[k] });
t("isLang aceita pt/en/es/fr", ["pt", "en", "es", "fr"].every(isLang));
t("isLang recusa outros", !isLang("de") && !isLang("") && !isLang(null) && !isLang("pt-PT"));
t(
  "baseLang",
  baseLang("pt-PT") === "pt" && baseLang("ZH_Hans") === "zh" && baseLang(undefined) === "",
);
t("monthKey", monthKey(new Date("2026-11-04T10:00:00Z")) === "2026-11");
t("MAX_CHARS razoável", MAX_CHARS >= 500 && MAX_CHARS <= 5000);
const az = parseAzure([
  { detectedLanguage: { language: "en", score: 1 }, translations: [{ text: "Olá", to: "pt" }] },
]);
t("parseAzure", az.text === "Olá" && az.detected === "en");
t(
  "parseAzure inválido lança",
  (() => {
    try {
      parseAzure({});
      return false;
    } catch {
      return true;
    }
  })(),
);
const gg = parseGoogle({
  data: {
    translations: [
      { translatedText: "It&#39;s &quot;ok&quot; &amp; fine", detectedSourceLanguage: "pt" },
    ],
  },
});
t("parseGoogle + entidades", gg.text === `It's "ok" & fine` && gg.detected === "pt");
t("decodeEntities", decodeEntities("&lt;b&gt;") === "<b>");
// Azure: pedido bem formado
let seen;
const okFetch = async (url, init) => {
  seen = { url, init };
  return new Response(
    JSON.stringify([{ detectedLanguage: { language: "pt" }, translations: [{ text: "Hello" }] }]),
    { status: 200 },
  );
};
const r = await translateText(
  "Olá",
  "en",
  env({ AZURE_TRANSLATOR_KEY: "k", AZURE_TRANSLATOR_REGION: "southafricanorth" }),
  okFetch,
);
t("Azure: resultado", r.text === "Hello" && r.detected === "pt");
t(
  "Azure: URL e cabeçalhos",
  seen.url.includes("api-version=3.0&to=en") &&
    seen.init.headers["Ocp-Apim-Subscription-Key"] === "k" &&
    seen.init.headers["Ocp-Apim-Subscription-Region"] === "southafricanorth",
);
t("Azure: corpo [{Text}]", JSON.parse(seen.init.body)[0].Text === "Olá");
t(
  "Azure: sem chave lança",
  await translateText("x", "en", env({}), okFetch).then(
    () => false,
    () => true,
  ),
);
t(
  "Azure: HTTP 403 lança",
  await translateText(
    "x",
    "en",
    env({ AZURE_TRANSLATOR_KEY: "k", AZURE_TRANSLATOR_REGION: "r" }),
    async () => new Response("no", { status: 403 }),
  ).then(
    () => false,
    (e) => /403/.test(e.message),
  ),
);
// Google
const gFetch = async (url, init) => {
  seen = { url, init };
  return new Response(
    JSON.stringify({
      data: { translations: [{ translatedText: "Bonjour", detectedSourceLanguage: "pt" }] },
    }),
    { status: 200 },
  );
};
const g = await translateText(
  "Olá",
  "fr",
  env({ TRANSLATE_PROVIDER: "google", GOOGLE_TRANSLATE_KEY: "gk" }),
  gFetch,
);
t(
  "Google: resultado e URL",
  g.text === "Bonjour" && seen.url.includes("key=gk") && JSON.parse(seen.init.body).target === "fr",
);
t(
  "Google: sem chave lança",
  await translateText("x", "fr", env({ TRANSLATE_PROVIDER: "google" }), gFetch).then(
    () => false,
    () => true,
  ),
);
process.exit(f ? 1 : 0);
