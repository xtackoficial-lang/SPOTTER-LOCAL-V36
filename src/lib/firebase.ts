// ============================================================
// XTACK SPOTTER — Firebase Cloud Messaging (Push Notifications)
// ------------------------------------------------------------
// Substitui os valores em .env pelas credenciais do teu projecto Firebase.
// Guia completo de configuração: ver FIREBASE_SETUP.md na raiz do projecto.
// ============================================================
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
};

// Chave pública VAPID, gerada em Firebase Console → Cloud Messaging →
// Web Push certificates. Necessária para pedir um token de push no browser.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? "";

export const FIREBASE_CONFIGURED =
  FIREBASE_CONFIG.apiKey.length > 10 &&
  FIREBASE_CONFIG.projectId.length > 2 &&
  VAPID_KEY.length > 10;

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

if (FIREBASE_CONFIGURED && typeof window !== "undefined") {
  try {
    app = initializeApp(FIREBASE_CONFIG);
    // getMessaging() falha em browsers/ambientes sem suporte a Service
    // Worker + Push API (ex: alguns webviews antigos) — nunca deve
    // impedir o resto da app de funcionar.
    messaging = getMessaging(app);
  } catch (err) {
    console.warn("Firebase Messaging: não suportado neste ambiente.", err);
    messaging = null;
  }
}

/**
 * Pede permissão de notificações ao utilizador e devolve o token FCM do
 * dispositivo, ou null se recusado / não suportado / não configurado.
 * O service worker /sw.js já está registado por main.tsx — aqui só
 * associamos o Firebase Messaging a esse mesmo registo (em vez de criar
 * um segundo Service Worker concorrente).
 */
export async function requestPushToken(): Promise<string | null> {
  if (!FIREBASE_CONFIGURED || !messaging) return null;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    return token || null;
  } catch (err) {
    console.warn("requestPushToken: falha ao obter token FCM.", err);
    return null;
  }
}

/**
 * Escuta notificações recebidas enquanto a app está em primeiro plano
 * (aberta e visível). Notificações recebidas com a app em segundo plano
 * ou fechada são tratadas directamente pelo Service Worker (sw.js).
 */
export function onForegroundMessage(callback: (title: string, body: string) => void) {
  if (!FIREBASE_CONFIGURED || !messaging) return () => {};
  const unsubscribe = onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? "Spotter Local";
    const body = payload.notification?.body ?? "";
    callback(title, body);
  });
  return unsubscribe;
}
