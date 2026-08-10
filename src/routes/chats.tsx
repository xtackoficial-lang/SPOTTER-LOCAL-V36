import { createFileRoute, Link } from "@tanstack/react-router";
import { useChats } from "@/lib/chat-storage";
import { BottomNav } from "@/components/BottomNav";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/chats")({
  head: () => ({ meta: [{ title: "Conversas — Spotter Local" }] }),
  component: ChatsList,
});

function ChatsList() {
  const tr = useT();
  const { threads, hydrated } = useChats();
  const list = Object.values(threads).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="px-5 pb-4 pt-12 animate-slide-up">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {tr("conversationsTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{tr("conversationsSubtitle")}</p>
      </header>

      <main className="flex-1 px-5 pb-6">
        {!hydrated ? null : list.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center animate-pop-in">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
              <Icon name="chat" size={26} />
            </div>
            <div className="mt-4 font-semibold text-foreground">{tr("noConversationsYet")}</div>
            <p className="mt-1 text-xs text-muted-foreground">{tr("openPlaceToStart")}</p>
            <Link
              to="/home"
              className="press mt-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Icon name="compass" size={14} /> {tr("discoverPlaces")}
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card stagger">
            {list.map((t) => {
              const last = t.messages[t.messages.length - 1];
              return (
                <li key={t.placeId}>
                  <Link
                    to="/chat/$id"
                    params={{ id: t.placeId }}
                    className="press flex items-center gap-3 px-4 py-3.5 transition hover:bg-accent/40"
                  >
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
                      <Icon name={t.icon} size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="truncate font-semibold text-foreground">{t.placeName}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(t.updatedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-xs text-muted-foreground">
                          {last?.from === "me" ? tr("youPrefix") : ""}
                          {last?.text}
                        </div>
                        {t.unread > 0 && (
                          <span
                            className="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold text-primary-foreground shadow-[var(--shadow-soft)]"
                            style={{ background: "var(--gradient-primary)" }}
                          >
                            {t.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
