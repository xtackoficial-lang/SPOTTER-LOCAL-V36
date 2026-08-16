import { useEffect, useState } from "react";
import { useAuth } from "./auth-context";

const BASE_KEY = "xlocal.favorites";

// BUG CORRIGIDO (2026-08-15): a chave de favoritos era fixa ("xlocal.favorites.v1"),
// sem distinguir qual conta tinha sessão iniciada. Ao trocar de conta no mesmo
// dispositivo, os favoritos de uma conta continuavam visíveis na outra.
// Agora associa a chave ao ID do utilizador com sessão iniciada (useAuth).
export function useFavorites() {
  const { user } = useAuth();
  const userId = user?.id || "guest";
  const key = `${BASE_KEY}.${userId}.v1`;

  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      // Tenta ler a chave associada ao utilizador atual
      const stored = localStorage.getItem(key);
      if (stored) {
        setIds(JSON.parse(stored));
      } else if (userId === "guest") {
        // Fallback para legado se for visitante anónimo sem chave específica
        const legacy = localStorage.getItem("xlocal.favorites.v1");
        setIds(legacy ? JSON.parse(legacy) : []);
      } else {
        setIds([]);
      }
    } catch {
      /* ignorado: falha de quota/acesso ao localStorage */
      setIds([]);
    }
    setHydrated(true);
  }, [key, userId]);

  const toggle = (id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignorado: falha de quota/acesso ao localStorage */
      }
      return next;
    });
  };

  return { ids, hydrated, toggle, has: (id: string) => ids.includes(id) };
}

