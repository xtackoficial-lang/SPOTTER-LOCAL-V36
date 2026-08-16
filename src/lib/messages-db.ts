// ============================================================
// XTACK SPOTTER — Mensagens em tempo real (Supabase Realtime)
// Fallback para localStorage quando offline
// ============================================================
import { useState, useEffect } from "react";
import { supabase, SUPABASE_CONFIGURED } from "./supabase";
import { uploadMedia } from "./storage-upload";
import { attachmentToBlob, attachmentToDataUrl } from "./chat-attachments";

export interface MessageDB {
  id: string;
  business_id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
  read: boolean;
  created_at: string;
  // v31 — attachment_url substitui attachment_data (base64). O anexo é
  // enviado ao Supabase Storage antes de gravar a mensagem — só a URL
  // (texto curto) fica na base de dados, não o ficheiro inteiro. Ver
  // src/lib/storage-upload.ts.
  attachment_url?: string | null;
  attachment_type?: "image" | "document" | "audio" | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
}

const LOCAL_KEY = "xlocal.messages.v2";

function localRead(): MessageDB[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}
function localWrite(msgs: MessageDB[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(msgs));
  } catch {
    /* ignorado: falha de quota/acesso ao localStorage */
  }
}

// ---------- Buscar mensagens de uma conversa ----------
export async function fetchMessages(businessId: string, userId: string): Promise<MessageDB[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("business_id", businessId)
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order("created_at", { ascending: true });
      if (!error && data) return data as MessageDB[];
    } catch (err) {
      console.warn("fetchMessages: Supabase indisponível, a usar dados locais.", err);
    }
  }
  return localRead().filter((m) => m.business_id === businessId);
}

// ---------- Enviar mensagem ----------
// Aceita um "id" opcional para que o chamador possa usar o MESMO id da
// mensagem optimista mostrada de imediato no chat (ver useRealtimeChat).
// Sem isto, esta função gerava sempre um id novo, diferente do optimistic.id
// — se o evento Realtime chegasse antes da resposta deste insert (rede
// lenta), a troca por optimistic.id falhava e a mensagem aparecia
// duplicada no ecrã (a optimista + a recebida via Realtime).
export async function sendMessage(
  msg: Omit<MessageDB, "id" | "created_at" | "read"> & { id?: string },
): Promise<MessageDB | null> {
  const newMsg: MessageDB = {
    ...msg,
    id: msg.id ?? crypto.randomUUID(),
    read: false,
    created_at: new Date().toISOString(),
  };
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase.from("messages").insert(newMsg).select().single();
      if (!error && data) return data as MessageDB;
    } catch (err) {
      console.warn("sendMessage: Supabase indisponível, a guardar localmente.", err);
    }
  }
  // fallback local
  const all = localRead();
  localWrite([...all, newMsg]);
  return newMsg;
}

// ---------- Marcar como lidas ----------
export async function markAsRead(businessId: string, userId: string): Promise<void> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      await supabase
        .from("messages")
        .update({ read: true })
        .eq("business_id", businessId)
        .eq("receiver_id", userId)
        .eq("read", false);
      return;
    } catch (err) {
      console.warn("markAsRead: Supabase indisponível, a actualizar apenas localmente.", err);
    }
  }
  const all = localRead().map((m) =>
    m.business_id === businessId && m.receiver_id === userId ? { ...m, read: true } : m,
  );
  localWrite(all);
}

