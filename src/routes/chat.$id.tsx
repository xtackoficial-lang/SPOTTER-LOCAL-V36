import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useChats } from "@/lib/chat-storage";
import { fetchBusinessById, businessToPlace, type BusinessDB } from "@/lib/businesses-db";
import { useRealtimeChat, markAsRead } from "@/lib/messages-db";
import { useAuth } from "@/lib/auth-context";
import { type Place } from "@/lib/places-data";
import { Icon } from "@/components/Icon";
import { ChatAttachmentMenu } from "@/components/ChatAttachmentMenu";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { MessageAttachment } from "@/components/MessageAttachment";
import { fileToAttachment, attachmentToDataUrl, type ChatAttachment } from "@/lib/chat-attachments";
import { OrderModal } from "@/components/OrderModal";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/chat/$id")({
  head: () => ({ meta: [{ title: "Chat — Spotter Local" }] }),
  component: ChatThread,
});

function ChatThread() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const tr = useT();
  const { user } = useAuth();
  const { threads, send, markRead, hydrated } = useChats(); // chat simulado — fallback para visitantes sem conta
  const [text, setText] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<ChatAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [business, setBusiness] = useState<BusinessDB | null | undefined>(undefined);
  const [showOrderModal, setShowOrderModal] = useState(false);

  // Chat real (Supabase Realtime) só é possível quando o cliente está
  // autenticado E o negócio tem um owner_id real (negócio real, não um
  // dos exemplos de demonstração que não têm dono). Nos outros casos,
  // cai-se para o chat simulado local — nunca trava, nunca esconde a
  // caixa de mensagem do utilizador.
  const canUseRealChat = !!user && !!business?.owner_id;
  const {
    messages: realMessages,
    loading: realLoading,
    sendChatMessage,
  } = useRealtimeChat(
    id,
    canUseRealChat ? user!.id : null,
    canUseRealChat ? business!.owner_id! : null,
  );

  const place: Place | null | undefined =
    business === undefined ? undefined : business ? businessToPlace(business) : null;
  const thread = threads[id];

  useEffect(() => {
    let cancelled = false;
    fetchBusinessById(id)
      .then((b) => {
        if (!cancelled) setBusiness(b);
      })
      .catch(() => {
        if (!cancelled) setBusiness(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (hydrated && thread?.unread) markRead(id);
  }, [hydrated, id, thread?.unread, markRead]);

  // Mesmo princípio do chat simulado acima, mas para o chat real
  // (Supabase): marca como lidas as mensagens do negócio para este
  // cliente sempre que a conversa está aberta e recebe algo novo —
  // sem isto, o comerciante nunca via a mensagem como "lida" pelo
  // cliente, mesmo depois deste abrir e ver a resposta.
  useEffect(() => {
    if (!canUseRealChat || realLoading) return;
    markAsRead(id, user!.id);
  }, [canUseRealChat, realLoading, id, user, realMessages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length, realMessages.length]);

  if (place === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (!place) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-muted-foreground">{tr("conversationNotFound")}</p>
        <Link
          to="/chats"
          className="press rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
        >
          {tr("backToConversations")}
        </Link>
      </div>
    );
  }

  const submit = () => {
    if (!text.trim() && !pendingAttachment) return;
    if (canUseRealChat) {
      sendChatMessage(text.trim(), pendingAttachment ?? undefined);
    } else {
      send(place.id, place.name, place.icon, text.trim(), pendingAttachment ?? undefined);
    }
    setText("");
    setPendingAttachment(null);
  };

  const handleFile = async (file: File) => {
    setAttachmentError(null);
    try {
      const attachment = await fileToAttachment(file);
      setPendingAttachment(attachment);
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : tr("cannotAttachFile"));
    }
  };

  const handleRecorded = (attachment: ChatAttachment) => {
    setRecording(false);
    if (canUseRealChat) {
      sendChatMessage("", attachment);
    } else {
      send(place.id, place.name, place.icon, "", attachment);
    }
  };

  // Mensagens unificadas para exibição, vindas do canal real ou do simulado.
  const displayMessages = canUseRealChat
    ? realMessages.map((m) => ({
        id: m.id,
        from: (m.sender_id === user!.id ? "me" : "them") as "me" | "them",
        text: m.text,
        at: m.created_at,
        attachment:
          m.attachment_type && m.attachment_url
            ? {
                attachment_type: m.attachment_type,
                attachment_url: m.attachment_url,
                attachment_name: m.attachment_name ?? tr("fileLabel"),
                attachment_mime: m.attachment_mime ?? "application/octet-stream",
              }
            : null,
      }))
    : (thread?.messages ?? []).map((m) => ({
        ...m,
        attachment: m.attachment
          ? {
              attachment_type: m.attachment.type,
              attachment_url: attachmentToDataUrl(m.attachment),
              attachment_name: m.attachment.name,
              attachment_mime: m.attachment.mime,
            }
          : null,
      }));

  if (canUseRealChat && realLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/90 px-4 pb-3 pt-12 backdrop-blur-xl">
        <button
          onClick={() => navigate({ to: "/chats" })}
          className="press grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-accent"
          aria-label={tr("backLabel")}
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent text-accent-foreground">
          <Icon name={place.icon} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{place.name}</div>
          <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {place.openNow ? (
              <>
                <span className="relative grid h-1.5 w-1.5 place-items-center">
                  <span className="absolute inset-0 rounded-full bg-emerald-500 animate-pulse-ring" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                {tr("onlineNow")}
              </>
            ) : (
              tr("repliesWhenOpen")
            )}
          </div>
        </div>
        <Link
          to="/place/$id"
          params={{ id: place.id }}
          className="text-xs font-medium text-primary"
        >
          {tr("viewAction")}
        </Link>
        {/* Botão de pedido */}
        <button
          onClick={() => setShowOrderModal(true)}
          className="press grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary"
          title={tr("orderAction")}
        >
          <Icon name="cart" size={16} />
        </button>
      </header>

      {/* Aviso honesto para quem não tem conta — antes desta correção,
          a mensagem de um convidado nunca chegava ao comerciante (só o
          próprio Realtime do Supabase liga cliente autenticado a dono
          real), mas o utilizador recebia uma resposta automática
          fabricada 1-2 segundos depois, a fingir vir do negócio. Agora
          diz-se a verdade em vez de simular uma resposta. */}
      {!canUseRealChat && !user && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-[11px] text-amber-700">
          <Icon name="info" size={13} className="mt-0.5 shrink-0" />
          <span>
            {tr("guestChatNotice")}{" "}
            <Link to="/" className="font-semibold underline">
              {tr("signIn")}
            </Link>
          </span>
        </div>
      )}

      {/* Modal de pedido */}
      {showOrderModal && (
        <OrderModal
          businessId={place.id}
          businessName={place.name}
          clientId={user?.id ?? `guest-${crypto.randomUUID()}`}
          onClose={() => setShowOrderModal(false)}
          onOrderSent={(summary) => {
            if (canUseRealChat) sendChatMessage(summary);
            else send(place.id, place.name, place.icon, summary);
            setShowOrderModal(false);
          }}
        />
      )}

      <main className="flex-1 space-y-2 px-4 py-4">
        {displayMessages.length === 0 ? (
          <div className="mt-10 text-center text-xs text-muted-foreground">{tr("sayHello")}</div>
        ) : (
          displayMessages.map((m) => (
            <div
              key={m.id}
              className={`flex animate-slide-up ${m.from === "me" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[78%] space-y-1.5 rounded-2xl px-3.5 py-2 text-sm ${
                  m.from === "me"
                    ? "rounded-br-sm text-primary-foreground shadow-[var(--shadow-soft)]"
                    : "rounded-bl-sm bg-muted text-foreground"
                }`}
                style={m.from === "me" ? { background: "var(--gradient-primary)" } : undefined}
              >
                {m.attachment && <MessageAttachment attachment={m.attachment} />}
                {m.text && <div>{m.text}</div>}
                <div
                  className={`mt-0.5 text-right text-[9px] ${m.from === "me" ? "opacity-80" : "text-muted-foreground"}`}
                >
                  {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </main>

      {attachmentError && (
        <div className="px-4 pb-1 text-center text-[11px] text-destructive">{attachmentError}</div>
      )}

      {pendingAttachment && (
        <div className="flex items-center gap-2 border-t border-border bg-card/95 px-3 pt-2 backdrop-blur-xl animate-slide-up">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-muted px-3 py-2">
            {pendingAttachment.type === "image" ? (
              <img
                src={`data:${pendingAttachment.mime};base64,${pendingAttachment.data}`}
                alt={pendingAttachment.name}
                className="h-10 w-10 rounded-lg object-cover"
              />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-background">
                <Icon name={pendingAttachment.type === "audio" ? "mic" : "fileText"} size={16} />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
              {pendingAttachment.name}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPendingAttachment(null)}
            className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
            aria-label={tr("removeAttachment")}
          >
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-card/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-3 backdrop-blur-xl"
      >
        {!recording && (
          <ChatAttachmentMenu onFile={handleFile} onStartRecording={() => setRecording(true)} />
        )}

        {!recording && (
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tr("writeMessagePlaceholder")}
            className="h-11 flex-1 rounded-full border border-input bg-background px-4 text-sm outline-none focus:border-primary"
          />
        )}

        {text.trim() || pendingAttachment ? (
          <button
            type="submit"
            className="press grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary-foreground shadow-[var(--shadow-soft)]"
            style={{ background: "var(--gradient-primary)" }}
            aria-label={tr("sendAction")}
          >
            <Icon name="send" size={18} />
          </button>
        ) : (
          <VoiceRecorder
            active={recording}
            onStart={() => setRecording(true)}
            onCancel={() => setRecording(false)}
            onRecorded={handleRecorded}
          />
        )}
      </form>
    </div>
  );
}
