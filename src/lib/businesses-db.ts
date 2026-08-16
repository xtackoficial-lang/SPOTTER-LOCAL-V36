// ============================================================
// XTACK SPOTTER — Negócios online (Supabase) com fallback local
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { supabase, SUPABASE_CONFIGURED } from "./supabase";
import { PLACES, type Place } from "./places-data";
import { BUSINESS_CATEGORIES } from "./onboarding-storage";
import { getPlanById } from "./subscription-storage";
import { provinceForCity } from "./mozambique-locations";

// Capa por omissão quando o negócio ainda não definiu cover_image —
// SVG local (poucos bytes), nunca um link externo: um link pode
// mudar, expirar ou ficar indisponível, e a capa de um negócio real
// nunca deve depender disso.
const DEFAULT_COVER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='100%' height='100%' fill='hsl(28,30%,22%)'/></svg>",
)}`;

export interface BusinessDB {
  id: string;
  owner_id?: string;
  business_name: string;
  // BUG CORRIGIDO (auditoria 2026-07-08): faltava aqui, mesmo já sendo
  // lido pelo painel de admin (admin-storage.ts) — o Nome do Dono
  // preenchido pelo comerciante nunca chegava ao Supabase, ficando
  // sempre em branco no painel de admin (inclui o link de WhatsApp de
  // suporte, que usa este nome para saudar o comerciante).
  owner_name?: string;
  category: string;
  city: string;
  // Província (só Moçambique — ver mozambique-locations.ts). Nível
  // PRINCIPAL de correspondência com clientes na Home/Busca — ver
  // fetchBusinesses(). "city" e "neighborhood" continuam a existir só
  // como detalhe visual no perfil, nunca decidem quem vê o negócio.
  province?: string;
  neighborhood?: string; // bairro — detalhe de endereço, não filtra nada
  country: string;
  address: string;
  phone: string;
  description: string;
  // Palavras-chave curtas para a Busca encontrar o negócio por assunto
  // (ex: "marisco", "wifi") — além do nome e categoria. Descoberto na
  // auditoria de 2026-07-08 que este campo já era usado na Busca mas
  // não existia forma de o preencher; ficava sempre vazio.
  tags?: string[];
  website?: string;
  cover_image?: string;
  gallery?: string[];
  always_open: boolean;
  hours_open: string;
  hours_close: string;
  // Dias da semana em que o negócio funciona. 0=Domingo..6=Sábado.
  // undefined/ausente = todos os dias (negócios criados antes deste
  // campo existir, ou que nunca tocaram no seletor).
  open_days?: number[];
  verified: boolean;
  plan_id: "free" | "starter" | "pro" | "premium";
  plan_status: "active" | "trial" | "overdue" | "blocked";
  plan_renews_at?: string;
  lat?: number;
  lng?: number;
  is_digital?: boolean; // negócio online sem loja física
  // Estruturas & Temas de Perfil (ver src/lib/profile-styles.ts).
  // Ausentes/undefined = "classica" + "classico", reproduzindo
  // exactamente o layout fixo que existia antes desta funcionalidade.
  structure_id?: string;
  theme_id?: string;
  background_id?: string;
  block_order?: string[];
  rating: number;
  reviews_count: number;
  created_at: string;
}

// Converter Place local → BusinessDB para fallback
// Os negócios de demonstração (PLACES) ficam todos no plano "pro" por
// omissão — nenhum aparece com selo de verificação, porque o selo é
// exclusivo do plano Premium. Isto evita inconsistência entre o que o
// utilizador vê na app (todos demo "verificados") e a regra real de
// negócio (verified requer plan_id === "premium" + conta activa).
function placeToBusinessDB(p: Place): BusinessDB {
  return {
    id: p.id,
    business_name: p.name,
    category: p.category,
    city: p.city,
    country: p.country,
    address: p.address,
    phone: p.phone,
    description: p.description,
    cover_image: p.cover,
    always_open: p.openNow,
    hours_open: "08:00",
    hours_close: "22:00",
    verified: false,
    plan_id: "pro",
    plan_status: "active",
    lat: p.lat,
    lng: p.lng,
    rating: p.rating,
    reviews_count: p.reviews,
    created_at: new Date().toISOString(),
  };
}

// Converter BusinessDB (negócio real, criado por um comerciante) → Place,
// para que home.tsx, search.tsx, PlaceCard, chat e reviews — que já sabem
// trabalhar com Place — possam mostrar negócios reais sem precisar de
// reescrever cada tela. Negócios sem plano activo/trial não passam por
// aqui (já filtrado em fetchBusinesses).
export function businessToPlace(b: BusinessDB): Place {
  const catInfo = BUSINESS_CATEGORIES.find((c) => c.id === b.category);
  const hoursText = b.always_open ? "Aberto 24h" : `${b.hours_open} – ${b.hours_close}`;
  // O selo só é mostrado se a flag "verified" estiver activa E o negócio
  // estiver realmente no plano Premium com a conta activa. Isto evita que
  // um negócio fique "verificado" para sempre depois de ter feito downgrade
  // ou ficado em atraso/bloqueado.
  const isVerified = b.verified && b.plan_id === "premium" && b.plan_status === "active";
  // Se o negócio fez downgrade (ex: Starter → Free) e tinha mais fotos do
  // que o plano actual permite, essas fotos extra ficam guardadas na BD
  // mas ocultas aqui — reaparecem automaticamente se voltar a fazer
  // upgrade, sem precisar de as carregar de novo.
  const galleryLimit = getPlanById(b.plan_id).galleryLimit;
  const visibleGallery = b.gallery?.slice(0, galleryLimit);
  return {
    id: b.id,
    name: b.business_name,
    category: b.category,
    categoryLabel: catInfo?.label ?? "Negócio",
    icon: catInfo?.icon ?? "store",
    city: b.city,
    province: b.province,
    neighborhood: b.neighborhood,
    country: b.country,
    address: b.address,
    rating: b.rating || 0,
    reviews: b.reviews_count || 0,
    priceLevel: 2,
    distanceKm: b.lat != null && b.lng != null ? 0 : Infinity, // Infinity → vai para o fim da lista; recalculado quando há GPS do utilizador
    lat: b.lat,
    lng: b.lng,
    openNow: b.always_open || isWithinHours(b.hours_open, b.hours_close, b.open_days),
    hours: hoursText,
    phone: b.phone,
    website: b.website || undefined,
    description: b.description || "",
    tags: b.tags ?? [],
    cover: b.cover_image || DEFAULT_COVER_SVG,
    gallery: visibleGallery && visibleGallery.length > 0 ? visibleGallery : undefined,
    verified: isVerified,
    isDigital: b.is_digital || false,
    structureId: b.structure_id,
    themeId: b.theme_id,
    backgroundId: b.background_id,
    blockOrder: b.block_order,
    planId: b.plan_id,
  };
}

function isWithinHours(open: string, close: string, openDays?: number[]): boolean {
  try {
    const now = new Date();
    // Sem lista de dias guardada (negócios criados antes deste campo
    // existir) = funciona todos os dias, mantém o comportamento anterior.
    if (openDays && openDays.length > 0 && !openDays.includes(now.getDay())) {
      return false;
    }
    const [oh, om] = open.split(":").map(Number);
    const [ch, cm] = close.split(":").map(Number);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const openMin = oh * 60 + (om || 0);
    const closeMin = ch * 60 + (cm || 0);
    if (closeMin > openMin) return nowMin >= openMin && nowMin <= closeMin;
    return nowMin >= openMin || nowMin <= closeMin; // atravessa a meia-noite
  } catch {
    return true;
  }
}

// ---------- Listar negócios activos (descoberta/home/busca) ----------
// Combina negócios reais do Supabase com os de demonstração — nunca
// substitui completamente os exemplos, para a app não ficar "vazia"
// só porque um único comerciante real se cadastrou numa cidade.
// Os negócios reais aparecem primeiro (mais relevantes/recentes).
export interface LocationFilter {
  province?: string;
  city?: string;
}

// BUG CORRIGIDO (2026-07-07): antes filtrava só por texto de cidade
// (ilike), o que fazia "Chimoio" e "Manica" não baterem certo mesmo
// sendo a mesma província. Decisão do Abrão: a Província passa a ser
// o critério PRINCIPAL — filtra-se sempre em memória (não no SQL),
// porque negócios criados antes desta funcionalidade existir não têm
// a coluna "province" preenchida; para esses, cai-se para descobrir a
// província a partir da cidade já gravada (provinceForCity), e só em
// último caso volta ao antigo texto de cidade — assim nenhum negócio
// já publicado fica invisível por causa desta mudança.
function matchesLocation(b: BusinessDB, location?: LocationFilter): boolean {
  if (!location || (!location.province && !location.city)) return true;
  const { province, city } = location;
  if (province) {
    if (b.province) return b.province === province;
    const inferred = provinceForCity(b.city);
    if (inferred) return inferred === province;
    // Negócio sem província gravada e cidade não reconhecida (dado
    // antigo, ou fora de Moçambique) — mantém o comportamento antigo
    // de comparação de texto como último recurso, para não desaparecer.
    return city ? b.city.toLowerCase().includes(city.toLowerCase()) : false;
  }
  return city ? b.city.toLowerCase().includes(city.toLowerCase()) : true;
}

export async function fetchBusinesses(location?: string | LocationFilter): Promise<BusinessDB[]> {
  // Aceita tanto uma string simples (compatibilidade com chamadas
  // antigas, ex: fetchMapPins) como {province, city}.
  const loc: LocationFilter | undefined =
    typeof location === "string" ? { city: location } : location;
  let real: BusinessDB[] = [];
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      // Filtragem por localização já não é feita aqui em SQL — ver
      // matchesLocation() e o comentário acima.
      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .in("plan_status", ["active", "trial"])
        .order("rating", { ascending: false });
      if (!error && data) real = data as BusinessDB[];
    } catch (err) {
      console.warn("fetchBusinesses: Supabase indisponível, a usar apenas dados locais.", err);
    }
  }
  const demo = PLACES.map(placeToBusinessDB);
  return [...real, ...demo].filter((b) => matchesLocation(b, loc));
}

// ---------- Buscar negócio por ID ----------
export async function fetchBusinessById(id: string): Promise<BusinessDB | null> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase.from("businesses").select("*").eq("id", id).single();
      if (!error && data) return data as BusinessDB;
    } catch (err) {
      console.warn("fetchBusinessById: Supabase indisponível, a usar dados locais.", err);
    }
  }
  const place = PLACES.find((p) => p.id === id);
  return place ? placeToBusinessDB(place) : null;
}

// ---------- Criar/actualizar negócio ----------
export async function upsertBusiness(
  business: Partial<BusinessDB> & { id?: string; owner_id: string },
): Promise<BusinessDB | null> {
  if (SUPABASE_CONFIGURED && supabase) {
    // BUG CORRIGIDO (2026-08-15): antes, se o Supabase devolvesse um erro
    // (ex: RLS, constraint, tipo de dado inválido), a função fazia
    // `if (!error && data) return data` e depois caía silenciosamente
    // para `return null` — sem lançar excepção. O chamador (saveProfile
    // em merchant.tsx) não verificava esse null e mostrava sempre
    // "Guardado!" mesmo quando a gravação tinha falhado de facto.
    // Agora lança o erro do Supabase para que o chamador o possa tratar.
    const { data, error } = await supabase
      .from("businesses")
      .upsert({ ...business, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return data as BusinessDB;
  }
  return null;
}

// ---------- Produtos online ----------
export interface ProductDB {
  id: string;
  business_id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  image_url?: string;
  available: boolean;
  created_at: string;
  updated_at?: string;
}

export async function fetchProducts(businessId: string): Promise<ProductDB[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (!error && data) return data as ProductDB[];
    } catch (err) {
      console.warn("fetchProducts: Supabase indisponível, a usar dados locais.", err);
    }
  }
  // fallback localStorage
  try {
    const raw = localStorage.getItem("xlocal.products.v1");
    const all: Array<Record<string, unknown> & { businessId?: string }> = raw
      ? JSON.parse(raw)
      : [];
    return all
      .filter((p) => p.businessId === businessId)
      .map((p) => ({
        ...p,
        business_id: p.businessId,
      })) as unknown as ProductDB[];
  } catch {
    return [];
  }
}

export async function upsertProduct(
  product: Omit<ProductDB, "id" | "created_at"> & { id?: string },
): Promise<ProductDB | null> {
  if (SUPABASE_CONFIGURED && supabase) {
    // BUG CORRIGIDO (2026-08-15): mesmo padrão que upsertBusiness —
    // erros do Supabase ({data: null, error: {...}}) eram engolidos e
    // devolvidos como null. syncProductRemote() chamava isto e só fazia
    // .catch(), nunca verificava null — produtos podiam não chegar ao
    // servidor sem qualquer aviso. Agora lança o erro.
    const { data, error } = await supabase
      .from("products")
      .upsert({ ...product, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return data as ProductDB;
  }
  return null;
}

export async function deleteProduct(id: string): Promise<void> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase.from("products").delete().eq("id", id);
    } catch (err) {
      console.warn("deleteProduct: Supabase indisponível.", err);
    }
  }
}

// ---------- Hook: lugares para descoberta (Home / Busca) ----------
// Junta negócios reais (Supabase) com os de demonstração, já convertidos
// para o formato Place que home.tsx, search.tsx, PlaceCard, chat e
// reviews já sabem usar. Nunca trava: em caso de falha de rede, cai
// silenciosamente para os dados de demonstração.
export function useDiscoverPlaces(location?: string | LocationFilter) {
  const [places, setPlaces] = useState<Place[]>(() => PLACES);
  const [loading, setLoading] = useState(true);
  // Chave estável para o array de dependências do useEffect abaixo —
  // um objecto {province, city} literal muda de referência a cada
  // render, o que faria o efeito correr infinitamente.
  const locKey =
    typeof location === "string" ? location : `${location?.province ?? ""}|${location?.city ?? ""}`;

  const reload = useCallback(() => {
    setLoading(true);
    fetchBusinesses(location)
      .then((list) => setPlaces(list.map(businessToPlace)))
      .catch((err) => {
        console.warn("useDiscoverPlaces: falha ao carregar negócios, a manter dados locais.", err);
        setPlaces(PLACES);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { places, loading, reload };
}
