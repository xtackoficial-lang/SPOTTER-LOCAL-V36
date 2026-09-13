// ============================================================
// XTACK SPOTTER — Estruturas & Temas de Perfil do Comerciante
// ============================================================
// Permite que cada comerciante escolha como o seu perfil público é
// organizado (Estrutura) e a sua aparência (Tema), em vez de todos os
// negócios da mesma categoria ficarem visualmente idênticos.
//
// Os dois eixos são independentes:
//   - Estrutura: que blocos aparecem e em que ordem-base. O
//     comerciante pode depois reordenar os blocos dentro da estrutura
//     escolhida (ver `block_order` em businesses-db.ts).
//   - Tema: cor de destaque + fundo (com overlay/gradiente por cima
//     para o texto continuar legível). Inclui LED/Glow, disponível
//     para qualquer categoria — não só negócios online.
//
// As 17 categorias de negócio (BUSINESS_CATEGORIES em
// onboarding-storage.ts) agrupam-se em 5 "famílias": cada família tem
// o seu próprio conjunto de Estruturas, porque os blocos que fazem
// sentido para um Hotel (quartos) não são os mesmos que para uma Loja
// (catálogo) ou uma Clínica (serviços/marcação).
//
// Free = só as 2 primeiras estruturas de cada família (sem os blocos
// "avançados" — cardápio, quartos, catálogo completo — e sem
// multi-categoria). Planos pagos = as restantes estruturas da
// família, com esses blocos, e podem activar mais de uma categoria no
// mesmo negócio (ver hasMultiCategory em subscription-storage.ts).
// ============================================================

import { supabase, SUPABASE_CONFIGURED } from "./supabase";

export type FamilyId = "comida" | "alojamento" | "saude_servicos" | "loja" | "outros";

export const FAMILY_BY_CATEGORY: Record<string, FamilyId> = {
  restaurant: "comida",
  hotel_restaurant: "comida",
  bar: "comida",
  hotel: "alojamento",
  rental: "alojamento",
  pharmacy: "saude_servicos",
  clinic: "saude_servicos",
  auto_repair: "saude_servicos",
  car_wash: "saude_servicos",
  gym: "saude_servicos",
  bakery: "comida",
  hardware_store: "loja",
  beauty_salon: "saude_servicos",
  barber: "saude_servicos",
  supermarket: "loja",
  delivery: "loja",
  online_clothes: "loja",
  online_mobile: "loja",
  online_appliances: "loja",
  tourism_site: "outros",
  transporter: "outros",
  other: "outros",
};

export function familyForCategory(category: string): FamilyId {
  return FAMILY_BY_CATEGORY[category] ?? "outros";
}

// ── Blocos disponíveis ──────────────────────────────────────────
// Cada bloco é uma peça de UI renderizada por BlockRenderer.tsx.
// "advanced": true = só aparece em estruturas de planos pagos (o
// bloco mais "rico" de cada família: cardápio, quartos, catálogo...).
export type BlockId =
  | "cover"
  | "info"
  | "about"
  | "contactRow"
  | "routeBig"
  | "routeHero"
  | "reserve"
  | "menu" // cardápio (comida)
  | "rooms" // tipos de quarto (alojamento)
  | "services" // lista de serviços com preço (saúde/serviços pessoais)
  | "catalog" // catálogo de produtos (loja)
  | "itinerary" // pontos de interesse / roteiro (outros/turismo)
  | "gallery";

export const ADVANCED_BLOCKS: ReadonlySet<BlockId> = new Set([
  "menu",
  "rooms",
  "services",
  "catalog",
  "itinerary",
]);

export interface ProfileStructure {
  id: string;
  label: string;
  plan: "free" | "pago";
  blocks: BlockId[];
}

