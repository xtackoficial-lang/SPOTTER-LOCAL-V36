// ============================================================
// XTACK SPOTTER — Push Notifications: tokens, agendamentos e histórico
// ============================================================
import { addInboxItem } from "./notifications-inbox";
import { useEffect, useState } from "react";
import { supabase, SUPABASE_CONFIGURED } from "./supabase";
import { requestPushToken, FIREBASE_CONFIGURED, onForegroundMessage } from "./firebase";
import { getCurrentUser } from "./auth";

// ── Registo do token deste dispositivo ──────────────────────────────
// Chamado uma vez por sessão (ver hook usePushRegistration, montado no
// layout raiz da app). Pede permissão ao utilizador e, se concedida,
// grava/actualiza o token na tabela push_tokens — é isso que permite à
// Edge Function, no servidor, saber para onde enviar cada notificação.
export async function registerPushToken(): Promise<{ token: string | null; error?: string }> {
  if (!FIREBASE_CONFIGURED) {
    return { token: null, error: "Firebase não configurado." };
  }
  const token = await requestPushToken();
  if (!token) return { token: null, error: "Permissão de notificações não concedida." };

  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const user = await getCurrentUser();
      // Reclama o token para a conta atual mesmo que esteja registado noutra
      // (a regra da tabela só deixa mexer nas linhas da própria conta, por
      // isso o upsert simples falhava em silêncio e as notificações da conta
      // anterior continuavam a chegar). Função do servidor: migração 020.
      if (user?.id) {
        const claimed = await supabase.rpc("claim_push_token", {
          p_token: token,
          p_platform: /android/i.test(navigator.userAgent)
            ? "android"
            : /iphone|ipad/i.test(navigator.userAgent)
              ? "ios"
              : "web",
        });
        if (!claimed.error) return { token };
      }
      await supabase.from("push_tokens").upsert(
        {
          user_id: user?.id ?? null,
          token,
          platform: /android/i.test(navigator.userAgent)
            ? "android"
            : /iphone|ipad/i.test(navigator.userAgent)
              ? "ios"
              : "web",
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "token" },
      );
    } catch (err) {
      console.warn("registerPushToken: falha ao gravar token no Supabase.", err);
    }
  }
  return { token };
}

/**
 * Hook a montar uma vez no layout raiz: tenta silenciosamente registar o
 * token de push no arranque da app, SEM pedir permissão de forma intrusiva
 * — só regista se o utilizador já tiver concedido permissão anteriormente
 * (Notification.permission === "granted"), para não interromper quem
 * acaba de abrir a app por instruções repetidas do browser.
 */
export function usePushAutoRegister() {
  // Volta a registar sempre que muda a conta (antes só uma vez por abertura
  // da app, e o token ficava preso à conta anterior).
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getCurrentUser()
      .then((u) => alive && setUid(u?.id ?? null))
      .catch(() => {});
    const onChange = () =>
      getCurrentUser()
        .then((u) => alive && setUid(u?.id ?? null))
        .catch(() => {});
    window.addEventListener("xlocal-data-wiped", onChange);
    return () => {
      alive = false;
      window.removeEventListener("xlocal-data-wiped", onChange);
    };
  }, []);
  useEffect(() => {
    if (!FIREBASE_CONFIGURED || !uid) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      registerPushToken();
    }
  }, [uid]);
}

