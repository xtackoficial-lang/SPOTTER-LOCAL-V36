// ============================================================
// XTACK SPOTTER — Geolocalização
// Extrai coordenadas de links/texto do Google Maps e calcula
// distância real entre dois pontos (fórmula de Haversine).
// ============================================================
import { OpenLocationCode } from "open-location-code";

const olc = new OpenLocationCode();

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Extrai latitude/longitude de um link ou texto colado do Google Maps.
 * Versão SÍNCRONA — cobre os formatos que já vêm com coordenadas no
 * próprio texto. Para links curtos (maps.app.goo.gl) usa
 * resolveLocationInput() em vez desta função.
 *  - https://www.google.com/maps/place/.../@-25.9655,32.5832,15z/...
 *  - https://www.google.com/maps?q=-25.9655,32.5832
 *  - Texto solto "-25.9655, 32.5832"
 */
export function extractCoordinatesFromGoogleMaps(input: string): Coordinates | null {
  const text = input.trim();
  if (!text) return null;

  // 1. Formato !3dlat!4dlng — coordenada EXACTA do pin/marcador "place"
  // seleccionado. Verificado antes do padrão "@" porque um link de
  // "place" específico do Google Maps costuma conter os dois ao mesmo
  // tempo: "@" é só a posição da câmara/viewport no momento em que o
  // link foi copiado (pode estar deslocada se o utilizador moveu ou fez
  // zoom no mapa antes de partilhar), enquanto "!3d!4d" é sempre o ponto
  // exacto do negócio. Sem esta ordem, negócios apareciam ligeiramente
  // fora do sítio certo no mapa sempre que o comerciante tivesse
  // movido o mapa antes de copiar o link.
  const bangMatch = text.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  if (bangMatch) {
    return clampValid(parseFloat(bangMatch[1]), parseFloat(bangMatch[2]));
  }

  // 2. Formato @lat,lng,zoom (link de "place" do Google Maps, sem !3d!4d)
  const atMatch = text.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    return clampValid(parseFloat(atMatch[1]), parseFloat(atMatch[2]));
  }

  // 3. Formato ?q=lat,lng ou &q=lat,lng
  const qMatch = text.match(/[?&]q=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (qMatch) {
    return clampValid(parseFloat(qMatch[1]), parseFloat(qMatch[2]));
  }

  // 4. Texto solto "lat, lng" ou "lat,lng" colado directamente
  const plainMatch = text.match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (plainMatch) {
    return clampValid(parseFloat(plainMatch[1]), parseFloat(plainMatch[2]));
  }

  return null;
}

/**
 * Extrai um Plus Code (Open Location Code) de dentro de texto livre,
 * ex: "3C72+J2J, Bairro Nhampossa, Inhambane 1301" → "3C72+J2J".
 * O alfabeto do Plus Code exclui vogais e 0/1 para evitar confusão
 * visual, por isso o regex só usa os caracteres válidos da norma.
 */