// ── Estruturas por família ──────────────────────────────────────
// Cada família tem 2 estruturas Free (sem bloco avançado) e 2 a 4
// estruturas pagas (com o bloco avançado da família). O comerciante só
// vê/escolhe as estruturas dentro do limite `maxStructures` do seu
// plano (ver subscription-storage.ts) — ver getAvailableStructures.
export const STRUCTURES_BY_FAMILY: Record<FamilyId, ProfileStructure[]> = {
  comida: [
    {
      id: "classica",
      label: "Clássica",
      plan: "free",
      blocks: ["cover", "info", "routeBig", "about", "contactRow", "reserve"],
    },
    {
      id: "foco_rota",
      label: "Foco na Rota",
      plan: "free",
      blocks: ["cover", "routeHero", "info", "about", "contactRow", "reserve"],
    },
    {
      id: "com_cardapio",
      label: "Com Cardápio",
      plan: "pago",
      blocks: ["cover", "info", "menu", "gallery", "about", "routeBig", "contactRow", "reserve"],
    },
    {
      id: "vitrine_fotos",
      label: "Vitrine de Fotos",
      plan: "pago",
      blocks: ["cover", "gallery", "info", "menu", "about", "contactRow", "routeBig", "reserve"],
    },
    {
      id: "reserva_primeiro",
      label: "Reserva em Destaque",
      plan: "pago",
      blocks: ["cover", "reserve", "info", "menu", "about", "contactRow", "routeBig"],
    },
    {
      id: "completa",
      label: "Completa",
      plan: "pago",
      blocks: ["cover", "info", "gallery", "menu", "about", "routeBig", "contactRow", "reserve"],
    },
  ],
  alojamento: [
    {
      id: "classica",
      label: "Clássica",
      plan: "free",
      blocks: ["cover", "info", "routeBig", "about", "contactRow", "reserve"],
    },
    {
      id: "foco_rota",
      label: "Foco na Rota",
      plan: "free",
      blocks: ["cover", "routeHero", "info", "about", "contactRow", "reserve"],
    },
    {
      id: "com_quartos",
      label: "Com Quartos",
      plan: "pago",
      blocks: ["cover", "info", "rooms", "gallery", "about", "routeBig", "contactRow", "reserve"],
    },
    {
      id: "vitrine_fotos",
      label: "Vitrine de Fotos",
      plan: "pago",
      blocks: ["cover", "gallery", "info", "rooms", "about", "contactRow", "routeBig", "reserve"],
    },
    {
      id: "reserva_primeiro",
      label: "Reserva em Destaque",
      plan: "pago",
      blocks: ["cover", "reserve", "info", "rooms", "about", "contactRow", "routeBig"],
    },
    {
      id: "completa",
      label: "Completa",
      plan: "pago",
      blocks: ["cover", "info", "gallery", "rooms", "about", "routeBig", "contactRow", "reserve"],
    },
  ],
  saude_servicos: [
    {
      id: "classica",
      label: "Clássica",
      plan: "free",
      blocks: ["cover", "info", "routeBig", "about", "contactRow", "reserve"],
    },
    {
      id: "foco_rota",
      label: "Foco na Rota",
      plan: "free",
      blocks: ["cover", "routeHero", "info", "about", "contactRow", "reserve"],
    },
    {
      id: "com_servicos",
      label: "Com Serviços e Preços",
      plan: "pago",
      blocks: [
        "cover",
        "info",
        "services",
        "gallery",
        "about",
        "routeBig",
        "contactRow",
        "reserve",
      ],
    },
    {
      id: "reserva_primeiro",
      label: "Marcação em Destaque",
      plan: "pago",
      blocks: ["cover", "reserve", "info", "services", "about", "contactRow", "routeBig"],
    },
  ],
  loja: [
    {
      id: "classica",
      label: "Clássica",
      plan: "free",
      blocks: ["cover", "info", "routeBig", "about", "contactRow", "reserve"],
    },
    {
      id: "foco_rota",
      label: "Foco na Rota",
      plan: "free",
      blocks: ["cover", "routeHero", "info", "about", "contactRow", "reserve"],
    },
    {
      id: "com_catalogo",
      label: "Com Catálogo",
      plan: "pago",
      blocks: ["cover", "info", "catalog", "gallery", "about", "contactRow", "reserve"],
    },
    {
      id: "vitrine_fotos",
      label: "Vitrine de Fotos",
      plan: "pago",
      blocks: ["cover", "gallery", "info", "catalog", "about", "contactRow", "reserve"],
    },
  ],
  outros: [
    {
      id: "classica",
      label: "Clássica",
      plan: "free",
      blocks: ["cover", "info", "routeBig", "about", "contactRow", "reserve"],
    },
    {
      id: "foco_rota",
      label: "Foco na Rota",
      plan: "free",
      blocks: ["cover", "routeHero", "info", "about", "contactRow", "reserve"],
    },
    {
      id: "com_roteiro",
      label: "Com Roteiro",
      plan: "pago",
      blocks: [
        "cover",
        "info",
        "itinerary",
        "gallery",
        "about",
        "routeBig",
        "contactRow",
        "reserve",
      ],
    },
  ],
};

