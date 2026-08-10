// ============================================================
// XTACK SPOTTER — Hook global de notificação por proximidade (v18)
// Junta favoritos do utilizador com os negócios carregados e
// activa o watch de proximidade enquanto a app está aberta.
// Só corre se: (a) há pelo menos 1 favorito com GPS, e
// (b) a permissão de notificações já foi concedida.
// ============================================================
import { useEffect, useRef } from "react";
import { useFavorites } from "./favorites-storage";
import { fetchBusinesses, businessToPlace } from "./businesses-db";
import { startProximityWatch, fireProximityNotification } from "./proximity-watch";
import { type Place } from "./places-data";

export function useProximityNotifications() {
  const { ids: favoriteIds, hydrated } = useFavorites();
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!hydrated || favoriteIds.length === 0) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    let cancelled = false;

    (async () => {
      try {
        const businesses = await fetchBusinesses();
        if (cancelled) return;
        const places: Place[] = businesses
          .map(businessToPlace)
          .filter((p) => favoriteIds.includes(p.id) && p.lat != null && p.lng != null);

        if (places.length === 0) return;

        stopRef.current = startProximityWatch(places, (place) => {
          fireProximityNotification(place);
        });
      } catch {
        /* sem negócios disponíveis ou Supabase indisponível — falha silenciosa */
      }
    })();

    return () => {
      cancelled = true;
      stopRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- join(",") já estabiliza a dependência
  }, [hydrated, favoriteIds.join(",")]);
}
