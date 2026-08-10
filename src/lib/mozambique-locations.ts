// ============================================================
// XTACK SPOTTER — Hierarquia Província → Cidade (Moçambique)
// ------------------------------------------------------------
// Decisão do Abrão (2026-07-07): em vez de um único campo de texto
// livre "Cidade/Província" (frágil — "Beira" e "Sofala" não batiam
// certo um com o outro), a Província passa a ser o nível PRINCIPAL de
// correspondência entre cliente e comerciante. Cidade é só detalhe:
// toda cidade "pertence" a uma província (ver CITIES_BY_PROVINCE), por
// isso escolher "Beira" (cidade) ou "Sofala" (província) já é entendido
// como a mesma área para efeitos de descoberta — ver provinceForCity().
//
// Cobertura: só Moçambique tem esta lista curada (é o mercado real da
// XTACK). Para os outros países da lista COUNTRIES (Portugal, Brasil,
// Angola, Cabo Verde...), mantém-se o campo de texto livre como estava
// antes — sem dados de província para esses países, forçar o mesmo
// formulário seria pior do que o texto livre actual.
// ============================================================

export const PROVINCES_MZ = [
  "Maputo Cidade",
  "Maputo Província",
  "Gaza",
  "Inhambane",
  "Sofala",
  "Manica",
  "Tete",
  "Zambézia",
  "Nampula",
  "Cabo Delgado",
  "Niassa",
] as const;

export type ProvinceMZ = (typeof PROVINCES_MZ)[number];

// v26 — Coordenadas aproximadas do centro/capital de cada província.
// Usadas como ponto de referência para recuperar Plus Codes curtos
// (ex: "3C72+J2J") colados pelo comerciante — um Plus Code curto sem
// contexto pode decodificar para o lado errado do globo; com a
// província já escolhida no passo anterior do onboarding, a referência
// fica sempre correcta dentro de Moçambique. Ver geo-utils.ts.
export const PROVINCE_CENTER_MZ: Record<ProvinceMZ, { lat: number; lng: number }> = {
  "Maputo Cidade": { lat: -25.9655, lng: 32.5832 },
  "Maputo Província": { lat: -25.4, lng: 32.7 },
  Gaza: { lat: -24.3, lng: 33.6 },
  Inhambane: { lat: -23.865, lng: 35.383 },
  Sofala: { lat: -19.843, lng: 34.838 },
  Manica: { lat: -19.116, lng: 33.483 },
  Tete: { lat: -16.156, lng: 33.586 },
  Zambézia: { lat: -17.874, lng: 36.888 },
  Nampula: { lat: -15.116, lng: 39.267 },
  "Cabo Delgado": { lat: -12.966, lng: 40.55 },
  Niassa: { lat: -13.3, lng: 35.25 },
};

// Cidades/distritos principais de cada província — lista prática (não
// exaustiva) com os nomes mais procurados. "Outra" é sempre a última
// opção em qualquer província, para quem estiver numa vila mais
// pequena que não consta aqui poder continuar (fica só a Província a
// contar para a correspondência, sem bloquear o cadastro).
export const CITIES_BY_PROVINCE: Record<ProvinceMZ, string[]> = {
  "Maputo Cidade": ["Maputo"],
  "Maputo Província": ["Matola", "Boane", "Namaacha", "Marracuene", "Manhiça", "Moamba", "Magude"],
  Gaza: ["Xai-Xai", "Chókwè", "Bilene", "Manjacaze", "Chibuto", "Massingir"],
  Inhambane: [
    "Inhambane",
    "Maxixe",
    "Vilankulo",
    "Tofo",
    "Massinga",
    "Morrumbene",
    "Zavala",
    "Jangamo",
  ],
  Sofala: ["Beira", "Dondo", "Nhamatanda", "Gorongosa", "Marromeu", "Búzi"],
  Manica: ["Chimoio", "Gondola", "Manica", "Sussundenga", "Catandica", "Guro"],
  Tete: ["Tete", "Moatize", "Angónia", "Cahora Bassa", "Changara", "Marávia"],
  Zambézia: ["Quelimane", "Mocuba", "Gurué", "Milange", "Alto Molócuè", "Morrumbala"],
  Nampula: ["Nampula", "Nacala", "Ilha de Moçambique", "Angoche", "Monapo", "Ribáuè"],
  "Cabo Delgado": ["Pemba", "Montepuez", "Mocímboa da Praia", "Palma", "Mueda", "Chiúre"],
  Niassa: ["Lichinga", "Cuamba", "Mandimba", "Marrupa", "Mecanhelas"],
};

export function citiesForProvince(province?: string): string[] {
  if (!province) return [];
  return CITIES_BY_PROVINCE[province as ProvinceMZ] ?? [];
}

// Descobre a que província pertence uma cidade — usado para o antigo
// campo "city" (texto livre, gravado antes desta funcionalidade
// existir) continuar a aparecer correctamente na busca por província.
export function provinceForCity(city?: string): ProvinceMZ | undefined {
  if (!city) return undefined;
  const normalised = city.trim().toLowerCase();
  for (const province of PROVINCES_MZ) {
    if (CITIES_BY_PROVINCE[province].some((c) => c.toLowerCase() === normalised)) {
      return province;
    }
  }
  return undefined;
}