export function getStructure(
  family: FamilyId,
  structureId: string,
  maxStructures?: number,
): ProfileStructure {
  const list = STRUCTURES_BY_FAMILY[family];
  const allowed = maxStructures != null ? list.slice(0, maxStructures) : list;
  // Se o structureId guardado não está entre as estruturas que o plano
  // actual permite (ex: negócio fez downgrade, ou o valor foi gravado
  // por outra via fora da UI normal), cai para a primeira estrutura
  // permitida em vez de mostrar uma estrutura paga a um plano Free.
  return allowed.find((s) => s.id === structureId) ?? allowed[0] ?? list[0];
}

// Estruturas que o comerciante pode efectivamente escolher, já
// cortadas ao limite do plano dele (ver maxStructures). A lista vem
// sempre na mesma ordem (Free primeiro), por isso cortar ao limite dá
// sempre as estruturas "certas" para cada plano.
export function getAvailableStructures(
  family: FamilyId,
  maxStructures: number,
): ProfileStructure[] {
  return STRUCTURES_BY_FAMILY[family].slice(0, maxStructures);
}

// ── Temas (cor) ────────────────────────────────────────────────
// Independentes de família/categoria — qualquer negócio pode escolher
// qualquer tema, incluindo LED/Glow (pedido explícito do Abrão: não é
// exclusivo de negócios online). A imagem de fundo é uma escolha
// SEPARADA do Tema — ver GalleryImage/BACKGROUND_GALLERY mais abaixo:
// o comerciante escolhe a cor (Tema) e, à parte, uma imagem da galeria
// partilhada (ou nenhuma, fundo só com cor).
export interface ProfileTheme {
  id: string;
  label: string;
  accent: string;
  accentSoft: string;
  bg: string;
  card: string;
  text: string;
  sub: string;
  border: string;
  glow: boolean;
  // "free" = disponível para aplicar em qualquer plano, incluindo Free.
  // "pago" = qualquer comerciante pode VER e pré-visualizar (é só cor,
  // não expõe dado nenhum), mas aplicar/gravar exige um plano pago —
  // ver checagem em saveVisual() (merchant.tsx). Decisão do Abrão
  // (2026-09-02): antes todos os 10 temas estavam livres para
  // qualquer plano, o que tirava o incentivo de upgrade.
  plan: "free" | "pago";
}