// Mostra um toast simples quando chega uma notificação push com a app
// aberta em primeiro plano — o browser não mostra a notificação do
// sistema nesse caso, por isso sem isto a pessoa nunca via nada.
export function useForegroundPushToast() {
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onForegroundMessage((title, body) => {
      addInboxItem(title, body);
      setToast({ title, body });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  return { toast, dismiss: () => setToast(null) };
}

// ── Agendamentos (admin) ─────────────────────────────────────────────
export interface ScheduledNotification {
  id: string;
  title: string;
  body: string;
  mode: "custom" | "auto_visit";
  target: "all" | "merchants" | "premium_merchants" | "inactive_users" | "personal_users";
  city?: string | null;
  schedule_type: "once" | "weekly";
  send_at?: string | null; // ISO, usado quando schedule_type === "once"
  weekdays?: number[] | null; // 0=Dom..6=Sáb, usado quando schedule_type === "weekly"
  send_hour: number;
  send_minute: number;
  active: boolean;
  last_sent_at?: string | null;
  created_at: string;
}

export async function fetchScheduledNotifications(): Promise<ScheduledNotification[]> {
  if (!SUPABASE_CONFIGURED || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from("scheduled_notifications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("fetchScheduledNotifications:", error.message);
      return [];
    }
    return (data ?? []) as ScheduledNotification[];
  } catch (err) {
    console.warn("fetchScheduledNotifications: falha de rede.", err);
    return [];
  }
}

export async function createScheduledNotification(
  input: Omit<ScheduledNotification, "id" | "created_at" | "last_sent_at" | "active">,
): Promise<{ error: string | null }> {
  if (!SUPABASE_CONFIGURED || !supabase) {
    return { error: "Supabase não configurado." };
  }
  try {
    const { error } = await supabase
      .from("scheduled_notifications")
      .insert({ ...input, active: true });
    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.warn("createScheduledNotification: falha de rede.", err);
    return { error: "Sem ligação à internet." };
  }
}

export async function toggleScheduledNotification(
  id: string,
  active: boolean,
): Promise<{ error: string | null }> {
  if (!SUPABASE_CONFIGURED || !supabase) return { error: "Supabase não configurado." };
  try {
    const { error } = await supabase
      .from("scheduled_notifications")
      .update({ active })
      .eq("id", id);
    return { error: error?.message ?? null };
  } catch (err) {
    console.warn("toggleScheduledNotification: falha de rede.", err);
    return { error: "Sem ligação à internet." };
  }
}

export async function deleteScheduledNotification(id: string): Promise<{ error: string | null }> {
  if (!SUPABASE_CONFIGURED || !supabase) return { error: "Supabase não configurado." };
  try {
    const { error } = await supabase.from("scheduled_notifications").delete().eq("id", id);
    return { error: error?.message ?? null };
  } catch (err) {
    console.warn("deleteScheduledNotification: falha de rede.", err);
    return { error: "Sem ligação à internet." };
  }
}

// ── Histórico de envios reais (preenchido pela Edge Function) ───────
export interface PushLogEntry {
  id: string;
  scheduled_id: string | null;
  title: string;
  body: string;
  target: string | null;
  recipients_count: number;
  success_count: number;
  failure_count: number;
  sent_at: string;
}

export async function fetchPushLog(): Promise<PushLogEntry[]> {
  if (!SUPABASE_CONFIGURED || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from("push_log")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(30);
    if (error) {
      console.warn("fetchPushLog:", error.message);
      return [];
    }
    return (data ?? []) as PushLogEntry[];
  } catch (err) {
    console.warn("fetchPushLog: falha de rede.", err);
    return [];
  }
}

// ── Disparo manual imediato (independente do agendamento) ───────────
// Invoca a mesma Edge Function usada pelo cron, mas passando a campanha
// directamente no corpo do pedido em vez de a ler da tabela — usado pelo
// botão "Enviar agora" no admin, para campanhas pontuais sem agendamento.
export async function sendPushNow(input: {
  title: string;
  body: string;
  mode: "custom" | "auto_visit";
  target: ScheduledNotification["target"];
  city?: string;
}): Promise<{ error: string | null; result?: { recipients: number; success: number } }> {
  if (!SUPABASE_CONFIGURED || !supabase) return { error: "Supabase não configurado." };
  try {
    const { data, error } = await supabase.functions.invoke("send-scheduled-notifications", {
      body: { manual: input },
    });
    if (error) return { error: error.message };
    return { error: null, result: data };
  } catch (err) {
    console.warn("sendPushNow: falha ao invocar Edge Function.", err);
    return {
      error:
        "Falha ao contactar a função de envio. Confirme que a Edge Function 'send-scheduled-notifications' está publicada (ver FIREBASE_SETUP.md).",
    };
  }
}

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function useScheduledNotifications() {
  const [items, setItems] = useState<ScheduledNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    setItems(await fetchScheduledNotifications());
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  return { items, loading, reload };
}
