// ============================================================
// XTACK SPOTTER — Edge Function: delete-own-account
// ------------------------------------------------------------
// Pedido do Abrão (2026-09-09): "após criar a conta não aceita apagar
// porquê se o dono decidir?" — a app não tinha NENHUMA forma de apagar
// a própria conta. A razão é de segurança, não descuido: apagar um
// utilizador do Supabase Auth a sério (auth.admin.deleteUser) só é
// possível com a service_role key — e essa key NUNCA pode viver no
// browser, porque dá acesso total e sem restrições (ignora RLS) a toda
// a base de dados. Por isso isto tem de correr aqui, no servidor.
//
// O que esta função faz, por esta ordem, só depois de confirmar que
// quem pediu é mesmo o dono da conta (pelo próprio token JWT, nunca
// por um ID enviado no corpo do pedido):
//   1. Apaga o(s) negócio(s) do utilizador (businesses) — em cascata
//      isto já leva consigo products, payment_proofs, boosts, e também
//      as reviews QUE ESSE NEGÓCIO RECEBEU (reviews.business_id é
//      "on delete cascade" — ver SUPABASE_SETUP.sql). As reviews que
//      esta pessoa escreveu sobre OUTROS negócios também desaparecem
//      no passo 3 (reviews.author_id também é cascade) — é o Supabase
//      a tratar disto sozinho, não algo que este código faça à mão.
//   2. Apaga a linha em profiles.
//   3. Apaga a conta em auth.users — a partir daqui a pessoa deixa de
//      conseguir iniciar sessão, mesmo que tente com a mesma password.
//
// Variáveis de ambiente necessárias (Supabase → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//   (as três já existem por omissão em qualquer projecto Supabase)
//
// Chamada a partir da app (ver lib/auth-context.ts, deleteOwnAccount):
//   supabase.functions.invoke("delete-own-account")
//   — não precisa de enviar nada no corpo; usa a sessão actual.
// ============================================================

// @ts-nocheck — ambiente Deno (Supabase Edge Functions), tipos diferentes do projecto Vite/React.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Identifica o dono a partir do PRÓPRIO token da sessão (Authorization
// header) — nunca a partir de um ID enviado no corpo do pedido, que
// qualquer pessoa poderia forjar para apagar a conta de outra pessoa.
async function getCallerId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

Deno.serve(async (req: Request) => {
  try {
    const userId = await getCallerId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Negócio(s) do utilizador — cascata trata do resto (produtos,
    //    comprovativos, boosts, e as reviews que este negócio recebeu
    //    também desaparecem, porque reviews.business_id é
    //    "on delete cascade").
    const { error: bizError } = await admin.from("businesses").delete().eq("owner_id", userId);
    if (bizError) throw bizError;

    // 2. Linha de perfil pessoal.
    const { error: profileError } = await admin.from("profiles").delete().eq("id", userId);
    if (profileError) throw profileError;

    // 3. A conta em si — a partir daqui o login deixa de funcionar.
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) throw authError;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("delete-own-account: erro", err); // fica só no log do Supabase
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