export const THEMES: Record<string, ProfileTheme> = {
  classico: {
    id: "classico",
    label: "Clássico XTACK",
    accent: "#D4A24C",
    accentSoft: "rgba(212,162,76,0.14)",
    bg: "#0E0D0C",
    card: "#171512",
    text: "#F4EFE6",
    sub: "#A89A86",
    border: "rgba(212,162,76,0.18)",
    glow: false,
    plan: "free",
  },
  oceano: {
    id: "oceano",
    label: "Oceano",
    accent: "#3FB6C9",
    accentSoft: "rgba(63,182,201,0.14)",
    bg: "#0A1416",
    card: "#0F1E21",
    text: "#E9F6F8",
    sub: "#7FA3A8",
    border: "rgba(63,182,201,0.2)",
    glow: false,
    plan: "free",
  },
  terracota: {
    id: "terracota",
    label: "Terracota",
    accent: "#E07A4C",
    accentSoft: "rgba(224,122,76,0.14)",
    bg: "#150E0B",
    card: "#1E1410",
    text: "#F6ECE3",
    sub: "#B79A87",
    border: "rgba(224,122,76,0.2)",
    glow: false,
    plan: "free",
  },
  led: {
    id: "led",
    label: "LED / Glow",
    accent: "#39FF8E",
    accentSoft: "rgba(57,255,142,0.12)",
    bg: "#050608",
    card: "#0B0D10",
    text: "#F2FFF6",
    sub: "#7FA98F",
    border: "rgba(57,255,142,0.35)",
    glow: true,
    plan: "pago",
  },
  // BUG DO ABRÃO (2026-08-30): "as cores para editar a conta comerciante
  // são limitadas" — só havia 4 temas. Adicionados mais 6, cobrindo
  // uma gama de cores mais ampla (azul, rosa/roxo, verde-floresta,
  // pôr-do-sol, monocromático, vinho), sem abrir um selector de cor
  // livre (isso arrisca combinações de baixo contraste/ilegíveis —
  // estes já vêm testados para leitura confortável).
  celeste: {
    id: "celeste",
    label: "Céu Azul",
    accent: "#4C8DE0",
    accentSoft: "rgba(76,141,224,0.14)",
    bg: "#0A1220",
    card: "#111B2E",
    text: "#EAF1FB",
    sub: "#8AA0C4",
    border: "rgba(76,141,224,0.2)",
    glow: false,
    plan: "pago",
  },
  orquidea: {
    id: "orquidea",
    label: "Orquídea",
    accent: "#C15FE0",
    accentSoft: "rgba(193,95,224,0.14)",
    bg: "#150B1C",
    card: "#1F1128",
    text: "#F5EBF8",
    sub: "#B295BE",
    border: "rgba(193,95,224,0.2)",
    glow: false,
    plan: "pago",
  },
  floresta: {
    id: "floresta",
    label: "Floresta",
    accent: "#4FA35C",
    accentSoft: "rgba(79,163,92,0.14)",
    bg: "#0A130C",
    card: "#101D12",
    text: "#EBF5EC",
    sub: "#8AA98F",
    border: "rgba(79,163,92,0.2)",
    glow: false,
    plan: "pago",
  },
  ocaso: {
    id: "ocaso",
    label: "Pôr-do-sol",
    accent: "#F0834E",
    accentSoft: "rgba(240,131,78,0.15)",
    bg: "#1A0E09",
    card: "#26140C",
    text: "#FBEDE3",
    sub: "#C4A08D",
    border: "rgba(240,131,78,0.22)",
    glow: false,
    plan: "pago",
  },
  monocromo: {
    id: "monocromo",
    label: "Monocromático",
    accent: "#D8D8D8",
    accentSoft: "rgba(216,216,216,0.12)",
    bg: "#0C0C0C",
    card: "#161616",
    text: "#F2F2F2",
    sub: "#9A9A9A",
    border: "rgba(255,255,255,0.14)",
    glow: false,
    plan: "pago",
  },
  vinho: {
    id: "vinho",
    label: "Vinho",
    accent: "#C8496A",
    accentSoft: "rgba(200,73,106,0.15)",
    bg: "#170A0D",
    card: "#221016",
    text: "#F8E9ED",
    sub: "#BB93A0",
    border: "rgba(200,73,106,0.22)",
    glow: false,
    plan: "pago",
  },
};

// planId opcional: quando passado, reforça o mesmo limite já aplicado na
// escrita (painel do comerciante) — defesa em profundidade, o mesmo
// padrão já usado por getStructure() acima. Sem isto, um theme_id "pago"
// gravado antes de um downgrade para Free (ou por qualquer via fora da
// UI normal) continuaria a aparecer normalmente na página pública.
export function getTheme(themeId?: string, planId?: "free" | "starter" | "pro" | "premium"): ProfileTheme {
  const theme = THEMES[themeId ?? "classico"] ?? THEMES.classico;
  if (planId === "free" && theme.plan === "pago") return THEMES.classico;
  return theme;
}