function extractPlusCode(input: string): string | null {
  const match = input.match(/\b([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})\b/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Decodifica um Plus Code para coordenadas. Códigos "completos" (com
 * prefixo de área, ex: "5G8Q3C72+J2J") não precisam de referência.
 * Códigos "curtos" (ex: "3C72+J2J", o formato mais comum que o Google
 * Maps/WhatsApp partilha por omissão) só têm sentido perto de um ponto
 * de referência — sem ele, o mesmo código repete-se em vários locais
 * do globo a cada ~100km. Por isso referenceCoords (normalmente o
 * centro da província já escolhida no onboarding) é fortemente
 * recomendado para códigos curtos.
 */
function decodePlusCode(code: string, referenceCoords?: Coordinates): Coordinates | null {
  try {
    if (!olc.isValid(code)) return null;
    let fullCode = code;
    if (olc.isShort(code)) {
      if (!referenceCoords) return null; // sem referência, resultado não é fiável
      fullCode = olc.recoverNearest(code, referenceCoords.lat, referenceCoords.lng);
    }
    const decoded = olc.decode(fullCode);
    return clampValid(decoded.latitudeCenter, decoded.longitudeCenter);
  } catch {
    return null;
  }
}

/** Domínios de link curto do Google Maps que precisam de ser resolvidos
 * via rede antes de termos coordenadas. */
const SHORT_LINK_PATTERN = /https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\/\S+/i;

/**
 * Versão completa (assíncrona) de extração de coordenadas — tenta tudo:
 * 1. Coordenadas directas no texto (formatos @, !3d!4d, ?q=, soltas)
 * 2. Plus Code (com referenceCoords se for um código curto)
 * 3. Link curto do Google Maps (maps.app.goo.gl) — resolvido seguindo
 *    o redirect via fetch, já que o link em si não contém coordenadas
 * Usar esta função (não a síncrona) em qualquer campo onde o
 * comerciante possa colar um link curto ou um Plus Code.
 */
export async function resolveLocationInput(
  input: string,
  referenceCoords?: Coordinates,
): Promise<Coordinates | null> {
  const text = input.trim();
  if (!text) return null;

  const direct = extractCoordinatesFromGoogleMaps(text);
  if (direct) return direct;

  const plusCode = extractPlusCode(text);
  if (plusCode) {
    const fromPlusCode = decodePlusCode(plusCode, referenceCoords);
    if (fromPlusCode) return fromPlusCode;
  }

  const shortLinkMatch = text.match(SHORT_LINK_PATTERN);
  if (shortLinkMatch) {
    const resolved = await resolveShortLink(shortLinkMatch[0]);
    if (resolved) return resolved;
  }

  return null;
}

/**
 * Segue o redirect de um link curto do Google Maps (maps.app.goo.gl)
 * para chegar à URL completa, que já tem as coordenadas no texto.
 * Nunca lança — devolve null em qualquer falha de rede/CORS, para o
 * chamador poder cair de volta ao link manual/GPS.
 */
async function resolveShortLink(shortUrl: string): Promise<Coordinates | null> {
  try {
    const res = await fetch(shortUrl, { method: "GET", redirect: "follow", mode: "cors" });
    // Se o browser seguiu o redirect, res.url já é a URL longa final.
    if (res.url && res.url !== shortUrl) {
      const fromUrl = extractCoordinatesFromGoogleMaps(res.url);
      if (fromUrl) return fromUrl;
    }
    // Alguns servidores devolvem o link longo no corpo (meta refresh /
    // JS redirect) em vez de um 3xx que o fetch segue sozinho.
    const body = await res.text();
    const bodyUrlMatch = body.match(/https:\/\/www\.google\.com\/maps\/[^\s"'<>]+/);
    if (bodyUrlMatch) {
      return extractCoordinatesFromGoogleMaps(bodyUrlMatch[0]);
    }
    return null;
  } catch {
    // Falha típica: CORS bloqueado no browser para este domínio. Sem
    // um proxy/Edge Function dedicado não há forma de contornar isto
    // no cliente — devolve null e deixa o chamador orientar o
    // comerciante a usar o link longo ou o botão de GPS.
    return null;
  }
}

function clampValid(lat: number, lng: number): Coordinates | null {
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Distância em quilómetros entre dois pontos GPS (fórmula de Haversine).
 */
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const R = 6371; // raio médio da Terra em km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Obtém a localização actual do utilizador via API do navegador.
 * Pede permissão ao utilizador (igual a qualquer app de mapas).
 * Nunca lança — em caso de recusa, erro ou timeout devolve null,
 * para que o app caia de volta ao comportamento sem distância real
 * em vez de travar a tela à espera de uma permissão.
 */
export function getUserLocation(timeoutMs = 8000): Promise<Coordinates | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60 * 1000 },
    );
  });
}

/**
 * Formata a distância para exibição: metros se < 1km, senão km com 1 decimal.
 * Se km === Infinity (negócio sem GPS), devolve string vazia para não mostrar nada.
 */
export function formatDistance(km: number): string {
  if (!isFinite(km) || km < 0) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
