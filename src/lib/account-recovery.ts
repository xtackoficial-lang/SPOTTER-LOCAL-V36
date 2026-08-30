// ============================================================
// XTACK SPOTTER — Recuperação de conta a partir do Supabase
// ============================================================
// PROBLEMA (2026-08-18): "draft.completed" e "draft.profileType" (ver
// onboarding-storage.ts) vivem só no localStorage deste navegador/
// dispositivo. Isso funciona bem para quem nunca saiu da conta, mas
// quebra sempre que:
//   - a pessoa entra noutro dispositivo (ex: telemóvel novo, ou site
//     depois de já ter usado o APK),
//   - o cache/localStorage é limpo,
//   - a pessoa faz logout e entra de novo,
//   - o navegador é diferente (ex: Chrome vs o WebView do APK).
// Nesses casos a app assumia sempre "conta nova" e mandava directo para
// o onboarding, obrigando comerciantes e utilizadores pessoais a
// recomeçar TODO o cadastro do zero — mesmo já tendo negócio/perfil
// guardado no Supabase.
//
// Este hook centraliza a correcção: antes de decidir "é preciso
// onboarding", verifica-se primeiro se já existe negócio (comerciante)
// ou perfil pessoal completo ligado à conta autenticada. Usado tanto em
// routes/home.tsx como em components/RequireBusiness.tsx — antes cada um
// tinha a sua própria checagem local, e só home.tsx tinha sido corrigida,
// deixando /business, /merchant, /products, /analytics, /boost,
// /subscribe, /payment, /business-inbox, /business.orders,
// /business.coupons e /qr-business ainda vulneráveis ao mesmo bug
// quando acedidos directamente (atalho, favorito, ou reabertura do
// APK numa dessas páginas em vez de /home).
import { useEffect, useState } from "react";
import { useOnboarding } from "./onboarding-storage";
import { useAuth } from "./auth-context";
import { fetchProfile } from "./auth";
import { fetchBusinessByOwner } from "./businesses-db";

export type RecoveryStatus = "checking" | "done";

export function useAccountRecovery() {
  const { draft, hydrated, update, updateBusiness, updatePersonal, ensureOwner } = useOnboarding();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    // Espera o draft local E a sessão de autenticação resolverem antes de
    // decidir qualquer coisa — decidir cedo demais é o que causava o
    // "flash" para o onboarding mesmo em contas válidas.
    if (!hydrated || authLoading) return;
    // BUG DO ABRÃO (2026-08-19): antes de olhar para draft.completed,
    // confirma que o rascunho pertence mesmo a esta conta. Sem isto, um
    // rascunho incompleto deixado por outra conta neste aparelho (ex:
    // negócio a meio do cadastro, nunca terminado) aparecia para a
    // conta seguinte que entrasse — dava a sensação de "apareceu o
    // cadastro da conta antiga".
    if (user && ensureOwner(user.id)) return; // draft foi limpo; reavalia no próximo render
    if (draft.completed) {
      setStatus("done");
      return;
    }
    if (attempted) return;
    // Convidado sem conta: nada para recuperar no Supabase.
    if (!user) {
      setAttempted(true);
      setStatus("done");
      return;
    }
    setAttempted(true);
    (async () => {
      try {
        const business = await fetchBusinessByOwner(user.id);
        if (business) {
          updateBusiness({
            businessId: business.id,
            businessName: business.business_name,
            category: business.category,
            city: business.city,
            province: business.province,
            neighborhood: business.neighborhood,
            country: business.country,
            phone: business.phone,
            ownerName: business.owner_name,
            website: business.website,
            description: business.description,
            coverImage: business.cover_image,
            gallery: business.gallery ?? [],
            hours: {
              open: business.hours_open ?? "08:00",
              close: business.hours_close ?? "18:00",
              alwaysOpen: business.always_open ?? false,
            },
          });
          update({ profileType: "business", completed: true });
          return;
        }
        const profile = await fetchProfile(user.id);
        if (profile) {
          updatePersonal({
            name: profile.name,
            province: profile.province,
            city: profile.city,
            country: profile.country,
            interests: profile.favorite_category ? [profile.favorite_category] : [],
          });
          update({ profileType: "personal", completed: true });
          return;
        }
        // Nada encontrado: é mesmo conta nova, segue para onboarding normal.
      } finally {
        setStatus("done");
      }
    })();
  }, [hydrated, authLoading, draft.completed, user, attempted, update, updateBusiness, updatePersonal, ensureOwner]);

  return {
    draft,
    hydrated,
    // "pronto para decidir" = já sabemos se há (ou não) conta a recuperar.
    ready: hydrated && !authLoading && status === "done",
  };
}