// ── Galeria de fundos (partilhada, sem restrição por categoria) ──
// Escolha SEPARADA do Tema (cor): o comerciante escolhe uma imagem
// pronta da galeria, ou nenhuma (fundo só com a cor do Tema, como era
// antes desta funcionalidade). Decisão explícita do Abrão (2026-06-28):
// uma ÚNICA galeria partilhada por todos os negócios, qualquer
// categoria — não há mais separação por família. As imagens são
// geridas pela XTACK; o comerciante nunca faz upload da própria.
//
// Decisão consciente sobre o peso: estas imagens (28, alta qualidade,
// ~8.3MB no total) NÃO são optimizadas para ligações lentas — pedido
// explícito do Abrão ("nao se preocupa com internet lenta"). Mesmo
// assim, continuam fora do ficheiro principal do app: vivem em
// profile-backgrounds-data.ts e só são carregadas via import()
// dinâmico dentro de getGalleryImageUrl(), quando alguém de facto
// precisa de uma imagem concreta. Isto não é sobre poupar dados ao
// cliente (decisão já tomada que não é prioridade) — é só para não
// obrigar TODOS os utilizadores a descarregar as 28 imagens só para
// abrir o ecrã de login, mesmo quem nunca chega a ver nenhuma.
export interface GalleryImage {
  id: string;
  label: string;
}

export const BACKGROUND_GALLERY: GalleryImage[] = [
  { id: "jantar_vista", label: "Jantar com vista" },
  { id: "churrasco_cascata", label: "Churrasco na natureza" },
  { id: "milho_grelhado", label: "Grelhados" },
  { id: "varanda_montanha", label: "Varanda com vista à montanha" },
  { id: "resort_praia", label: "Resort à beira-mar" },
  { id: "cavalos_pradaria", label: "Pradaria ao pôr-do-sol" },
  { id: "mar_rochas", label: "Mar e rochas" },
  { id: "especiarias_tigelas", label: "Especiarias em tigelas" },
  { id: "especiarias_pretas", label: "Especiarias e ervas" },
  { id: "limas_verdes", label: "Limas" },
  { id: "lareira_fogo", label: "Lareira" },
  { id: "palmeira_azul", label: "Palmeira (efeito azul)" },
  { id: "conchas_praia", label: "Conchas" },
  { id: "folha_gotas", label: "Folha com gotas de água" },
  { id: "cerejeira", label: "Cerejeira" },
  { id: "cao_gato", label: "Cão e gato" },
  { id: "wallpaper_abstrato", label: "Abstrato" },
  { id: "pintura_rostos", label: "Pintura — rostos" },
  { id: "pintura_mulher_vestido", label: "Pintura — mulher de vestido" },
  { id: "pintura_africana", label: "Pintura — dançarinas" },
  { id: "gelo_azul", label: "Gelo (efeito azul)" },
  { id: "fumo_abstrato", label: "Fumo abstrato" },
  { id: "flor_vermelha_gotas", label: "Flor vermelha com gotas" },
  { id: "frutas_variadas", label: "Frutas variadas" },
  { id: "placa_rua_maputo", label: "Rua em Maputo" },
  { id: "planeta_aneis_azul", label: "Planeta com anéis (efeito azul)" },
  { id: "massa_camarao_mar", label: "Massa com camarão, vista ao mar" },
  { id: "ilhas_tropicais_barcos", label: "Ilhas tropicais com barcos" },
];

export function getGalleryImageMeta(backgroundId?: string): GalleryImage | null {
  if (!backgroundId) return null;
  return BACKGROUND_GALLERY.find((b) => b.id === backgroundId) ?? null;
}

