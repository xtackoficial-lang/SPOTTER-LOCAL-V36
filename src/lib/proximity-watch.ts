// ============================================================
// XTACK SPOTTER — Notificação por proximidade (v18)
// Enquanto a app está aberta (em primeiro plano ou minimizada
// no mobile com PWA instalada), monitoriza a posição do
// utilizador via watchPosition e dispara uma notificação local
// quando ele entra no raio de um negócio favoritado/visitado.
//
// Limitação honesta: isto NÃO é geofencing nativo em segundo
// plano total (precisaria de uma app nativa com permissão
// "always" de localização). Funciona enquanto o browser/PWA
// tem o processo vivo — é o que é tecnicamente possível numa
// PWA sem ejectar para nativo.
// ============================================================
import { distanceKm, type Coordinates } from "./geo-utils";
import { type Place } from "./places-data";

const RADIUS_KM = 0.5; // 500m — raio de proximidade
const COOLDOWN_KEY = "xlocal.proximity.notified.v1";
const COOLDOWN_MS = 1000 * 60 * 60 * 6; // não repetir o mesmo negócio por 6h

interface NotifiedLog {
  [placeId: string]: number; // timestamp da última notificação
}

function readLog(): NotifiedLog {
  try {
    return JSON.parse(localStorage.getItem(COOLDOWN_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeLog(log: NotifiedLog) {
  try {
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(log));
  } catch {
    /* falha silenciosa — ignorar erro de storage/sync */
  }
}

let watchId: number | null = null;

/**
 * Inicia a monitorização de proximidade. Chama o callback sempre
 * que o utilizador entra no raio de um lugar da lista (favoritos
 * ou visitados) que ainda não foi notificado nas últimas 6h.
 */
export function startProximityWatch(places: Place[], onNearby: (place: Place) => void): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return () => {};
  }
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const me: Coordinates = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const log = readLog();
      const now = Date.now();

      for (const place of places) {
        if (place.lat == null || place.lng == null) continue;
        const d = distanceKm(me, { lat: place.lat, lng: place.lng });
        if (d <= RADIUS_KM) {
          const last = log[place.id] ?? 0;
          if (now - last > COOLDOWN_MS) {
            log[place.id] = now;
            writeLog(log);
            onNearby(place);
          }
        }
      }
    },
    () => {
      /* permissão negada ou erro — falha silenciosa */
    },
    { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
  );

  return () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  };
}

/**
 * Dispara uma notificação local do browser (não passa pelo servidor
 * push — é instantânea, só funciona com a app/PWA aberta ou em
 * background recente, e exige permissão já concedida).
 */
export function fireProximityNotification(place: Place) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(`Estás perto de ${place.name}`, {
      body: "Um lugar que guardaste está aqui perto. Que tal dar uma vista de olhos?",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: `proximity-${place.id}`,
    });
    n.onclick = () => {
      window.focus();
      window.location.href = `/place/${place.id}`;
    };
  } catch {
    /* Notification pode falhar em alguns browsers/contextos — falha silenciosa */
  }
}
