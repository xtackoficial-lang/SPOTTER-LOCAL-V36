// Caixa de notificações recebidas com a app aberta (guardada só neste
// aparelho e apagada ao sair da conta — ver session-cleanup.ts).
import { useEffect, useState, useCallback } from "react";

const KEY = "xlocal.notifs.v1";
const MAX = 50;

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
}

function read(): InboxItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(items: InboxItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new Event("xlocal-notifs"));
}

export function addInboxItem(title: string, body: string) {
  write([
    { id: crypto.randomUUID(), title, body, at: new Date().toISOString(), read: false },
    ...read(),
  ]);
}

export function useNotificationsInbox() {
  const [items, setItems] = useState<InboxItem[]>([]);
  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    window.addEventListener("xlocal-notifs", sync);
    window.addEventListener("xlocal-data-wiped", sync);
    return () => {
      window.removeEventListener("xlocal-notifs", sync);
      window.removeEventListener("xlocal-data-wiped", sync);
    };
  }, []);
  const markAllRead = useCallback(() => write(read().map((i) => ({ ...i, read: true }))), []);
  const clear = useCallback(() => write([]), []);
  return { items, unread: items.filter((i) => !i.read).length, markAllRead, clear };
}
