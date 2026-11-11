// Cliente do botão "Traduzir": chama a Edge Function translate-message.
import { supabase, SUPABASE_CONFIGURED } from "./supabase";
import { getLocale, type Locale } from "./i18n";

export type TranslateResult = { text: string; sameLanguage: boolean };
export class TranslateError extends Error {
  constructor(
    message: string,
    public kind: "quota" | "rate" | "offline" | "other",
  ) {
    super(message);
  }
}

// Cache em memória (evita repetir o pedido na mesma sessão)
const memo = new Map<string, TranslateResult>();
const key = (id: string, to: Locale) => `${id}:${to}`;

export function translateAvailable(): boolean {
  return SUPABASE_CONFIGURED && !!supabase;
}

export async function translateMessage(
  messageId: string,
  to: Locale = getLocale(),
): Promise<TranslateResult> {
  const hit = memo.get(key(messageId, to));
  if (hit) return hit;
  if (!SUPABASE_CONFIGURED || !supabase) throw new TranslateError("sem ligação", "offline");
  const { data, error } = await supabase.functions.invoke("translate-message", {
    body: { messageId, to },
  });
  if (error || !data?.text) {
    let status = 0;
    let code = "";
    try {
      const ctx = (error as { context?: Response } | null)?.context;
      if (ctx) {
        status = ctx.status;
        code = (await ctx.json())?.code ?? "";
      }
    } catch {
      /* corpo sem JSON */
    }
    if (status === 429) throw new TranslateError("limite", code === "quota" ? "quota" : "rate");
    throw new TranslateError(error?.message ?? "falhou", "other");
  }
  const r: TranslateResult = { text: String(data.text), sameLanguage: !!data.sameLanguage };
  memo.set(key(messageId, to), r);
  return r;
}
