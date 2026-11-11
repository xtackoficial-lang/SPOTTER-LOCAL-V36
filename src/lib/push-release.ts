// Solta os tokens de notificações da conta com sessão aberta (chamar ANTES do
// signOut, enquanto a regra do Supabase ainda deixa apagar as linhas dela).
// Ficheiro à parte para auth.ts não importar push-storage (que importa auth.ts).
import { supabase, SUPABASE_CONFIGURED } from "./supabase";

export async function releasePushTokensOfCurrentUser(): Promise<void> {
  if (!SUPABASE_CONFIGURED || !supabase) return;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return;
  await Promise.race([
    supabase.from("push_tokens").delete().eq("user_id", uid),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
}
