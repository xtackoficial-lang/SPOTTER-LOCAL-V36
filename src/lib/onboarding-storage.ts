import { useEffect, useState } from "react";
import { supabase, SUPABASE_CONFIGURED } from "./supabase";
import { useAuth } from "./auth-context";

export type ProfileType = "personal" | "business" | null;

export interface PersonalProfile {
  language: string;
  country: string;
  // Província (só para Moçambique — ver mozambique-locations.ts). Nível
  // PRINCIPAL de correspondência com negócios na Home/Busca — ver
  // decisão do Abrão de 2026-07-07 (Beira/Sofala devem "bater certo").
  province?: string;
  city: string;
  visitorType: "tourist" | "local" | null;
  interests: string[];
  name?: string;
  email?: string;
}

export interface BusinessHours {
  open: string;
  close: string;
  alwaysOpen: boolean;
  // Dias da semana em que o negócio funciona. 0=Domingo..6=Sábado (mesma
  // convenção usada em WEEKDAY_LABELS e na Edge Function de notificações).
  // undefined/ausente = todos os dias (compatibilidade com negócios
  // criados antes deste campo existir).
  openDays?: number[];
}

export interface BusinessProfile {
  businessId: string; // ID estável e único do negócio — gerado uma vez, nunca derivado do nome
  language: string;
  country: string;
  // Província (só para Moçambique) — nível PRINCIPAL de correspondência
  // com clientes na Home/Busca (ver mozambique-locations.ts).
  province?: string;
  city: string;
  // Bairro — só detalhe visual no perfil público (endereço mais
  // preciso para o cliente reconhecer o local); NUNCA usado para
  // filtrar/decidir quem vê o negócio, só a Província decide isso.
  neighborhood?: string;
  businessName: string;
  category: string;
  customCategory?: string;
  hours: BusinessHours;
  description: string;
  tags?: string[];
  phone: string;
  ownerName: string;
  website: string;
  coverImage?: string;
  gallery: string[];
  email?: string;
  googleMapsLink?: string; // link/texto colado pelo comerciante (Google Maps)
  lat?: number; // extraído do googleMapsLink — usado para calcular distância real
  lng?: number;
  isDigital?: boolean; // negócio online, sem loja física — aparece só na aba "Online"
  // Estruturas & Temas de Perfil (ver src/lib/profile-styles.ts).
  structureId?: string;
  themeId?: string;
  backgroundId?: string;
  blockOrder?: string[];
}

export interface OnboardingDraft {
  profileType: ProfileType;
  step: number; // não usado — mantido por compatibilidade com drafts antigos
  lastStep?: string; // último passo visitado, para retomar ao recarregar a página
  authMethod?: "email" | "google" | "apple";
  personal: Partial<PersonalProfile>;
  business: Partial<BusinessProfile>;
  completed: boolean;
  verificationSubmittedAt?: string;
}

const DEFAULT_KEY = "xlocal.onboarding.v1";

function getStorageKey(userId?: string): string {
  return userId ? `xlocal.onboarding.${userId}.v1` : DEFAULT_KEY;
}

const empty: OnboardingDraft = {
  profileType: null,
  step: 0,
  personal: {},
  business: {
    hours: { open: "08:00", close: "18:00", alwaysOpen: false, openDays: [0, 1, 2, 3, 4, 5, 6] },
    gallery: [],
  },
  completed: false,
};

function read(userId?: string): OnboardingDraft {
  if (typeof window === "undefined") return empty;
  try {
    const key = getStorageKey(userId);
    let raw = window.localStorage.getItem(key);
    // Se a chave específica por utilizador ainda não existir, tenta ler da chave por omissão
    if (!raw && userId) {
      raw = window.localStorage.getItem(DEFAULT_KEY);
    }
    if (!raw) return empty;
    const parsed = { ...empty, ...JSON.parse(raw) };
    if (!parsed.business?.businessId) {
      parsed.business = { ...parsed.business, businessId: crypto.randomUUID() };
    }
    return parsed;
  } catch {
    return empty;
  }
}

function saveToStorage(draft: OnboardingDraft, userId?: string) {
  if (typeof window === "undefined") return;
  try {
    const key = getStorageKey(userId);
    window.localStorage.setItem(key, JSON.stringify(draft));
    if (userId) {
      window.localStorage.setItem(DEFAULT_KEY, JSON.stringify(draft));
    }
  } catch {
    // ignore
  }
}

