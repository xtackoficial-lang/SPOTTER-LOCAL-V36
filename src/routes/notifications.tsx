import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT, useLocale, INTL_TAG } from "@/lib/i18n";
import { registerPushToken } from "@/lib/push-storage";
import { releasePushTokensOfCurrentUser } from "@/lib/push-release";
import { useNotificationsInbox } from "@/lib/notifications-inbox";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notificações — Spotter Local" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const tr = useT();
  const [locale] = useLocale();
  const navigate = useNavigate();
  const { items, markAllRead, clear } = useNotificationsInbox();
  const supported = typeof Notification !== "undefined";
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    supported ? Notification.permission : "unsupported",
  );
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);

  useEffect(() => {
    const t = setTimeout(markAllRead, 1500);
    return () => clearTimeout(t);
  }, [markAllRead]);

  const enable = async () => {
    setBusy(true);
    try {
      await registerPushToken();
      if (supported) setPerm(Notification.permission);
      setOff(false);
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    try {
      await releasePushTokensOfCurrentUser();
      setOff(true);
    } catch {
      /* ignorar */
    } finally {
      setBusy(false);
    }
  };

  const on = perm === "granted" && !off;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="glass-bar sticky top-0 z-10 flex items-center gap-3 border-b border-border px-4 pb-3 pt-12">
        <button
          onClick={() => navigate({ to: "/profile", replace: true })}
          className="press glass-btn grid h-9 w-9 place-items-center rounded-full text-muted-foreground"
          aria-label={tr("back")}
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <h1 className="flex-1 text-base font-bold text-foreground">{tr("notifications")}</h1>
        {items.length > 0 && (
          <button onClick={clear} className="press text-xs font-medium text-primary">
            {tr("notifsClear")}
          </button>
        )}
      </header>

      <main className="flex-1 space-y-4 px-5 py-5">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <Icon name="bell" size={18} className="text-primary" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-foreground">
                {on ? tr("notificationsActiveLabel") : tr("notifsOffTitle")}
              </div>
              <div className="text-xs text-muted-foreground">
                {perm === "denied"
                  ? tr("notificationsBlockedHint")
                  : perm === "unsupported"
                    ? tr("notifsUnsupported")
                    : on
                      ? tr("notifsOnHint")
                      : tr("notifsOffHint")}
              </div>
            </div>
          </div>
          {perm !== "denied" && perm !== "unsupported" && (
            <button
              onClick={on ? disable : enable}
              disabled={busy}
              className="press mt-3 w-full rounded-xl border border-border bg-card py-2.5 text-xs font-semibold text-foreground disabled:opacity-60"
            >
              {on ? tr("notifsTurnOff") : tr("activateAction")}
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {tr("notifsEmpty")}
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((i) => (
              <li
                key={i.id}
                className={`rounded-2xl border bg-card p-4 ${i.read ? "border-border" : "border-primary/50"}`}
              >
                <div className="text-sm font-semibold text-foreground">{i.title}</div>
                {i.body && <div className="mt-0.5 text-xs text-muted-foreground">{i.body}</div>}
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(i.at).toLocaleString(INTL_TAG[locale])}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