// Carrega a imagem em si (base64) sob demanda — ver explicação acima.
// Devolve null se o backgroundId não existir ou se o módulo de imagens
// não carregar por algum motivo (ex: rede lenta) — quem chama deve
// tratar isso como "sem imagem, usa só a cor do Tema", nunca como erro
// fatal de carregamento da página.
export async function getGalleryImageUrl(backgroundId?: string): Promise<string | null> {
  if (!backgroundId) return null;
  const meta = getGalleryImageMeta(backgroundId);
  if (!meta) return null;
  try {
    const mod = await import("./profile-backgrounds-data");
    return (mod as unknown as Record<string, string | undefined>)[backgroundId] ?? null;
  } catch (err) {
    console.warn("getGalleryImageUrl: falha ao carregar imagens de fundo.", err);
    return null;
  }
}

// Estilo do fundo da página: se houver uma imagem escolhida, fica fixa
// atrás de tudo (background-attachment: fixed — não rola junto com o
// conteúdo) com um gradiente escuro por cima, na cor do Tema, para o
// texto continuar legível em qualquer foto. Os blocos (botões,
// cardápio, contacto...) continuam a usar theme.card como fundo sólido
// próprio, por cima desta imagem — nunca ficam transparentes sobre a
// foto. Sem imagem escolhida, é só a cor sólida theme.bg, como era
// antes desta funcionalidade.
export function themeBackgroundStyle(
  theme: ProfileTheme,
  backgroundUrl?: string | null,
): Record<string, string> {
  if (!backgroundUrl) return { background: theme.bg };
  return {
    backgroundColor: theme.bg,
    backgroundImage: `linear-gradient(180deg, ${theme.bg}CC 0%, ${theme.bg}E6 55%, ${theme.bg} 100%), url(${backgroundUrl})`,
    backgroundSize: "cover",
    backgroundPosition: "center top",
    // BUG DO ABRÃO (2026-08-30): "as imagens seleccionadas não
    // funcionam". Causa: "background-attachment: fixed" é conhecido por
    // não funcionar de forma fiável em muitos navegadores/WebViews
    // Android — sobretudo em telemóveis mais simples/antigos, muito
    // comuns no mercado moçambicano. O comerciante escolhia e gravava a
    // imagem correctamente, mas ela simplesmente não aparecia no ecrã
    // dele, parecendo que a selecção "não funciona". "scroll" (o
    // comportamento por omissão) funciona em qualquer aparelho — só
    // perde o efeito de a imagem ficar "presa" enquanto a página rola,
    // que era só um efeito decorativo, não essencial.
    backgroundAttachment: "scroll",
    backgroundRepeat: "no-repeat",
  };
}

export const DEFAULT_STRUCTURE_ID = "classica";
export const DEFAULT_THEME_ID = "classico";

// ── Limite mensal de trocas (incluído no plano, não é compra avulsa) ──
// Lê directamente theme_swap_log no Supabase — sem cache local, para
// que o limite seja sempre o número real de trocas já feitas este mês,
// mesmo que o comerciante troque a partir de outro dispositivo.
export async function countSwapsThisMonth(businessId: string): Promise<number> {
  if (!SUPABASE_CONFIGURED || !supabase) return 0;
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  try {
    const { count, error } = await supabase
      .from("theme_swap_log")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", startOfMonth.toISOString());
    if (error) return 0;
    return count ?? 0;
  } catch (err) {
    console.warn("countSwapsThisMonth: Supabase indisponível.", err);
    return 0;
  }
}

// Regista a troca (para contar no limite mensal) E aplica a alteração
// na tabela businesses, nas mesmas duas escritas que já existiam para
// outros campos do perfil (ver upsertBusiness em businesses-db.ts) —
// esta função só cuida do registo do histórico; quem chama continua
// responsável por gravar structure_id/theme_id/block_order no
// businesses via upsertBusiness, exactamente como já faz hoje para
// hours_open, open_days, etc.
export async function recordThemeSwap(
  businessId: string,
  structureId: string,
  themeId: string,
): Promise<void> {
  if (!SUPABASE_CONFIGURED || !supabase) return;
  try {
    await supabase
      .from("theme_swap_log")
      .insert({ business_id: businessId, structure_id: structureId, theme_id: themeId });
  } catch (err) {
    console.warn("recordThemeSwap: Supabase indisponível, troca não foi registada.", err);
  }
}
