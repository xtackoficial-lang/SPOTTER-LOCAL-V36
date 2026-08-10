import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useOnboarding } from "@/lib/onboarding-storage";
import { useSubscription } from "@/lib/subscription-storage";
import { useAuth } from "@/lib/auth-context";
import {
  fetchBusinessConversations,
  markAsRead,
  useRealtimeChat,
  type ConversationSummary,
} from "@/lib/messages-db";
import { BusinessBottomNav } from "@/components/BusinessBottomNav";
import { Icon } from "@/components/Icon";
import { RequireBusiness } from "@/components/RequireBusiness";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/business-inbox")({
  head: () => ({ meta: [{ title: "Mensagens — Spotter Local Business" }] }),
  component: () => (
    <RequireBusiness>
      <BusinessInbox />
    </RequireBusiness>
  ),
});

function BusinessInbox() {
  const tr = useT();
  const navigate = useNavigate();
  const { draft, hydrated } = useOnboarding();
  const { user } = useAuth();
  const businessId = draft.business.businessId || "default";
  const { isFree } = useSubscription(businessId);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated || !user) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetchBusinessConversations(businessId, user.id)
      .then((list) => {
        if (!cancelled) setConversations(list);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, user, businessId]);

  if (!hydrated || !user) {
    return <div className="min-h-screen bg-background" />;
  }

  if (activeClientId) {
    return (
      <ConversationView
        businessId={businessId}
        ownerId={user.id}
        clientId={activeClientId}
        canReply={!isFree}
        onBack={() => setActiveClientId(null)}
        onRead={() =>
          setConversations((prev) =>
            prev.map((c) => (c.clientId === activeClientId ? { ...c, unread: 0 } : c)),
          )
        }
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="px-5 pb-4 pt-12 animate-slide-up">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/business" })}
            className="press grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground"
          >
            <Icon name="arrowLeft" size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {tr("messagesTitle")}
            </h1>
            <p className="text-xs text-muted-foreground">{tr("conversationsRealtimeSubtitle")}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 pb-24">
        {isFree &&
          (() => {
            const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);
            return (
              <button
                onClick={() => navigate({ to: "/subscribe" })}
                className="press mb-4 flex w-full items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-left animate-slide-up"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-600">
                  <Icon name="lock" size={18} />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    {totalUnread > 0
                      ? `${totalUnread} ${totalUnread > 1 ? tr("messagesAwaitingReplyPlural") : tr("messagesAwaitingReply")}`
                      : tr("cannotReplyFreePlan")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {tr("activateStarterToReply")}
                  </span>
                </span>
                <Icon name="chevronRight" size={16} className="shrink-0 text-amber-600" />
              </button>
            );
          })()}
        {loading ? (
          <div className="mt-12 flex justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        ) : loadError ? (
          <div className="mt-12 flex flex-col items-center gap-2 text-center">
            <Icon name="x" size={24} className="text-destructive" />
            <p className="text-sm text-muted-foreground">{tr("couldNotLoadConversations")}</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center animate-pop-in">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
              <Icon name="message" size={26} />
            </div>
            <div className="mt-4 font-semibold text-foreground">{tr("noMessagesYetTitle")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{tr("customerWritesHere")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card stagger">
            {conversations.map((c) => (
              <li key={c.clientId}>
                <button
                  onClick={() => setActiveClientId(c.clientId)}
                  className="press flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-accent/40"
                >
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
                    <Icon name="user" size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="truncate font-semibold text-foreground">
                        {tr("clientLabel")}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(c.lastAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-xs text-muted-foreground">{c.lastMessage}</div>
                      {c.unread > 0 && (
                        <span
                          className="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold text-primary-foreground shadow-[var(--shadow-soft)]"
                          style={{ background: "var(--gradient-primary)" }}
                        >
                          {c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      <BusinessBottomNav />
    </div>
  );
}

function ConversationView({
  businessId,
  ownerId,
  clientId,
  canReply,
  onBack,
  onRead,
}: {
  businessId: string;
  ownerId: string;
  clientId: string;
  canReply: boolean;
  onBack: () => void;
  onRead: () => void;
}) {
  const tr = useT();
  const navigate = useNavigate();
  const { messages, loading, sendChatMessage } = useRealtimeChat(businessId, ownerId, clientId);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Marca como lidas: ao abrir a conversa, e sempre que chegar mensagem
  // nova do cliente enquanto o comerciante está com a conversa aberta.
  // Sem isto, o contador de não-lidas (badge na lista e "X mensagens à
  // espera de resposta") nunca baixava, mesmo depois do comerciante ler.
  useEffect(() => {
    if (loading) return;
    markAsRead(businessId, ownerId).then(onRead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, ownerId, loading, messages.length]);

  const submit = () => {
    if (!text.trim()) return;
    sendChatMessage(text.trim());
    setText("");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/90 px-4 pb-3 pt-12 backdrop-blur-xl">
        <button
          onClick={onBack}
          className="press grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-accent"
          aria-label={tr("backAria")}
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent text-accent-foreground">
          <Icon name="user" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{tr("clientLabel")}</div>
        </div>
      </header>

      <main className="flex-1 space-y-2 px-4 py-4">
        {loading ? (
          <div className="mt-10 flex justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="mt-10 text-center text-xs text-muted-foreground">
            {tr("noMessagesInConversation")}
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex animate-slide-up ${m.sender_id === ownerId ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                  m.sender_id === ownerId
                    ? "rounded-br-sm text-primary-foreground shadow-[var(--shadow-soft)]"
                    : "rounded-bl-sm bg-muted text-foreground"
                }`}
                style={
                  m.sender_id === ownerId ? { background: "var(--gradient-primary)" } : undefined
                }
              >
                {m.text}
                <div
                  className={`mt-0.5 text-right text-[9px] ${m.sender_id === ownerId ? "opacity-80" : "text-muted-foreground"}`}
                >
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </main>

      {canReply ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-card/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-3 backdrop-blur-xl"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tr("typeMessagePlaceholder")}
            className="h-11 flex-1 rounded-full border border-input bg-background px-4 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="press grid h-11 w-11 place-items-center rounded-full text-primary-foreground shadow-[var(--shadow-soft)] disabled:opacity-50"
            style={{ background: "var(--gradient-primary)" }}
            aria-label={tr("sendAria")}
          >
            <Icon name="send" size={18} />
          </button>
        </form>
      ) : (
        <div className="sticky bottom-0 border-t border-border bg-card/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur-xl">
          <button
            onClick={() => navigate({ to: "/subscribe" })}
            className="press flex w-full items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-left"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-600">
              <Icon name="lock" size={16} />
            </span>
            <span className="flex-1">
              <span className="block text-xs font-semibold text-foreground">
                {tr("cannotReplyFreePlan")}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {tr("activateStarterToWriteCustomer")}
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
