import { useEffect, useState } from "react";
const KEY = "xlocal.favorites.v1";

export function useFavorites() {
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      setIds(JSON.parse(localStorage.getItem(KEY) || "[]"));
    } catch {
      /* ignorado: falha de quota/acesso ao localStorage */
    }
    setHydrated(true);
  }, []);
  const toggle = (id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignorado: falha de quota/acesso ao localStorage */
      }
      return next;
    });
  };
  return { ids, hydrated, toggle, has: (id: string) => ids.includes(id) };
}