async function checkSupabaseOnboarding(userId: string): Promise<OnboardingDraft | null> {
  if (!SUPABASE_CONFIGURED || !supabase) return null;
  try {
    const { data: biz } = await supabase
      .from("businesses")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();

    if (biz) {
      const draft: OnboardingDraft = {
        profileType: "business",
        step: 0,
        completed: true,
        personal: {},
        business: {
          businessId: biz.id,
          businessName: biz.business_name || "",
          ownerName: biz.owner_name || "",
          category: biz.category || "",
          province: biz.province || undefined,
          city: biz.city || "",
          neighborhood: biz.neighborhood || undefined,
          country: biz.country || "Moçambique",
          phone: biz.phone || "",
          description: biz.description || "",
          website: biz.website || "",
          coverImage: biz.cover_image || undefined,
          gallery: biz.gallery || [],
          hours: {
            open: biz.hours_open || "08:00",
            close: biz.hours_close || "18:00",
            alwaysOpen: Boolean(biz.always_open),
            openDays: biz.open_days ?? [0, 1, 2, 3, 4, 5, 6],
          },
          isDigital: Boolean(biz.is_digital),
          structureId: biz.structure_id,
          themeId: biz.theme_id,
          backgroundId: biz.background_id,
          blockOrder: biz.block_order,
        },
      };
      saveToStorage(draft, userId);
      return draft;
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (prof) {
      const pType = (prof.profile_type as ProfileType) || "personal";
      const draft: OnboardingDraft = {
        profileType: pType,
        step: 0,
        completed: true,
        personal: {
          name: prof.name || undefined,
          email: prof.email || undefined,
          province: prof.province || undefined,
          city: prof.city || "",
          country: prof.country || "Moçambique",
          interests: [],
        },
        business: {
          businessId: crypto.randomUUID(),
          hours: { open: "08:00", close: "18:00", alwaysOpen: false, openDays: [0, 1, 2, 3, 4, 5, 6] },
          gallery: [],
          businessName: "",
          category: "",
          city: "",
          country: "Moçambique",
          description: "",
          phone: "",
          ownerName: "",
          website: "",
        },
      };
      saveToStorage(draft, userId);
      return draft;
    }
  } catch (err) {
    console.warn("checkSupabaseOnboarding error:", err);
  }
  return null;
}

export function useOnboarding() {
  const { user } = useAuth();
  const [draft, setDraft] = useState<OnboardingDraft>(empty);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const initial = read(user?.id);
      if (initial.completed) {
        if (!cancelled) {
          setDraft(initial);
          setHydrated(true);
        }
        return;
      }
      if (user?.id && SUPABASE_CONFIGURED && supabase) {
        try {
          const synced = await checkSupabaseOnboarding(user.id);
          if (synced && !cancelled) {
            setDraft(synced);
            setHydrated(true);
            return;
          }
        } catch {
          // ignore
        }
      }
      if (!cancelled) {
        setDraft(initial);
        setHydrated(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const update = (patch: Partial<OnboardingDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      saveToStorage(next, user?.id);
      return next;
    });
  };

  const updatePersonal = (patch: Partial<PersonalProfile>) =>
    update({ personal: { ...draft.personal, ...patch } });

  const updateBusiness = (patch: Partial<BusinessProfile>) =>
    update({ business: { ...draft.business, ...patch } });

  const reset = () => {
    try {
      const key = getStorageKey(user?.id);
      window.localStorage.removeItem(key);
      window.localStorage.removeItem(DEFAULT_KEY);
    } catch {
      // ignore
    }
    setDraft(empty);
  };

  return { draft, hydrated, update, updatePersonal, updateBusiness, reset };
}

// Apenas os 4 idiomas que src/lib/i18n.ts realmente traduz (tipo Locale
// = "pt"|"en"|"es"|"fr"). Havia mais 4 aqui (it/de/zh/ar) que nunca
// tiveram traduções — escolhê-los não fazia nada (ficava tudo em
// português) e, se algum dia esta escolha fosse ligada ao selector de
// idioma real, causava um ecrã em branco (TRANSLATIONS[locale] não
// existe para esses códigos).
export const LANGUAGES = [
  { code: "pt", label: "Português", short: "PT" },
  { code: "en", label: "English", short: "EN" },
  { code: "es", label: "Español", short: "ES" },
  { code: "fr", label: "Français", short: "FR" },
];

export const COUNTRIES = [
  "Moçambique",
  "Portugal",
  "Brasil",
  "Angola",
  "Cabo Verde",
  "Guiné-Bissau",
  "São Tomé e Príncipe",
  "Timor-Leste",
  "África do Sul",
  "Espanha",
  "França",
  "Reino Unido",
  "Estados Unidos",
  "Itália",
  "Alemanha",
  "China",
  "Japão",
  "Índia",
  "México",
  "Argentina",
  "Chile",
  "Canadá",
  "Austrália",
  "Outro",
];

export const INTERESTS = [
  { id: "food", label: "Comida", icon: "food" },
  { id: "health", label: "Saúde", icon: "health" },
  { id: "leisure", label: "Lazer", icon: "leisure" },
  { id: "hotels", label: "Hotéis", icon: "hotels" },
  { id: "shopping", label: "Compras", icon: "shopping" },
  { id: "beauty", label: "Beleza", icon: "beauty" },
  { id: "nightlife", label: "Vida noturna", icon: "nightlife" },
  { id: "tourism", label: "Turismo", icon: "tourism" },
  { id: "transport", label: "Transporte", icon: "transport" },
  { id: "services", label: "Serviços", icon: "services" },
];

export const BUSINESS_CATEGORIES = [
  { id: "restaurant", label: "Restaurante", icon: "restaurant" },
  { id: "hotel", label: "Hotel", icon: "hotel" },
  { id: "hotel_restaurant", label: "Hotel + Restaurante", icon: "hotel_restaurant" },
  { id: "rental", label: "Casa de aluguer", icon: "rental" },
  { id: "pharmacy", label: "Farmácia", icon: "pharmacy" },
  { id: "clinic", label: "Clínica", icon: "clinic" },
  { id: "supermarket", label: "Supermercado", icon: "supermarket" },
  { id: "beauty_salon", label: "Salão de beleza", icon: "beauty" },
  { id: "barber", label: "Barbearia", icon: "barber" },
  { id: "bar", label: "Bar", icon: "bar" },
  { id: "tourism_site", label: "Sítios turísticos", icon: "tourism" },
  { id: "transporter", label: "Transportadora / Viagens", icon: "transporter" },
  { id: "delivery", label: "Entregas / Compras online", icon: "delivery" },
  { id: "online_clothes", label: "Roupas (online)", icon: "online_clothes" },
  { id: "online_mobile", label: "Aparelhos móveis", icon: "online_mobile" },
  { id: "online_appliances", label: "Eletrodomésticos", icon: "online_appliances" },
  { id: "other", label: "Outro", icon: "other" },
];
