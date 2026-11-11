// ============================================================
// SPOTTER — Denunciar conteúdo (chat, posts, eventos)
// ------------------------------------------------------------
// Exigência da Google Play para apps com conteúdo de utilizadores.
// Grava na tabela content_reports (migração 016). Nunca lança erro:
// devolve o resultado para a UI mostrar a mensagem certa.
// ============================================================
import { supabase, SUPABASE_CONFIGURED } from "./supabase";

export type ReportKind = "message" | "post" | "event" | "review" | "business";
export type ReportResult = "sent" | "login" | "error";

export async function reportContent(
  kind: ReportKind,
  targetId: string,
  reason?: string,
): Promise<ReportResult> {
  if (!SUPABASE_CONFIGURED || !supabase) return "error";
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return "login";
    const { error } = await supabase.from("content_reports").insert({
      kind,
      target_id: String(targetId).slice(0, 80),
      reason: reason ? reason.slice(0, 300) : null,
    });
    // 23505 = já denunciaste este conteúdo → para ti conta como enviado.
    if (error && error.code !== "23505") {
      console.warn("reportContent: falha ao gravar.", error.message);
      return "error";
    }
    return "sent";
  } catch (err) {
    console.warn("reportContent: falha.", err);
    return "error";
  }
}
