// ============================================================
// SPOTTER LOCAL — Service Worker
// Estratégia: network-first com fallback para cache.
// Como os ficheiros de build têm hash no nome (mudam a cada
// versão), não pré-listamos nomes — cada recurso é guardado em
// cache na primeira vez que é pedido com sucesso, e servido do
// cache se o pedido de rede falhar (sem ligação).
//
// v14: também trata notificações push (Firebase Cloud Messaging).
// Em vez de registar um segundo Service Worker próprio do Firebase
// (firebase-messaging-sw.js), que entraria em conflito de "scope" com
// este já existente, importamos os scripts compat do Firebase aqui
// mesmo e tratamos o evento "push" directamente — um único Service
// Worker faz as duas coisas: cache offline + notificações.
// ============================================================

importScripts("https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js");

// Estas credenciais são públicas por natureza (equivalentes à "apiKey" do
// frontend) — não são segredos. Têm de estar hardcoded aqui porque
// Service Workers não têm acesso a import.meta.env do Vite. Se ainda não
// configuraste o Firebase, estes valores ficam vazios e o bloco abaixo
// simplesmente não inicializa nada (sem erros).
const FIREBASE_CONFIG_SW = {
  apiKey: "__VITE_FIREBASE_API_KEY__",
  authDomain: "__VITE_FIREBASE_AUTH_DOMAIN__",
  projectId: "__VITE_FIREBASE_PROJECT_ID__",
  storageBucket: "__VITE_FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__VITE_FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__VITE_FIREBASE_APP_ID__",
};

if (FIREBASE_CONFIG_SW.apiKey && !FIREBASE_CONFIG_SW.apiKey.startsWith("__")) {
  try {
    firebase.initializeApp(FIREBASE_CONFIG_SW);
    const messaging = firebase.messaging();
    // onBackgroundMessage trata notificações recebidas quando a app está
    // fechada ou em segundo plano — o browser/SO mostra a notificação
    // mesmo sem nenhuma aba do Spotter Local aberta.
    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title ?? "Spotter Local";
      const options = {
        body: payload.notification?.body ?? "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
      };
      self.registration.showNotification(title, options);
    });
  } catch (err) {
    // Nunca deixar uma falha de configuração do Firebase quebrar o
    // resto do Service Worker (cache offline continua a funcionar).
    console.warn("Firebase Messaging SW: não inicializado.", err);
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow("/");
    }),
  );
});

const CACHE_NAME = "spotter-local-v19";
const OFFLINE_URL = "/";

self.addEventListener("install", (event) => {
  // Activa imediatamente a nova versão do SW, sem esperar que todas
  // as abas antigas fechem — para correcções chegarem mais rápido.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Pré-cache só do essencial para abrir a app offline.
      return cache.addAll(["/", "/manifest.webmanifest"]).catch(() => {
        // Se algum destes falhar (ex: ainda sem rede na instalação),
        // não bloqueia a instalação do Service Worker.
      });
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Só intercepta GET — pedidos de escrita (POST/PUT/DELETE) vão
  // sempre direto à rede, nunca ao cache (ex: chamadas ao Supabase).
  if (request.method !== "GET") return;

  // Não cachear chamadas a APIs externas (Supabase, etc.) — só os
  // recursos do próprio app (HTML, JS, CSS, imagens locais).
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Resposta de rede válida: guarda uma cópia em cache para uso
        // offline futuro, e devolve a resposta original ao browser.
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        // Sem rede: tenta servir do cache. Para navegação de páginas
        // (ex: abrir /home offline), cai para a página inicial em
        // cache se a rota exacta não estiver guardada.
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const fallback = await caches.match(OFFLINE_URL);
          if (fallback) return fallback;
        }
        return new Response("Sem ligação à internet.", {
          status: 503,
          statusText: "Offline",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }),
  );
});
