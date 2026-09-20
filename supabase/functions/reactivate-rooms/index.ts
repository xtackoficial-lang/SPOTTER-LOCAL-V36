// ============================================================
// XTACK SPOTTER — Edge Function: reactivate-rooms
// ------------------------------------------------------------
// Corre no servidor (Deno runtime do Supabase), invocada por um cron job
// (pg_cron, 1x/dia) — mesmo padrão de run-billing-engine. Responsabilidade
// única: procurar quartos com occupied_until < hoje e limpar esse campo,
// para o quarto voltar a aparecer "Disponível" sem o comerciante ter de
// fazer nada manualmente.
//
// Variáveis de ambiente necessárias:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (já existem por omissão)
//   FUNCTION_SECRET — mesmo secret usado por run-billing-engine e
//                      send-scheduled-notifications
// ============================================================

// @ts-nocheck — ambiente Deno (Supabase Edge Functions).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTION_SECRET = Deno.env.get("FUNCTION_SECRET")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function isAuthorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (token === FUNCTION_SECRET) return true;
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error } = await userClient.auth.getUser();
    if (error || !userData?.user) return false;
    const { data: adminRow } = await supabase
      .from("admins")
      .select("id")
      .eq("id", userData.user.id)
      .maybeSingle();
    return !!adminRow;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  try {
    if (!(await isAuthorized(req))) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    const { data: reactivated, error } = await supabase
      .from("business_rooms")
      .update({ occupied_until: null })
      .lt("occupied_until", today)
      .select("id, name, business_id");

    if (error) throw error;

    return new Response(
      JSON.stringify({ processed: reactivated?.length ?? 0, rooms: reactivated ?? [] }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("reactivate-rooms: erro", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
