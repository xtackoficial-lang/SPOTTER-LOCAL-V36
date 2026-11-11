// Tradução de mensagens: lógica pura (testável) + ligação ao serviço escolhido.
// Serviço por variável TRANSLATE_PROVIDER = "azure" (predefinido) | "google".
export const LANGS = ["pt", "en", "es", "fr"] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);

/** Mensagens maiores que isto não são traduzidas (poupa caracteres e abuso). */
export const MAX_CHARS = 1500;
/** Orçamento mensal de segurança: 90% de 2 milhões (Azure F0). Ajustável por TRANSLATE_MONTHLY_CAP. */
export const DEFAULT_MONTHLY_CAP = 1_800_000;

export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

/** Normaliza códigos devolvidos pelos serviços ("pt-PT", "zh-Hans") para a língua base. */
export const baseLang = (code: string | undefined | null): string => (code ?? "").toLowerCase().split(/[-_]/)[0];

export type Translation = { text: string; detected: string };

export function parseAzure(json: unknown): Translation {
  const r = (Array.isArray(json) ? json[0] : null) as
    | { detectedLanguage?: { language?: string }; translations?: { text?: string }[] }
    | null;
  const text = r?.translations?.[0]?.text;
  if (typeof text !== "string") throw new Error("resposta do Azure inválida");
  return { text, detected: baseLang(r?.detectedLanguage?.language) };
}

export function parseGoogle(json: unknown): Translation {
  const t = (json as { data?: { translations?: { translatedText?: string; detectedSourceLanguage?: string }[] } })?.data
    ?.translations?.[0];
  if (typeof t?.translatedText !== "string") throw new Error("resposta da Google inválida");
  return { text: decodeEntities(t.translatedText), detected: baseLang(t.detectedSourceLanguage) };
}

/** A Google devolve &#39; &quot; etc. mesmo com format=text em alguns casos. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export async function translateText(
  text: string,
  to: Lang,
  env: { get: (k: string) => string | undefined },
  doFetch: Fetcher = fetch,
): Promise<Translation> {
  const provider = (env.get("TRANSLATE_PROVIDER") ?? "azure").toLowerCase();
  if (provider === "google") {
    const key = env.get("GOOGLE_TRANSLATE_KEY");
    if (!key) throw new Error("GOOGLE_TRANSLATE_KEY em falta");
    const res = await doFetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, target: to, format: "text" }),
    });
    if (!res.ok) throw new Error(`Google respondeu ${res.status}`);
    return parseGoogle(await res.json());
  }
  const key = env.get("AZURE_TRANSLATOR_KEY");
  const region = env.get("AZURE_TRANSLATOR_REGION");
  if (!key || !region) throw new Error("AZURE_TRANSLATOR_KEY/REGION em falta");
  const endpoint = (env.get("AZURE_TRANSLATOR_ENDPOINT") ?? "https://api.cognitive.microsofttranslator.com").replace(/\/+$/, "");
  const res = await doFetch(`${endpoint}/translate?api-version=3.0&to=${to}&textType=plain`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Ocp-Apim-Subscription-Region": region,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ Text: text }]),
  });
  if (!res.ok) throw new Error(`Azure respondeu ${res.status}`);
  return parseAzure(await res.json());
}
