// ============================================================
// XTACK SPOTTER — Mapa com pins (online + fallback)
// Usa Supabase para pins reais; fallback para dados locais
// ============================================================
import { fetchBusinesses, type BusinessDB } from "./businesses-db";

export interface MapPin {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  rating: number;
  openNow: boolean;
  phone: string;
  address: string;
  city: string;
}

// Coordenadas default por cidade moçambicana
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  maputo: { lat: -25.9655, lng: 32.5832 },
  inhambane: { lat: -23.8651, lng: 35.3833 },
  beira: { lat: -19.8436, lng: 34.8389 },
  nampula: { lat: -15.1165, lng: 39.2666 },
  pemba: { lat: -12.9645, lng: 40.5173 },
  tofo: { lat: -23.8601, lng: 35.5425 },
};

function randomOffset(base: number, range = 0.02) {
  return base + (Math.random() - 0.5) * range;
}

function businessToPin(b: BusinessDB): MapPin {
  const cityKey = b.city?.toLowerCase().replace(/\s/g, "") ?? "maputo";
  const coords = CITY_COORDS[cityKey] ?? CITY_COORDS["maputo"];
  return {
    id: b.id,
    name: b.business_name,
    category: b.category,
    lat: b.lat ?? randomOffset(coords.lat),
    lng: b.lng ?? randomOffset(coords.lng),
    rating: b.rating,
    // "Aberto agora" tem de reflectir o horário de funcionamento real do
    // negócio, não o estado da subscrição — antes, qualquer negócio com
    // conta "active" ou "trial" aparecia sempre como aberto no mapa,
    // mesmo às 3h da manhã.
    openNow: b.always_open || isWithinBusinessHours(b.hours_open, b.hours_close, b.open_days),
    phone: b.phone,
    address: b.address,
    city: b.city,
  };
}

// Mesma lógica de comparação de horário usada em businesses-db.ts —
// duplicada aqui (em vez de importada) para não criar uma dependência
// circular entre os dois módulos de leitura de negócios.
function isWithinBusinessHours(open: string, close: string, openDays?: number[]): boolean {
  if (!open || !close) return false;
  try {
    const now = new Date();
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

export async function fetchMapPins(city?: string): Promise<MapPin[]> {
  const businesses = await fetchBusinesses(city);
  return businesses.map(businessToPin);
}

export { CITY_COORDS };
