import { supabase, SUPABASE_CONFIGURED } from "./supabase";

// ============================================================
// Envio de promoções pelo comerciante aos clientes que o favoritaram
// (pedido do Abrão, 2026-08-23). Invoca a Edge Function
// send-merchant-promo — ver supabase/functions/send-merchant-promo/.
// ============================================================

export interface SendPromoInput {
  businessId: string;
  title: string;
  body: string;
  /** "limite da promoção": data até quando é válida (YYYY-MM-DD). */
  validUntil: string;
}

export interface SendPromoResult {
  recipients: number;
  success: number;
  failure: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  campos_em_falta: "Preenche o título, a mensagem e a validade da promoção.",
  texto_demasiado_longo: "Título ou mensagem demasiado longos — encurta um pouco.",
  nao_e_dono_deste_negocio: "Esta conta não é dona deste negócio.",
  limite_diario_atingido:
    "Só é possível enviar uma promoção a cada 24 horas. Tenta novamente amanhã.",
  internal_error: "Falha ao enviar. Tenta novamente daqui a pouco.",
};

export async function sendMerchantPromo(
  input: SendPromoInput,
): Promise<{ error: string | null; result?: SendPromoResult }> {
  if (!SUPABASE_CONFIGURED || !supabase) return { error: "Supabase não configurado." };
  try {
    const { data, error } = await supabase.functions.invoke("send-merchant-promo", {
      body: input,
    });
    if (error) {
      // A Edge Function devolve um corpo JSON com "error" mesmo em
      // respostas 4xx/5xx — o cliente supabase-js trata isso como
      // FunctionsHttpError, cujo .context é a própria Response. Tenta
      // ler o código de erro específico para mostrar uma mensagem
      // amigável em vez do genérico "Edge Function returned a non-2xx
      // status code".
      try {
        const body = await error.context?.json();
        if (body?.error && ERROR_MESSAGES[body.error]) {
          return { error: ERROR_MESSAGES[body.error] };
        }
      } catch {
        /* ignorado — cai para a mensagem genérica abaixo */
      }
      return { error: error.message };
    }
    if (data?.error) {
      return { error: ERROR_MESSAGES[data.error] ?? data.error };
    }
    return { error: null, result: data };
  } catch (err) {
    console.warn("sendMerchantPromo: falha ao invocar Edge Function.", err);
    return {
      error:
        "Falha ao contactar a função de envio. Confirma que a Edge Function 'send-merchant-promo' está publicada (ver SUPABASE_SETUP.sql, bloco v33).",
    };
  }
}

// Contagem de favoritos do negócio — mostrado no painel antes de enviar,
// para o comerciante saber a quantas pessoas vai chegar a promoção.
export async function fetchFavoritesCount(businessId: string): Promise<number> {
  if (!SUPABASE_CONFIGURED || !supabase) return 0;
  try {
    const { count, error } = await supabase
      .from("favorites")
      .select("user_id", { count: "exact", head: true })
      .eq("business_id", businessId);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export interface BusinessPromo {
  id: string;
  title: string;
  body: string;
  valid_until: string;
  recipients_count: number;
  success_count: number;
  created_at: string;
}

export async function fetchBusinessPromos(businessId: string): Promise<BusinessPromo[]> {
  if (!SUPABASE_CONFIGURED || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from("business_promos")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error || !data) return [];
    return data as BusinessPromo[];
  } catch {
    return [];
  }
}
