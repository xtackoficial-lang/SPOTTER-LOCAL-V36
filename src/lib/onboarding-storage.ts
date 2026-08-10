import { useEffect, useState } from "react";

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

const KEY = "xlocal.onboarding.v1";

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

function read(): OnboardingDraft {
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = { ...empty, ...JSON.parse(raw) };
    // Garante um businessId estável mesmo para drafts antigos criados antes
    // desta correcção (que não tinham o campo). Gerado uma única vez e
    // nunca derivado do nome do negócio, para não se perder ao editar o nome.
    if (!parsed.business?.businessId) {
      parsed.business = { ...parsed.business, businessId: crypto.randomUUID() };
    }
    return parsed;
  } catch {
    return empty;
  }
}

export function useOnboarding() {
  const [draft, setDraft] = useState<OnboardingDraft>(empty);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDraft(read());
    setHydrated(true);
  }, []);

  const update = (patch: Partial<OnboardingDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const updatePersonal = (patch: Partial<PersonalProfile>) =>
    update({ personal: { ...draft.personal, ...patch } });

  const updateBusiness = (patch: Partial<BusinessProfile>) =>
    update({ business: { ...draft.business, ...patch } });

  const reset = () => {
    try {
      window.localStorage.removeItem(KEY);
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
