export interface Place {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  icon: string;
  city: string;
  // Província (só Moçambique) e Bairro — ver mozambique-locations.ts.
  // Detalhe visual do endereço; quem decide se o negócio aparece ou não
  // para um utilizador é sempre a Província, nunca o bairro.
  province?: string;
  neighborhood?: string;
  country: string;
  address: string;
  rating: number;
  reviews: number;
  priceLevel: 1 | 2 | 3 | 4;
  distanceKm: number; // valor de referência/fallback quando não há coordenadas reais
  lat?: number; // coordenadas reais (Google Maps) — quando presentes, a
  lng?: number; // distância exibida é calculada a partir da posição do utilizador
  openNow: boolean;
  hours: string;
  phone: string;
  website?: string;
  description: string;
  tags: string[];
  cover: string;
  gallery?: string[];
  promo?: string;
  verified?: boolean; // selo de verificação — só negócios em plano Premium
  boosted?: boolean; // destaque temporário activo via "Turbinar negócio" (24h/7d/30d)
  isDigital?: boolean; // negócio online sem loja física — aparece só na aba "Online"
  // Estruturas & Temas de Perfil (ver src/lib/profile-styles.ts).
  structureId?: string;
  themeId?: string;
  backgroundId?: string;
  blockOrder?: string[];
  planId?: "free" | "starter" | "pro" | "premium";
}

