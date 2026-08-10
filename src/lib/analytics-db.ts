// ============================================================
// SPOTTER — Analytics por comerciante
// Parte 3 — Estatísticas de visitas, produtos, conversões
// ============================================================

import { supabase, SUPABASE_CONFIGURED } from "./supabase";

export interface DailyAnalytic {
  date: string; // YYYY-MM-DD
  businessId: string;
  views: number; // visitas ao perfil
  clicks: number; // cliques em produto/rota
  messages: number; // mensagens recebidas
  mapPins: number; // cliques no pin do mapa
  calls: number; // cliques em "ligar" (tel:)
}

export interface AnalyticsSummary {
  totalViews: number;
  totalClicks: number;
  totalMessages: number;
  totalMapPins: number;
  totalCalls: number;
  trend: "up" | "down" | "stable";
  trendPct: number;
  topDays: DailyAnalytic[];
  last30: DailyAnalytic[];
  // Contagem apenas do dia de hoje — é o que o painel do comerciante
  // mostra nos cartões "Visualizações hoje" / "Cliques na rota" / "Chamadas".
  today: DailyAnalytic;
}

const LOCAL_KEY = "xlocal.analytics.v1";

// Mesmo critério usado em reviews-db.ts: negócios de demonstração
// embutidos no app usam ids curtos (p1, p2…), nunca UUID — é o que os
// distingue de negócios reais cadastrados via Supabase (que usam
// gen_random_uuid()).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isDemoBusinessId(businessId: string): boolean {
  return !UUID_RE.test(businessId);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function readAll(): DailyAnalytic[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function writeAll(data: DailyAnalytic[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    /* ignorado: falha de quota/acesso ao localStorage */
  }
}

// ── Registar evento ──────────────────────────────────────────
export function trackEvent(
  businessId: string,
  type: "view" | "click" | "message" | "mapPin" | "call",
) {
  const today = todayStr();
  const all = readAll();
  const idx = all.findIndex((d) => d.businessId === businessId && d.date === today);
  if (idx >= 0) {
    const rec = { ...all[idx] };
    if (type === "view") rec.views++;
    if (type === "click") rec.clicks++;
    if (type === "message") rec.messages++;
    if (type === "mapPin") rec.mapPins++;
    if (type === "call") rec.calls++;
    all[idx] = rec;
  } else {
    all.push({
      date: today,
      businessId,
      views: type === "view" ? 1 : 0,
      clicks: type === "click" ? 1 : 0,
      messages: type === "message" ? 1 : 0,
      mapPins: type === "mapPin" ? 1 : 0,
      calls: type === "call" ? 1 : 0,
    });
  }
  writeAll(all);

  // Enviar ao Supabase de forma assíncrona (best-effort)
  if (SUPABASE_CONFIGURED && supabase) {
    supabase
      .rpc("increment_analytic", {
        p_business_id: businessId,
        p_date: today,
        p_type: type,
      })
      .then(
        () => {},
        () => {},
      );
  }
}

// ── Obter resumo de analytics ────────────────────────────────
export async function getAnalyticsSummary(businessId: string): Promise<AnalyticsSummary> {
  let data: DailyAnalytic[] = [];
  let queriedSupabaseSuccessfully = false;

  if (SUPABASE_CONFIGURED && supabase) {
    // Falha de rede ou de RLS aqui não pode travar a tela — cai para
    // os dados locais/demo em vez de deixar a promise rejeitar.
    try {
      const { data: rows, error } = await supabase
        .from("analytics")
        .select("*")
        .eq("business_id", businessId)
        .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
        .order("date", { ascending: false });

      if (!error) {
        queriedSupabaseSuccessfully = true;
        if (rows && rows.length > 0) {
          data = rows.map((r) => ({
            date: r.date,
            businessId: r.business_id,
            views: r.views ?? 0,
            clicks: r.clicks ?? 0,
            messages: r.messages ?? 0,
            mapPins: r.map_pins ?? 0,
            calls: r.calls ?? 0,
          }));
        }
      }
    } catch (err) {
      console.warn("getAnalyticsSummary: Supabase indisponível, a usar dados locais.", err);
    }
  }

  if (data.length === 0) {
    data = readAll().filter((d) => d.businessId === businessId);
  }

  // Gera demo apenas quando NENHUMA fonte real respondeu (Supabase não
  // configurado/indisponível) E o negócio é um dos exemplos embutidos —
  // nunca para um negócio real (UUID) que a consulta ao Supabase já
  // confirmou existir mas ainda sem analytics: nesse caso o resumo deve
  // mostrar zeros reais, não inventar visitas/cliques que nunca aconteceram.
  if (data.length === 0 && !queriedSupabaseSuccessfully && isDemoBusinessId(businessId)) {
    data = generateDemoAnalytics(businessId);
  }

  const last30 = data.slice(0, 30);
  const firstHalf = last30.slice(15);
  const secondHalf = last30.slice(0, 15);

  const sumViews = (arr: DailyAnalytic[]) => arr.reduce((a, b) => a + b.views, 0);
  const h1v = sumViews(firstHalf);
  const h2v = sumViews(secondHalf);
  const trendPct = h1v > 0 ? Math.round(((h2v - h1v) / h1v) * 100) : 0;

  const today = todayStr();
  const todayRec = last30.find((d) => d.date === today) ?? {
    date: today,
    businessId,
    views: 0,
    clicks: 0,
    messages: 0,
    mapPins: 0,
    calls: 0,
  };

  return {
    totalViews: last30.reduce((a, b) => a + b.views, 0),
    totalClicks: last30.reduce((a, b) => a + b.clicks, 0),
    totalMessages: last30.reduce((a, b) => a + b.messages, 0),
    totalMapPins: last30.reduce((a, b) => a + b.mapPins, 0),
    totalCalls: last30.reduce((a, b) => a + b.calls, 0),
    trend: trendPct > 5 ? "up" : trendPct < -5 ? "down" : "stable",
    trendPct: Math.abs(trendPct),
    topDays: [...last30].sort((a, b) => b.views - a.views).slice(0, 5),
    last30,
    today: todayRec,
  };
}

// ── Dados demo (7 dias com valores realistas) ────────────────
function generateDemoAnalytics(businessId: string): DailyAnalytic[] {
  const result: DailyAnalytic[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dow = d.getDay(); // 0=Dom, 6=Sab
    const isWeekend = dow === 0 || dow === 6;
    result.push({
      date: d.toISOString().slice(0, 10),
      businessId,
      views: Math.floor(Math.random() * (isWeekend ? 60 : 30)) + (isWeekend ? 20 : 5),
      clicks: Math.floor(Math.random() * (isWeekend ? 25 : 12)) + 2,
      messages: Math.floor(Math.random() * 5),
      mapPins: Math.floor(Math.random() * (isWeekend ? 15 : 8)),
      calls: Math.floor(Math.random() * (isWeekend ? 8 : 4)),
    });
  }
  return result;
}