// ---------- Realtime subscription ----------
export function subscribeToMessages(
  businessId: string,
  userId: string,
  onNew: (msg: MessageDB) => void,
) {
  if (!SUPABASE_CONFIGURED || !supabase) return () => {};
  const client = supabase;

  const channel = client
    .channel(`messages:${businessId}:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `business_id=eq.${businessId}`,
      },
      (payload) => {
        const msg = payload.new as MessageDB;
        if (msg.sender_id === userId || msg.receiver_id === userId) {
          onNew(msg);
        }
      },
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

// ---------- Contar não lidas ----------
export async function countUnread(userId: string): Promise<number> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .eq("read", false);
      return count ?? 0;
    } catch (err) {
      console.warn("countUnread: Supabase indisponível, a usar dados locais.", err);
    }
  }
  return localRead().filter((m) => m.receiver_id === userId && !m.read).length;
}

// ---------- Conversas agrupadas por cliente (vista do comerciante) ----------
export interface ConversationSummary {
  clientId: string;
  lastMessage: string;
  lastAt: string;
  unread: number;
}

export async function fetchBusinessConversations(
  businessId: string,
  ownerId: string,
): Promise<ConversationSummary[]> {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (!error && data) {
        const byClient = new Map<string, ConversationSummary>();
        for (const m of data as MessageDB[]) {
          const clientId = m.sender_id === ownerId ? m.receiver_id : m.sender_id;
          if (!byClient.has(clientId)) {
            byClient.set(clientId, {
              clientId,
              lastMessage: m.text,
              lastAt: m.created_at,
              unread: 0,
            });
          }
          if (m.receiver_id === ownerId && !m.read) {
            byClient.get(clientId)!.unread += 1;
          }
        }
        return Array.from(byClient.values()).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
      }
    } catch (err) {
      console.warn("fetchBusinessConversations: Supabase indisponível.", err);
    }
  }
  return [];
}

// ---------- Hook React: conversa em tempo real ----------
// Usado tanto pelo cliente (em /chat/$id, falando com o dono do negócio)
// como pelo comerciante (no painel, falando com cada cliente). Ambos os
// lados precisam de estar autenticados (sender_id/receiver_id referenciam
// auth.users) — para visitantes sem conta, o chamador deve usar o chat
// simulado local em vez deste hook.
export function useRealtimeChat(
  businessId: string,
  myUserId: string | null,
  otherUserId: string | null,
) {
  const [messages, setMessages] = useState<MessageDB[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!myUserId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMessages(businessId, myUserId)
      .then((msgs) => {
        if (!cancelled) setMessages(msgs);
      })
      .catch((err) => {
        console.warn("useRealtimeChat: falha ao carregar mensagens.", err);
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const unsubscribe = subscribeToMessages(businessId, myUserId, (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [businessId, myUserId]);

  const sendChatMessage = async (
    text: string,
    attachment?: { type: "image" | "document" | "audio"; data: string; name: string; mime: string },
  ) => {
    if (!myUserId || !otherUserId || (!text.trim() && !attachment)) return;
    // Optimista: mostra a mensagem imediatamente, mesmo antes da
    // confirmação do Supabase — usa a data-URL local do anexo (instantâneo,
    // sem esperar pelo upload) até a versão confirmada (com attachment_url
    // do Storage) substituir esta linha.
    const optimisticAttachmentUrl = attachment ? attachmentToDataUrl(attachment) : null;
    const optimistic: MessageDB = {
      id: crypto.randomUUID(),
      business_id: businessId,
      sender_id: myUserId,
      receiver_id: otherUserId,
      text: text.trim(),
      read: false,
      created_at: new Date().toISOString(),
      attachment_url: optimisticAttachmentUrl,
      attachment_type: attachment?.type ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_mime: attachment?.mime ?? null,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      // v31 — Envia o anexo ao Supabase Storage ANTES de gravar a
      // mensagem: a coluna attachment_url guarda só a URL (texto
      // curto), não o ficheiro inteiro em base64.
      let attachmentUrl: string | null = null;
      if (attachment) {
        const blob = attachmentToBlob(attachment);
        const file = new File([blob], attachment.name, { type: attachment.mime });
        attachmentUrl = await uploadMedia(file, "chat", myUserId);
      }
      const saved = await sendMessage({
        id: optimistic.id,
        business_id: businessId,
        sender_id: myUserId,
        receiver_id: otherUserId,
        text: text.trim(),
        attachment_url: attachmentUrl,
        attachment_type: attachment?.type ?? null,
        attachment_name: attachment?.name ?? null,
        attachment_mime: attachment?.mime ?? null,
      });
      if (saved) {
        setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? saved : m)));
      }
    } catch (err) {
      // BUG CORRIGIDO (2026-08-15): antes, se o upload do anexo ou o envio da mensagem
      // falhasse, o catch apenas fazia console.warn — e a mensagem optimista
      // (com data-URL local) ficava permanentemente na lista, enganando o utilizador
      // de que a mensagem tinha sido enviada. Agora remove a mensagem optimista da lista.
      console.warn("sendChatMessage: falha ao enviar mensagem.", err);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    }
  };

  return { messages, loading, sendChatMessage };
}