// Antes usava links directos do Unsplash. Substituído por SVGs locais
// (data URI, poucos bytes cada) — nenhuma imagem do app depende de um
// link externo que pode mudar, expirar ou ficar indisponível. Não se
// importam aqui as imagens da galeria (profile-backgrounds-data.ts)
// porque este ficheiro é importado por home.tsx, search.tsx, etc. —
// um import estático traria de volta o problema, já corrigido, do
// bundle principal do app a ficar pesado para todos os utilizadores.
// COVERS só é usado dentro do array PLACES (comentado/vazio mais
// abaixo — ver decisão de 2026-06-27 de remover os negócios demo),
// por isso um placeholder simples é suficiente.
function placeholderCover(hue: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='100%' height='100%' fill='hsl(${hue},45%,30%)'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const COVERS = Array.from({ length: 12 }, (_, i) => placeholderCover((i * 360) / 12));

export const PLACES: Place[] = [];

// Os 26 negócios de demonstração que existiam aqui foram removidos a
// pedido do Abrão (varredura de 2026-06-28) — a Home/Busca passam a mostrar
// só negócios reais cadastrados via app. O conteúdo original fica
// comentado abaixo, sem código activo, só para referência/recuperação
// fácil caso seja útil mais tarde numa cidade nova ainda vazia.
/*
export const PLACES: Place[] = [
  {
    id: "p1",
    name: "Restaurante Mar Azul",
    category: "restaurant",
    categoryLabel: "Restaurante",
    icon: "restaurant",
    city: "Maputo",
    country: "Moçambique",
    address: "Av. Marginal, 1234",
    rating: 4.7,
    reviews: 312,
    priceLevel: 3,
    distanceKm: 0.8,
    openNow: true,
    hours: "11:00 – 23:00",
    phone: "+258 84 000 0001",
    description: "Cozinha de mariscos com vista para o mar. Pratos do dia e ambiente familiar.",
    tags: ["Marisco", "Família", "Vista mar"],
    cover: COVERS[0],
    promo: "−15% no almoço",
  },
  {
    id: "p2",
    name: "Café Sol Nascente",
    category: "restaurant",
    categoryLabel: "Café",
    icon: "cafe",
    city: "Maputo",
    country: "Moçambique",
    address: "Rua da Resistência, 88",
    rating: 4.5,
    reviews: 178,
    priceLevel: 1,
    distanceKm: 0.4,
    openNow: true,
    hours: "06:30 – 20:00",
    phone: "+258 84 000 0002",
    description: "Pequenos-almoços, tostas e bolos artesanais.",
    tags: ["Pequeno-almoço", "WiFi"],
    cover: COVERS[1],
  },
  {
    id: "p3",
    name: "Farmácia 24h Central",
    category: "pharmacy",
    categoryLabel: "Farmácia",
    icon: "pharmacy",
    city: "Maputo",
    country: "Moçambique",
    address: "Av. 25 de Setembro, 410",
    rating: 4.6,
    reviews: 92,
    priceLevel: 2,
    distanceKm: 1.1,
    openNow: true,
    hours: "Aberto 24h",
    phone: "+258 84 000 0003",
    description: "Serviço permanente, entrega ao domicílio.",
    tags: ["24h", "Entrega"],
    cover: COVERS[2],
  },
  {
    id: "p4",
    name: "Hotel Polana View",
    category: "hotel",
    categoryLabel: "Hotel",
    icon: "hotel",
    city: "Maputo",
    country: "Moçambique",
    address: "Av. Julius Nyerere, 1380",
    rating: 4.8,
    reviews: 540,
    priceLevel: 4,
    distanceKm: 2.3,
    openNow: true,
    hours: "Recepção 24h",
    phone: "+258 84 000 0004",
    description: "5 estrelas com piscina, spa e restaurante panorâmico.",
    tags: ["Piscina", "Spa", "WiFi"],
    cover: COVERS[3],
    promo: "2 noites = 3",
  },
  {
    id: "p5",
    name: "SuperMercado Bom Preço",
    category: "supermarket",
    categoryLabel: "Supermercado",
    icon: "supermarket",
    city: "Maputo",
    country: "Moçambique",
    address: "Av. Vladimir Lenine, 230",
    rating: 4.2,
    reviews: 88,
    priceLevel: 2,
    distanceKm: 0.9,
    openNow: true,
    hours: "07:00 – 22:00",
    phone: "+258 84 000 0005",
    description: "Mercearia, frescos, padaria e take-away.",
    tags: ["Padaria", "Take-away"],
    cover: COVERS[4],
  },
  {
    id: "p6",
    name: "Salão Beleza Real",
    category: "beauty_salon",
    categoryLabel: "Salão de beleza",
    icon: "beauty",
    city: "Maputo",
    country: "Moçambique",
    address: "Rua dos Lírios, 14",
    rating: 4.9,
    reviews: 210,
    priceLevel: 2,
    distanceKm: 1.6,
    openNow: false,
    hours: "09:00 – 19:00",
    phone: "+258 84 000 0006",
    description: "Manicure, pedicure, cabelo e maquilhagem.",
    tags: ["Manicure", "Maquilhagem"],
    cover: COVERS[5],
  },
  {
    id: "p7",
    name: "Barbearia O Mestre",
    category: "barber",
    categoryLabel: "Barbearia",
    icon: "barber",
    city: "Maputo",
    country: "Moçambique",
    address: "Av. Eduardo Mondlane, 502",
    rating: 4.7,
    reviews: 145,
    priceLevel: 1,
    distanceKm: 0.6,
    openNow: true,
    hours: "08:00 – 20:00",
    phone: "+258 84 000 0007",
    description: "Corte clássico e barba tradicional.",
    tags: ["Clássico"],
    cover: COVERS[6],
  },
  {
    id: "p8",
    name: "Bar Sunset Lounge",
    category: "bar",
    categoryLabel: "Bar",
    icon: "bar",
    city: "Maputo",
    country: "Moçambique",
    address: "Av. Marginal, 2200",
    rating: 4.4,
    reviews: 298,
    priceLevel: 3,
    distanceKm: 1.9,
    openNow: true,
    hours: "17:00 – 02:00",
    phone: "+258 84 000 0008",
    description: "Cocktails, música ao vivo aos fins-de-semana.",
    tags: ["Música ao vivo", "Cocktails"],
    cover: COVERS[7],
  },
  {
    id: "p9",
    name: "Clínica Saúde+",
    category: "clinic",
    categoryLabel: "Clínica",
    icon: "clinic",
    city: "Maputo",
    country: "Moçambique",
    address: "Rua das Flores, 77",
    rating: 4.6,
    reviews: 64,
    priceLevel: 3,
    distanceKm: 2.0,
    openNow: true,
    hours: "08:00 – 20:00",
    phone: "+258 84 000 0009",
    description: "Consultas gerais, pediatria, análises.",
    tags: ["Pediatria", "Análises"],
    cover: COVERS[8],
  },
  {
    id: "p10",
    name: "Ilha da Inhaca Tour",
    category: "tourism_site",
    categoryLabel: "Turismo",
    icon: "tourism",
    city: "Maputo",
    country: "Moçambique",
    address: "Marina de Maputo",
    rating: 4.9,
    reviews: 412,
    priceLevel: 3,
    distanceKm: 3.5,
    openNow: true,
    hours: "07:00 – 18:00",
    phone: "+258 84 000 0010",
    description: "Passeios de barco para a Ilha da Inhaca, snorkeling.",
    tags: ["Praia", "Snorkeling"],
    cover: COVERS[9],
    promo: "Grupos +20%",
  },
  {
    id: "p11",
    name: "Casa Vista Mar (Aluguer)",
    category: "rental",
    categoryLabel: "Casa de aluguer",
    icon: "rental",
    city: "Maputo",
    country: "Moçambique",
    address: "Bairro do Triunfo, 12",
    rating: 4.7,
    reviews: 33,
    priceLevel: 3,
    distanceKm: 4.2,
    openNow: true,
    hours: "Check-in 14:00",
    phone: "+258 84 000 0011",
    description: "T3 mobilado, vista para o oceano, piscina partilhada.",
    tags: ["T3", "Piscina"],
    cover: COVERS[10],
  },
  {
    id: "p12",
    name: "Pizzaria Bella Italia",
    category: "restaurant",
    categoryLabel: "Pizzaria",
    icon: "restaurant",
    city: "Maputo",
    country: "Moçambique",
    address: "Av. Mao Tse Tung, 660",
    rating: 4.6,
    reviews: 256,
    priceLevel: 2,
    distanceKm: 1.3,
    openNow: true,
    hours: "12:00 – 23:30",
    phone: "+258 84 000 0012",
    description: "Pizzas em forno a lenha, massa fresca.",
    tags: ["Forno lenha", "Take-away"],
    cover: COVERS[11],
    promo: "2x1 às terças",
  },
];
*/

export const CATEGORY_FILTERS = [
  { id: "all", label: "Tudo", icon: "sparkles" },
  { id: "online", label: "Online", icon: "delivery" },
  { id: "restaurant", label: "Comida", icon: "restaurant" },
  { id: "pharmacy", label: "Farmácia", icon: "pharmacy" },
  { id: "hotel", label: "Hotéis", icon: "hotel" },
  { id: "supermarket", label: "Mercado", icon: "supermarket" },
  { id: "beauty_salon", label: "Beleza", icon: "beauty" },
  { id: "bar", label: "Bar", icon: "bar" },
  { id: "clinic", label: "Saúde", icon: "clinic" },
  { id: "tourism_site", label: "Turismo", icon: "tourism" },
  { id: "rental", label: "Aluguer", icon: "rental" },
  { id: "barber", label: "Barbearia", icon: "barber" },
  { id: "transporter", label: "Transportadoras", icon: "transporter" },
  { id: "delivery", label: "Entregas", icon: "delivery" },
];

export function priceText(n: number) {
  return "$".repeat(n);
}
