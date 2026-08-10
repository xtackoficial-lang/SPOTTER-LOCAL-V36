// ============================================================
// SPOTTER — Sistema de Avaliações (Reviews)
// Parte 3
// ============================================================

import { supabase, SUPABASE_CONFIGURED } from "./supabase";

export interface Review {
  id: string;
  businessId: string;
  authorId: string; // userId ou "anon-xxx"
  authorName: string;
  rating: number; // 1–5
  text: string;
  createdAt: string;
  verified: boolean; // comprador verificado
  helpful: number; // votos "útil"
  reported: boolean;
}

export interface ReviewStats {
  average: number;
  total: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>; // contagens de 1 a 5 estrelas
}

const LOCAL_KEY = "xlocal.reviews.v1";

function readAll(): Review[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function writeAll(data: Review[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    /* ignorado: falha de quota/acesso ao localStorage */
  }
}

// ── Gerar dados demo por negócio ─────────────────────────────
function demoReviews(businessId: string): Review[] {
  const NAMES = [
    "Ana Sitoe",
    "Pedro Mabunda",
    "Fátima Cossa",
    "João Nhanombe",
    "Maria Macuácua",
    "Carlos Muianga",
    "Sofia Tembe",
    "Rui Zunguza",
  ];
  const TEXTS = [
    "Excelente serviço, recomendo a toda a gente!",
    "Bom atendimento mas podia ser mais rápido.",
    "Produtos de qualidade. Preços justos para o que oferecem.",
    "Fiquei muito satisfeito. Já é a 3ª vez que compro aqui.",
    "O staff é muito simpático. Ambiente agradável.",
    "Boa localização. Fácil de encontrar no mapa.",
    "Qualidade consistente, nunca fui desapontado.",
    "Recomendo especialmente ao fim de semana.",
  ];
  return NAMES.slice(0, 5).map((name, i) => ({
    id: `demo-${businessId}-${i}`,
    businessId,
    authorId: `anon-${i}`,
    authorName: name,
    rating: [5, 4, 5, 3, 4][i],
    text: TEXTS[i % TEXTS.length],
    createdAt: new Date(Date.now() - (i + 1) * 7 * 86400000).toISOString(),
    verified: i % 2 === 0,
    helpful: Math.floor(Math.random() * 12),
    reported: false,
  }));
}

// Negócios de demonstração embutidos no app usam ids curtos (p1, p2…),
// nunca UUID — é o que os distingue de negócios reais cadastrados via
// Supabase (que usam gen_random_uuid()). Só os primeiros mostram reviews
// fabricadas; um negócio real sem reviews deve mostrar "ainda sem
// avaliações", nunca dados inventados.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isDemoBusinessId(businessId: string): boolean {
  return !UUID_RE.test(businessId);
}

// ── Obter reviews de um negócio ─────────────────────────────
export async function getBusinessReviews(businessId: string): Promise<Review[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    // Falha de rede/RLS aqui não pode travar a tela — cai para
    // os dados locais/demo em vez de deixar a promise rejeitar.
    try {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("business_id", businessId)
        .eq("reported", false)
        .order("created_at", { ascending: false })
        .limit(50);
      // "data" vazio mas sem erro = consulta válida, negócio real sem
      // reviews ainda. Antes, este caso caía no fallback mais abaixo e
      // mostrava reviews fabricadas para negócios reais — devolver [] já
      // aqui garante que a UI mostra "ainda sem avaliações" corretamente.
      if (!error && data) {
        return data.map((r) => ({
          id: r.id,
          businessId: r.business_id,
          authorId: r.author_id,
          authorName: r.author_name,
          rating: r.rating,
          text: r.text,
          createdAt: r.created_at,
          verified: r.verified ?? false,
          helpful: r.helpful ?? 0,
          reported: r.reported ?? false,
        }));
      }
    } catch (err) {
      console.warn("getBusinessReviews: Supabase indisponível, a usar dados locais.", err);
    }
  }
  const local = readAll().filter((r) => r.businessId === businessId && !r.reported);
  if (local.length > 0) return local;
  return isDemoBusinessId(businessId) ? demoReviews(businessId) : [];
}

// ── Calcular estatísticas ────────────────────────────────────
export function computeReviewStats(reviews: Review[]): ReviewStats {
  if (reviews.length === 0)
    return { average: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of reviews) {
    const k = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
    dist[k]++;
    sum += r.rating;
  }
  return {
    average: Math.round((sum / reviews.length) * 10) / 10,
    total: reviews.length,
    distribution: dist,
  };
}

// ── Submeter review ─────────────────────────────────────────
export async function submitReview(
  businessId: string,
  authorId: string,
  authorName: string,
  rating: number,
  text: string,
): Promise<Review> {
  const review: Review = {
    id: crypto.randomUUID(),
    businessId,
    authorId,
    authorName,
    rating: Math.min(5, Math.max(1, rating)),
    text: text.trim().slice(0, 500),
    createdAt: new Date().toISOString(),
    verified: false,
    helpful: 0,
    reported: false,
  };

  if (SUPABASE_CONFIGURED && supabase) {
    // Se o envio ao Supabase falhar (rede, RLS), a review continua a
    // ser gravada localmente — sem isto, submitReview rejeitava e o
    // botão "Enviar" em reviews.$id.tsx ficava preso em "A enviar…".
    try {
      await supabase.from("reviews").insert({
        id: review.id,
        business_id: review.businessId,
        author_id: review.authorId,
        author_name: review.authorName,
        rating: review.rating,
        text: review.text,
        created_at: review.createdAt,
      });
      // Actualizar média no negócio
      await supabase.rpc("update_business_rating", { p_business_id: businessId });
    } catch (err) {
      console.warn("submitReview: falha ao sincronizar com Supabase, guardado localmente.", err);
    }
  }

  const all = readAll();
  all.unshift(review);
  writeAll(all);
  return review;
}

// ── Marcar review como útil ──────────────────────────────────
export async function markHelpful(reviewId: string): Promise<void> {
  const all = readAll().map((r) => (r.id === reviewId ? { ...r, helpful: r.helpful + 1 } : r));
  writeAll(all);
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase.rpc("increment_helpful", { p_review_id: reviewId });
    } catch (err) {
      console.warn("markHelpful: falha ao sincronizar com Supabase.", err);
    }
  }
}

// ── Reportar review ──────────────────────────────────────────
export async function reportReview(reviewId: string): Promise<void> {
  const all = readAll().map((r) => (r.id === reviewId ? { ...r, reported: true } : r));
  writeAll(all);
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase.from("reviews").update({ reported: true }).eq("id", reviewId);
    } catch (err) {
      console.warn("reportReview: falha ao sincronizar com Supabase.", err);
    }
  }
}
