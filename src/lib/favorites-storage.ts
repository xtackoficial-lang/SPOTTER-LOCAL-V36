import { useEffect, useState } from "react";
import { supabase, SUPABASE_CONFIGURED } from "./supabase";
import { useAuth } from "./auth-context";

const KEY = "xlocal.favorites.v1";

// BUG/LACUNA DO ABRÃO (2026-08-23): até agora, os favoritos viviam SÓ no
// localStorage de cada telemóvel — nunca chegavam ao Supabase. Isso
// tornava impossível um comerciante saber quem o favoritou, e portanto
// impossível mandar-lhes uma notificação de promoção (pedido novo). Este
// ficheiro passa a sincronizar com a tabela public.favorites (ver bloco
// v33 em SUPABASE_SETUP.sql) sempre que há sessão iniciada — mantendo o
// localStorage como resposta imediata (o coração enche na hora, mesmo
// sem esperar pela rede) e como modo convidado (sem conta = só local,
// como era antes).
export function useFavorites() {
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    try {
      setIds(JSON.parse(localStorage.getItem(KEY) || "[]"));
    } catch {
      /* ignorado: falha de quota/acesso ao localStorage */
    }
    setHydrated(true);
  }, []);

  // Ao iniciar sessão, busca os favoritos guardados no Supabase e junta-os
  // aos locais (nunca substitui — soma, para não perder favoritos feitos
  // como convidado antes de criar conta).
  useEffect(() => {
    if (!user || !SUPABASE_CONFIGURED || !supabase) return;
    let cancelled = false;
    supabase
      .from("favorites")
      .select("business_id")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setIds((prev) => {
          const remoteIds = data.map((r) => r.business_id as string);
          const merged = Array.from(new Set([...prev, ...remoteIds]));
          try {
            localStorage.setItem(KEY, JSON.stringify(merged));
          } catch {
            /* ignorado */
          }
          return merged;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggle = (id: string) => {
    setIds((prev) => {
      const isRemoving = prev.includes(id);
      const next = isRemoving ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignorado: falha de quota/acesso ao localStorage */
      }
      // Sincronização em segundo plano — best-effort. Se falhar (sem
      // internet, etc.), o favorito já está guardado localmente e volta
      // a tentar sincronizar da próxima vez que a lista carregar; não
      // vale a pena interromper o cliente com um erro por causa disto.
      if (user && SUPABASE_CONFIGURED && supabase) {
        const query = isRemoving
          ? supabase.from("favorites").delete().eq("user_id", user.id).eq("business_id", id)
          : supabase.from("favorites").upsert({ user_id: user.id, business_id: id });
        query.then(({ error }) => {
          if (error) console.warn("favorites: falha ao sincronizar com Supabase.", error);
        });
      }
      return next;
    });
  };

  return { ids, hydrated, toggle, has: (id: string) => ids.includes(id) };
}
