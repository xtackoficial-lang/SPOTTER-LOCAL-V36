import { useEffect, useState } from "react";

export interface ChatMessage {
  id: string;
  from: "me" | "them";
  text: string;
  at: string;
  attachment?: {
    type: "image" | "document" | "audio";
    data: string;
    name: string;
    mime: string;
  } | null;
}

export interface ChatThread {
  placeId: string;
  placeName: string;
  icon: string;
  messages: ChatMessage[];
  unread: number;
  updatedAt: string;
}

const KEY = "xlocal.chats.v1";

function read(): Record<string, ChatThread> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
function write(data: Record<string, ChatThread>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignorado: falha de quota/acesso ao localStorage */
  }
}

export function useChats() {
  const [threads, setThreads] = useState<Record<string, ChatThread>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setThreads(read());
    setHydrated(true);
  }, []);

  const sync = (data: Record<string, ChatThread>) => {
    setThreads({ ...data });
    write(data);
  };

  const send = (
    placeId: string,
    placeName: string,
    icon: string,
    text: string,
    attachment?: ChatMessage["attachment"],
  ) => {
    const data = read();
    const now = new Date().toISOString();
    const t: ChatThread = data[placeId] ?? {
      placeId,
      placeName,
      icon,
      messages: [],
      unread: 0,
      updatedAt: now,
    };
    t.messages.push({
      id: crypto.randomUUID(),
      from: "me",
      text,
      at: now,
      attachment: attachment ?? null,
    });
    t.updatedAt = now;
    data[placeId] = t;
    write(data);
    setThreads({ ...data });
    // BUG CORRIGIDO (auditoria 2026-07-08): havia aqui um setTimeout que
    // inseria uma resposta fabricada, escolhida ao acaso de uma lista
    // fixa, a fingir vir do negócio ("Obrigado pelo contacto!..."), sem
    // o comerciante alguma vez ver ou responder a nada. Isto engana
    // directamente o visitante convidado (sem conta) — dá a entender que
    // o negócio respondeu quando a mensagem nem chegou a lado nenhum.
    // Este chat local (useChats) só existe como fallback para quem
    // ainda não tem conta — ver comentário em chat.$id.tsx sobre
    // canUseRealChat. Removido; a mensagem do convidado fica sozinha na
    // conversa, sem resposta inventada.
  };

  const markRead = (placeId: string) => {
    const data = read();
    if (!data[placeId]) return;
    data[placeId].unread = 0;
    sync(data);
  };

  return { threads, hydrated, send, markRead };
}
