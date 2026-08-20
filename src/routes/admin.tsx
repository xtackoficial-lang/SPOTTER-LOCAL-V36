import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  getMerchants,
  updateMerchant,
  deleteMerchant,
  addMerchant,
  adminLogin,
  adminLogout,
  getAdminSession,
  isLockedOut,
  getLockoutRemaining,
  getFailedAttempts,
  downloadCSV,
  readAuditLog,
  clearAuditLog,
  PLAN_LABELS,
  PLAN_PRICES,
  STATUS_LABELS,
  type MerchantRecord,
  type AdminAuditLog,
  getPaymentConfig,
  savePaymentConfig,
  type PaymentConfig,
  getPaymentProofs,
  reviewPaymentProof,
  type PaymentProof,
  getFeatureFlags,
  toggleFeatureFlag,
  type FeatureFlag,
  fetchAccounts,
  setAccountSuspended,
  type AccountRecord,
} from "@/lib/admin-storage";
import { Icon } from "@/components/Icon";
import {
  useScheduledNotifications,
  createScheduledNotification,
  toggleScheduledNotification,
  deleteScheduledNotification,
  fetchPushLog,
  sendPushNow,
  WEEKDAY_LABELS,
  type ScheduledNotification,
  type PushLogEntry,
} from "@/lib/push-storage";
import { FIREBASE_CONFIGURED } from "@/lib/firebase";
import {
  runBillingEngine,
  computeBillingStats,
  getNotifications,
  markAllRead,
  markNotifRead,
  getUnreadCount,
  activatePlanAfterPayment,
  type BillingNotification,
  type BillingStats,
} from "@/lib/billing-engine";
import { getLocale, setLocale, LOCALE_LIST, t, useT, type Locale } from "@/lib/i18n";
import { activateBoost, getBoostPackage } from "@/lib/boost-storage";
import {
  fetchTheme,
  saveTheme,
  defaultTheme,
  THEME_SCREENS,
  THEME_PRESETS,
  ANIMATIONS,
  type AppTheme,
  type ThemeScreen,
  type ScreenAppearance,
  type AnimationId,
  type BackgroundType,
} from "@/lib/theme-storage";
import { ThemeBackdrop } from "@/components/ThemeBackdrop";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "XTACK Admin — Spotter Local" }] }),
  component: AdminPage,
});

// ── helpers ──────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700",
  trial: "bg-amber-500/15 text-amber-700",
  overdue: "bg-orange-500/15 text-orange-700",
  blocked: "bg-destructive/15 text-destructive",
};
const PLANS = ["free", "starter", "pro", "premium"] as const;
const STATUSES = ["active", "trial", "overdue", "blocked"] as const;

function daysTo(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

// ── Language selector ─────────────────────────────────────────────────
function LangSwitcher() {
  const [locale, setL] = useState<Locale>(getLocale());
  return (
    <div className="flex gap-1">
      {LOCALE_LIST.map((l) => (
        <button
          key={l}
          onClick={() => {
            setLocale(l);
            setL(l);
          }}
          className={`press rounded-lg px-2 py-1 text-[10px] font-bold transition ${locale === l ? "bg-primary text-primary-foreground" : "bg-white/10 text-primary-foreground/70"}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ── Login screen (senha de administrador) ────────────────────────────
// Nota: antes exigia 10 cliques escondidos no logo para revelar o campo
// de senha. Removido (2026-06-30) — Apple/Google proíbem explicitamente
// "funcionalidades escondidas ou não documentadas" e "interruptores
// escondidos" nas guidelines de revisão. Esta rota /admin já é, por si
// só, restrita por senha + bloqueio de tentativas; não precisa também
// de um gesto secreto para ser legítima — só precisa de não enganar o
// utilizador, e um campo de senha visível não engana ninguém.
function AdminLogin({ onAuth }: { onAuth: () => void }) {
  const tr = useT();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<"wrong" | "locked" | null>(null);
  const [attempts, setAttempts] = useState(getFailedAttempts());
  const [lockoutRemain, setLockoutRemain] = useState(getLockoutRemaining());

  useEffect(() => {
    if (lockoutRemain <= 0) return;
    const iv = setInterval(() => {
      const r = getLockoutRemaining();
      setLockoutRemain(r);
      if (r <= 0) {
        setErr(null);
        clearInterval(iv);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [lockoutRemain]);

  const submit = async () => {
    if (isLockedOut()) {
      setErr("locked");
      return;
    }
    const result = await adminLogin(pw);
    if (result === "ok") {
      setErr(null);
      onAuth();
    } else if (result === "locked") {
      setErr("locked");
      setLockoutRemain(getLockoutRemaining());
    } else {
      setErr("wrong");
      setAttempts(getFailedAttempts());
      if (isLockedOut()) {
        setErr("locked");
        setLockoutRemain(getLockoutRemaining());
      }
    }
  };

  const mins = Math.ceil(lockoutRemain / 60000);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-primary/10">
            <Icon name="lock" size={28} className="text-primary" />
          </div>
          <div className="text-xl font-bold tracking-tight text-foreground">XTACK Admin</div>
          <div className="mt-1 text-xs text-muted-foreground">Painel restrito — XTACK OFICIAL</div>
        </div>

        <div className="animate-slide-up space-y-3">
          {err === "locked" ? (
            <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-4 text-center">
              <div className="text-sm font-semibold text-destructive">Conta bloqueada</div>
              <div className="mt-1 text-xs text-destructive/70">Tenta novamente em {mins} min.</div>
            </div>
          ) : (
            <>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder={tr("adminPasswordLabel")}
                className="h-12 w-full rounded-2xl border border-input bg-card px-4 text-sm outline-none focus:border-primary"
                autoFocus
              />
              {err === "wrong" && (
                <div className="text-xs text-destructive text-center">
                  Senha incorrecta · {5 - attempts} tentativas restantes
                </div>
              )}
              <button
                onClick={submit}
                className="press h-12 w-full rounded-2xl text-sm font-semibold text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                Entrar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Merchant Modal ────────────────────────────────────────────────────
function MerchantModal({
  merchant,
  onClose,
  onSave,
  onDelete,
}: {
  merchant: MerchantRecord | null;
  onClose: () => void;
  onSave: (id: string, patch: Partial<MerchantRecord>) => void;
  onDelete: (id: string) => void;
}) {
  const tr = useT();
  const isNew = merchant === null;
  const [form, setForm] = useState<Partial<MerchantRecord>>(
    merchant ?? {
      businessName: "",
      ownerName: "",
      category: "restaurant",
      city: "Maputo",
      phone: "",
      planId: "free",
      status: "active",
      joinedAt: new Date().toISOString(),
      renewsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      paymentMethod: null,
      productCount: 0,
    },
  );
  const [confirmDel, setConfirmDel] = useState(false);

  const set = <K extends keyof MerchantRecord>(k: K, v: MerchantRecord[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.businessName || !form.ownerName || !form.phone) return;
    onSave(isNew ? "__new__" : merchant!.id, form);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-card p-5 pb-10 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-bold text-foreground">
            {isNew ? tr("adminNewMerchant") : tr("adminEditMerchant")}
          </div>
          <button
            onClick={onClose}
            className="press grid h-8 w-8 place-items-center rounded-full bg-muted"
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label={tr("adminBusinessName")}>
            <input
              value={form.businessName ?? ""}
              onChange={(e) => set("businessName", e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label={tr("adminOwnerNameLabel")}>
            <input
              value={form.ownerName ?? ""}
              onChange={(e) => set("ownerName", e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label={tr("adminPhone")}>
            <input
              value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label={tr("adminCity")}>
            <select
              value={form.city ?? tr("adminDefaultCity")}
              onChange={(e) => set("city", e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            >
              {["Maputo", "Inhambane", "Beira", "Nampula", "Tofo", "Maxixe"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("adminPlanLabel")}>
              <select
                value={form.planId ?? "starter"}
                onChange={(e) => set("planId", e.target.value as MerchantRecord["planId"])}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              >
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {PLAN_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={tr("adminStatusLabel")}>
              <select
                value={form.status ?? "trial"}
                onChange={(e) => set("status", e.target.value as MerchantRecord["status"])}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={tr("adminMethodLabel")}>
            <select
              value={form.paymentMethod ?? ""}
              onChange={(e) =>
                set("paymentMethod", (e.target.value || null) as MerchantRecord["paymentMethod"])
              }
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">—</option>
              <option value="mpesa">M-Pesa</option>
              <option value="emola">e-Mola</option>
              <option value="manual">Manual / Banco</option>
            </select>
          </Field>
          <Field label={tr("adminNotesLabel")}>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>

        <button
          onClick={save}
          className="press mt-5 h-12 w-full rounded-2xl text-sm font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          {isNew ? tr("adminCreateMerchantAction") : tr("saveChangesAction")}
        </button>

        {!isNew &&
          (confirmDel ? (
            <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 space-y-3">
              <div className="text-sm font-semibold text-destructive text-center">
                Confirmar eliminação?
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDel(false)}
                  className="press flex-1 h-10 rounded-xl border border-border bg-muted text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    onDelete(merchant!.id);
                    onClose();
                  }}
                  className="press flex-1 h-10 rounded-xl bg-destructive text-sm font-medium text-white"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDel(true)}
              className="press mt-3 h-10 w-full rounded-xl border border-destructive/30 text-xs text-destructive"
            >
              Eliminar comerciante
            </button>
          ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────
function ReportsTab({ merchants }: { merchants: MerchantRecord[] }) {
  const tr = useT();
  const byCity: Record<string, number> = {};
  merchants.forEach((m) => {
    byCity[m.city] = (byCity[m.city] ?? 0) + 1;
  });
  const topCities = Object.entries(byCity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const mrr = merchants
    .filter((m) => m.status === "active")
    .reduce((s, m) => s + PLAN_PRICES[m.planId], 0);
  const churnRisk = merchants.filter(
    (m) => m.status === "overdue" || m.status === "blocked",
  ).length;

  // ── Negócios Free vs Pagos por semana ──────────────────────────────
  // Agrupa por data de entrada (joinedAt) nas últimas 8 semanas. Não é
  // um histórico de mudanças de plano (não temos esse log ainda) — é
  // "quantos comerciantes que entraram nesta semana estão hoje no Free
  // vs num plano pago", o que já dá uma boa leitura da conversão ao
  // longo do tempo sem precisar de uma tabela de eventos nova.
  const WEEKS = 8;
  const startOfWeek = (d: Date) => {
    const x = new Date(d);
    const day = x.getDay();
    const diff = (day + 6) % 7; // semana começa à segunda-feira
    x.setDate(x.getDate() - diff);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const now = new Date();
  const weekBuckets: { label: string; start: Date; free: number; paid: number }[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const start = startOfWeek(new Date(now.getTime() - i * 7 * 86400000));
    weekBuckets.push({
      label: `${start.getDate()}/${start.getMonth() + 1}`,
      start,
      free: 0,
      paid: 0,
    });
  }
  merchants.forEach((m) => {
    const joined = startOfWeek(new Date(m.joinedAt));
    const bucket = weekBuckets.find((w) => w.start.getTime() === joined.getTime());
    if (!bucket) return; // entrou antes da janela das últimas 8 semanas
    if (m.planId === "free") bucket.free += 1;
    else bucket.paid += 1;
  });
  const maxWeekTotal = Math.max(1, ...weekBuckets.map((w) => w.free + w.paid));
  const totalFreeAll = merchants.filter((m) => m.planId === "free").length;
  const totalPaidAll = merchants.length - totalFreeAll;
  const conversionPct =
    merchants.length > 0 ? Math.round((totalPaidAll / merchants.length) * 100) : 0;

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="grid grid-cols-2 gap-3">
        {[
          {
            label: tr("adminTotalMerchantsLabel"),
            value: merchants.length,
            color: "bg-blue-500/15 text-blue-700",
          },
          {
            label: "MRR",
            value: `${mrr.toLocaleString()} MZN`,
            color: "bg-emerald-500/15 text-emerald-700",
          },
          { label: "Risco de Churn", value: churnRisk, color: "bg-red-500/15 text-red-700" },
          {
            label: tr("adminActiveCitiesLabel"),
            value: Object.keys(byCity).length,
            color: "bg-violet-500/15 text-violet-700",
          },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl p-4 ${s.color}`}>
            <div className="text-xl font-bold">{s.value}</div>
            <div className="text-[10px] font-semibold mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">Free vs Pagos · 8 semanas</div>
          <div className="text-xs font-semibold text-emerald-600">{conversionPct}% pagos hoje</div>
        </div>
        <div className="flex items-end gap-2" style={{ height: 120 }}>
          {weekBuckets.map((w) => {
            const total = w.free + w.paid;
            const totalHeight = total === 0 ? 4 : Math.max(8, (total / maxWeekTotal) * 110);
            const paidHeight = total === 0 ? 0 : (w.paid / total) * totalHeight;
            const freeHeight = totalHeight - paidHeight;
            return (
              <div key={w.label} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-col justify-end" style={{ height: 110 }}>
                  <div
                    className="w-full rounded-t-sm bg-muted-foreground/30"
                    style={{ height: freeHeight }}
                    title={`${w.free} Free`}
                  />
                  <div
                    className="w-full rounded-t-sm"
                    style={{ height: paidHeight, background: "var(--gradient-primary)" }}
                    title={`${w.paid} Pagos`}
                  />
                </div>
                <div className="text-[9px] text-muted-foreground">{w.label}</div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: "var(--gradient-primary)" }}
            />
            Pagos ({totalPaidAll})
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" />
            Free ({totalFreeAll})
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Agrupado pela semana em que cada comerciante entrou, com o plano que tem hoje.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="text-sm font-semibold text-foreground">Top Cidades</div>
        {topCities.map(([city, count]) => {
          const pct = Math.round((count / merchants.length) * 100);
          return (
            <div key={city}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-foreground">{city}</div>
                <div className="text-xs font-semibold text-foreground">
                  {count} ({pct}%)
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: "var(--gradient-primary)" }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <div className="text-sm font-semibold text-foreground">Distribuição por plano</div>
        {PLANS.map((plan) => {
          const count = merchants.filter((m) => m.planId === plan).length;
          const rev = merchants
            .filter((m) => m.planId === plan && m.status === "active")
            .reduce((s, m) => s + PLAN_PRICES[m.planId], 0);
          return (
            <div key={plan} className="flex items-center justify-between text-sm">
              <span className="capitalize text-foreground font-medium">{PLAN_LABELS[plan]}</span>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{count} comerciantes</span>
                <span className="font-semibold text-foreground">
                  {rev.toLocaleString()} MZN/mês
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => downloadCSV()}
        className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm font-medium text-foreground"
      >
        <Icon name="download" size={16} /> {tr("adminExportCsvAction")}
      </button>
    </div>
  );
}

// ── Audit Tab ─────────────────────────────────────────────────────────
function AuditTab() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    readAuditLog().then(setLogs);
  }, []);
  return (
    <div className="space-y-3 animate-slide-up">
      {logs.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          Sem registos de auditoria
        </div>
      ) : (
        <>
          {logs.slice(0, 50).map((l) => (
            <div key={l.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold text-foreground">{l.action}</div>
                <div className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(l.at).toLocaleString("pt-MZ")}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {l.target} · {l.detail}
              </div>
            </div>
          ))}
          {confirmClear ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 space-y-2">
              <div className="text-sm font-semibold text-destructive text-center">
                Limpar todos os logs?
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmClear(false)}
                  className="press flex-1 h-10 rounded-xl border border-border bg-muted text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    clearAuditLog();
                    setLogs([]);
                    setConfirmClear(false);
                  }}
                  className="press flex-1 h-10 rounded-xl bg-destructive text-sm text-white"
                >
                  Limpar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="press h-10 w-full rounded-xl border border-destructive/30 text-xs text-destructive"
            >
              Limpar log de auditoria
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PaymentsTab() {
  const tr = useT();
  const [config, setConfig] = useState<PaymentConfig>({
    mpesa: "",
    emola: "",
    mpesaName: "",
    emolaName: "",
    updatedAt: "",
  });
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed" | "rejected">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "plan" | "boost">("all");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getPaymentConfig(), getPaymentProofs()]).then(([cfg, pfs]) => {
      setConfig(cfg);
      setProofs(pfs);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    await savePaymentConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // IMPORTANTE: confirmar um comprovativo tem de activar o plano de facto —
  // antes, isto só mudava o estado visual do comprovativo (pending →
  // confirmed) sem nunca chamar activatePlanAfterPayment(), deixando a
  // conta do comerciante presa em "trial"/"overdue" mesmo depois de
  // aprovada. Agora: ao confirmar, activa o plano no Supabase + merchants
  // locais usando o businessId que veio junto do comprovativo.
  const handleReview = async (proof: PaymentProof, status: "confirmed" | "rejected") => {
    setReviewError(null);
    setReviewingId(proof.id);
    try {
      if (status === "confirmed") {
        if (!proof.businessId) {
          setReviewError(
            `Comprovativo de "${proof.businessName}" não tem ID de negócio associado — não foi possível activar automaticamente. Active manualmente na aba Comerciantes.`,
          );
        } else if (proof.plan === "boost") {
          await activateBoost(proof.businessId, proof.boostPackageId ?? "1d", proof.id);
        } else {
          await activatePlanAfterPayment(
            proof.businessId,
            proof.plan,
            proof.id,
            proof.businessName,
          );
        }
      }
      const updated = await reviewPaymentProof(proof.id, status);
      setProofs(updated);
    } finally {
      setReviewingId(null);
    }
  };

  const filtered = proofs.filter((p) => {
    const matchStatus = filter === "all" || p.status === filter;
    const matchType =
      typeFilter === "all" || (typeFilter === "boost" ? p.plan === "boost" : p.plan !== "boost");
    return matchStatus && matchType;
  });

  const PROOF_COLOR: Record<string, string> = {
    pending: "bg-amber-500/10 border-amber-300/30 text-amber-700",
    confirmed: "bg-emerald-500/10 border-emerald-300/30 text-emerald-700",
    rejected: "bg-red-500/10 border-red-300/30 text-red-700",
  };

  return (
    <div className="space-y-5 animate-slide-up">
      {reviewError && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-300/40 bg-amber-500/10 p-3.5 text-sm text-amber-700">
          <Icon name="alert" size={16} className="shrink-0 mt-0.5" />
          <span>{reviewError}</span>
        </div>
      )}
      {/* Config de números */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon name="phone" size={15} /> {tr("adminXtackPaymentNumbersTitle")}
        </div>
        <Field label={tr("adminMpesaNumberLabel")}>
          <input
            value={config.mpesa}
            onChange={(e) => setConfig((c) => ({ ...c, mpesa: e.target.value }))}
            placeholder="+258 84x xxx xxxx"
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label={tr("adminMpesaOwnerLabel")}>
          <input
            value={config.mpesaName}
            onChange={(e) => setConfig((c) => ({ ...c, mpesaName: e.target.value }))}
            placeholder={tr("xtackOfficialName")}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label={tr("adminEmolaNumberLabel")}>
          <input
            value={config.emola}
            onChange={(e) => setConfig((c) => ({ ...c, emola: e.target.value }))}
            placeholder="+258 86x xxx xxxx"
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label={tr("adminEmolaOwnerLabel")}>
          <input
            value={config.emolaName}
            onChange={(e) => setConfig((c) => ({ ...c, emolaName: e.target.value }))}
            placeholder={tr("xtackOfficialName")}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          />
        </Field>
        <button
          onClick={handleSave}
          className="press flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          {saved ? (
            <>
              <Icon name="check" size={15} /> {tr("adminSavedLabel")}
            </>
          ) : (
            tr("adminSaveNumbersAction")
          )}
        </button>
      </div>

      {/* Comprovantes recebidos */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon name="fileText" size={15} /> {tr("adminPaymentProofsTitle")}
        </div>

        {/* Tipo: Plano mensal vs Turbinar — antes vinham todos misturados,
            sem distinção visual entre uma mensalidade e um boost de 1/7/30
            dias, o que tornava difícil perceber rapidamente o que é cada
            pedido. */}
        <div className="flex gap-2">
          {(
            [
              { id: "all", label: "Todos" },
              { id: "plan", label: "Planos" },
              { id: "boost", label: "Turbinar" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              className={`press flex-1 rounded-xl py-1.5 text-[11px] font-semibold transition ${
                typeFilter === f.id
                  ? "text-primary-foreground"
                  : "border border-border bg-muted text-muted-foreground"
              }`}
              style={typeFilter === f.id ? { background: "var(--gradient-primary)" } : undefined}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(["all", "pending", "confirmed", "rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`press shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition ${filter === f ? "text-primary-foreground" : "border border-border bg-muted text-muted-foreground"}`}
              style={filter === f ? { background: "var(--gradient-primary)" } : undefined}
            >
              {f === "all"
                ? tr("adminAllLabel")
                : f === "pending"
                  ? tr("adminPendingLabel")
                  : f === "confirmed"
                    ? tr("adminConfirmedLabel")
                    : tr("adminRejectedLabel")}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Sem comprovativos</div>
        ) : (
          filtered.map((p) => (
            <div key={p.id} className={`rounded-2xl border p-4 space-y-2 ${PROOF_COLOR[p.status]}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  {p.plan === "boost" && (
                    <Icon name="flame" size={12} className="shrink-0 text-amber-600" />
                  )}
                  {p.businessName}
                </div>
                <span
                  className={`text-[9px] font-bold uppercase rounded-full px-2 py-0.5 ${p.status === "pending" ? "bg-amber-500/20" : p.status === "confirmed" ? "bg-emerald-500/20" : "bg-red-500/20"}`}
                >
                  {p.status === "pending"
                    ? "Pendente"
                    : p.status === "confirmed"
                      ? "Confirmado"
                      : "Rejeitado"}
                </span>
              </div>
              <div className="text-[11px]">
                {p.method.toUpperCase()} · {p.amount} MZN ·{" "}
                {p.plan === "boost"
                  ? `Turbinar ${getBoostPackage(p.boostPackageId ?? "1d").label}`
                  : `Plano ${PLAN_LABELS[p.plan]}`}
              </div>
              {p.proofNote ? (
                <div className="text-[11px] italic">"{p.proofNote}"</div>
              ) : (
                <div className="text-[11px] italic text-amber-600 flex items-center gap-1">
                  <Icon name="alert" size={10} /> Sem nota — cruza com o teu extrato M-Pesa/e-Mola
                </div>
              )}
              <div className="text-[10px] opacity-70">
                {new Date(p.submittedAt).toLocaleString("pt-MZ")}
              </div>
              {!p.businessId && p.status === "pending" && (
                <div className="text-[10px] text-amber-700 flex items-center gap-1">
                  <Icon name="alert" size={11} /> {tr("adminNoBusinessIdWarning")}
                </div>
              )}
              {p.status === "pending" && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleReview(p, "confirmed")}
                    disabled={reviewingId === p.id}
                    className="press flex flex-1 items-center justify-center gap-1 h-8 rounded-xl bg-emerald-600 text-[11px] font-semibold text-white disabled:opacity-60"
                  >
                    <Icon name="check" size={12} />{" "}
                    {reviewingId === p.id ? tr("adminActivatingAction") : tr("adminConfirmAction")}
                  </button>
                  <button
                    onClick={() => handleReview(p, "rejected")}
                    disabled={reviewingId === p.id}
                    className="press flex flex-1 items-center justify-center gap-1 h-8 rounded-xl bg-red-500/20 border border-red-400/30 text-[11px] font-semibold text-red-700 disabled:opacity-60"
                  >
                    <Icon name="x" size={12} /> Rejeitar
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Feature Flags Tab ─────────────────────────────────────────────────
function FlagsTab() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(true);

  useEffect(() => {
    getFeatureFlags().then((f) => {
      setFlags(f);
      setFlagsLoading(false);
    });
  }, []);

  const handleToggle = (key: string, enabled: boolean) => {
    toggleFeatureFlag(key, enabled).then(setFlags);
  };

  return (
    <div className="space-y-3 animate-slide-up">
      <div className="rounded-2xl border border-blue-300/30 bg-blue-500/10 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
          <Icon name="flag" size={13} /> Feature Flags
        </div>
        <div className="text-[11px] text-blue-600 mt-1">
          Liga/desliga funcionalidades do app sem precisar publicar uma nova versão.
        </div>
      </div>
      {flags.map((flag) => (
        <div
          key={flag.key}
          className="rounded-2xl border border-border bg-card p-4 flex items-start justify-between gap-3"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">{flag.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{flag.description}</div>
            <div className="text-[10px] text-muted-foreground/60 mt-1">
              Actualizado: {new Date(flag.updatedAt).toLocaleDateString("pt-MZ")}
            </div>
          </div>
          <button
            onClick={() => handleToggle(flag.key, !flag.enabled)}
            className={`press shrink-0 h-7 w-12 rounded-full transition-colors ${flag.enabled ? "" : "bg-muted"}`}
            style={flag.enabled ? { background: "var(--gradient-primary)" } : undefined}
          >
            <div
              className={`h-5 w-5 rounded-full bg-white shadow transition-transform mx-1 ${flag.enabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Push Notifications Tab ────────────────────────────────────────────
function PushTab({ merchants }: { merchants: MerchantRecord[] }) {
  const tr = useT();
  const { items: scheduled, loading: scheduledLoading, reload } = useScheduledNotifications();
  const [log, setLog] = useState<PushLogEntry[]>([]);
  const [mode, setMode] = useState<"custom" | "auto_visit">("custom");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<ScheduledNotification["target"]>("all");
  const [city, setCity] = useState("");
  const [scheduleType, setScheduleType] = useState<"once" | "weekly">("once");
  const [sendDate, setSendDate] = useState("");
  const [sendHour, setSendHour] = useState(9);
  const [sendMinute, setSendMinute] = useState(0);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchPushLog().then(setLog);
  }, []);

  const TARGETS: { id: ScheduledNotification["target"]; label: string; desc: string }[] = [
    { id: "all", label: "Todos", desc: "Todos os utilizadores e comerciantes" },
    { id: "merchants", label: "Comerciantes", desc: "Apenas contas de comerciantes" },
    { id: "premium_merchants", label: "Premium", desc: "Comerciantes com plano Premium" },
    {
      id: "personal_users",
      label: "Utilizadores",
      desc: "Apenas contas pessoais (não comerciantes)",
    },
    { id: "inactive_users", label: "Inactivos", desc: "Utilizadores sem actividade há 7+ dias" },
  ];

  const estimateReach = () => {
    if (target === "merchants") return merchants.length;
    if (target === "premium_merchants")
      return merchants.filter((m) => m.planId === "premium").length;
    if (target === "inactive_users") return Math.round(merchants.length * 1.5);
    return merchants.length * 3;
  };

  function toggleWeekday(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function resetForm() {
    setTitle("");
    setBody("");
    setCity("");
    setWeekdays([]);
    setSendDate("");
  }

  // Agenda a campanha (grava em scheduled_notifications) — o envio real
  // acontece depois, disparado pelo cron job que invoca a Edge Function.
  async function handleSchedule() {
    if (mode === "custom" && (!title.trim() || !body.trim())) return;
    setSending(true);
    setSendMsg(null);
    const { error } = await createScheduledNotification({
      title: mode === "custom" ? title.trim() : "Notificação automática",
      body: mode === "custom" ? body.trim() : "Olá {nome}, gostarias de visitar {local}?",
      mode,
      target,
      city: city || null,
      schedule_type: scheduleType,
      send_at:
        scheduleType === "once" && sendDate
          ? new Date(
              `${sendDate}T${String(sendHour).padStart(2, "0")}:${String(sendMinute).padStart(2, "0")}:00+02:00`,
            ).toISOString()
          : null,
      weekdays: scheduleType === "weekly" ? weekdays : null,
      send_hour: sendHour,
      send_minute: sendMinute,
    });
    setSending(false);
    setSendMsg(
      error ? { ok: false, text: error } : { ok: true, text: tr("adminNotifScheduledOk") },
    );
    if (!error) {
      resetForm();
      reload();
    }
    setTimeout(() => setSendMsg(null), 5000);
  }

  // Dispara imediatamente, sem agendamento — útil para avisos urgentes.
  async function handleSendNow() {
    if (mode === "custom" && (!title.trim() || !body.trim())) return;
    setSending(true);
    setSendMsg(null);
    const { error, result } = await sendPushNow({
      title: mode === "custom" ? title.trim() : "Notificação automática",
      body: mode === "custom" ? body.trim() : "Olá {nome}, gostarias de visitar {local}?",
      mode,
      target,
      city: city || undefined,
    });
    setSending(false);
    setSendMsg(
      error
        ? { ok: false, text: error }
        : {
            ok: true,
            text: `Enviado a ${result?.success ?? 0} de ${result?.recipients ?? 0} destinatários.`,
          },
    );
    if (!error) {
      resetForm();
      fetchPushLog().then(setLog);
    }
    setTimeout(() => setSendMsg(null), 6000);
  }

  return (
    <div className="space-y-4 animate-slide-up">
      {!FIREBASE_CONFIGURED && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-xs text-amber-700">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          <span>
            Firebase ainda não está configurado. As notificações podem ser agendadas aqui, mas só
            chegam de facto aos telemóveis depois de configurar o Firebase Cloud Messaging — ver
            FIREBASE_SETUP.md.
          </span>
        </div>
      )}

      {/* Formulário */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon name="megaphone" size={15} /> {tr("adminNotifTitle")}
        </div>

        {/* Modo */}
        <Field label={tr("adminMsgTypeLabel")}>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setMode("custom")}
              className={`press rounded-xl border p-2.5 text-left text-xs font-medium transition ${mode === "custom" ? "border-primary bg-primary/5 text-primary" : "border-border bg-muted/30 text-muted-foreground"}`}
            >
              Texto livre
            </button>
            <button
              onClick={() => setMode("auto_visit")}
              className={`press rounded-xl border p-2.5 text-left text-xs font-medium transition ${mode === "auto_visit" ? "border-primary bg-primary/5 text-primary" : "border-border bg-muted/30 text-muted-foreground"}`}
            >
              Automática personalizada
            </button>
          </div>
        </Field>

        {mode === "custom" ? (
          <>
            <Field label={tr("adminNotifTitleLabel")}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tr("adminNotifTitlePlaceholder")}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label={tr("adminNotifBodyLabel")}>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={tr("adminNotifBodyPlaceholder")}
                rows={3}
                className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
          </>
        ) : (
          <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
            Cada pessoa recebe uma mensagem com o seu próprio nome e um negócio sugerido perto de
            si, por exemplo:
            <div className="mt-1.5 rounded-lg bg-background px-2.5 py-2 text-foreground">
              "Olá Carla, gostarias de visitar <strong>Bom Gosto Restaurante</strong>?"
            </div>
          </div>
        )}

        <Field label={tr("adminAudienceLabel")}>
          <div className="space-y-2">
            {TARGETS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTarget(t.id)}
                className={`press flex w-full items-center gap-3 rounded-xl border p-3 transition ${target === t.id ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}
              >
                <div
                  className={`grid h-4 w-4 place-items-center rounded-full border-2 transition ${target === t.id ? "border-primary bg-primary" : "border-border"}`}
                >
                  {target === t.id && (
                    <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  )}
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold text-foreground">{t.label}</div>
                  <div className="text-[10px] text-muted-foreground">{t.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </Field>
        <Field label={tr("adminCityFilterLabel")}>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          >
            <option value="">Todas as cidades</option>
            {["Maputo", "Inhambane", "Beira", "Nampula", "Tofo", "Maxixe"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        {/* Agendamento */}
        <Field label={tr("adminWhenToSendLabel")}>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <button
              onClick={() => setScheduleType("once")}
              className={`press rounded-xl border p-2.5 text-xs font-medium transition ${scheduleType === "once" ? "border-primary bg-primary/5 text-primary" : "border-border bg-muted/30 text-muted-foreground"}`}
            >
              Uma vez (data fixa)
            </button>
            <button
              onClick={() => setScheduleType("weekly")}
              className={`press rounded-xl border p-2.5 text-xs font-medium transition ${scheduleType === "weekly" ? "border-primary bg-primary/5 text-primary" : "border-border bg-muted/30 text-muted-foreground"}`}
            >
              Repetir semanalmente
            </button>
          </div>

          {scheduleType === "once" && (
            <input
              type="date"
              value={sendDate}
              onChange={(e) => setSendDate(e.target.value)}
              className="mb-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />
          )}

          {scheduleType === "weekly" && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleWeekday(idx)}
                  className={`press rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${weekdays.includes(idx) ? "bg-primary text-primary-foreground" : "border border-border bg-muted/30 text-muted-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <select
              value={sendHour}
              onChange={(e) => setSendHour(Number(e.target.value))}
              className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}h
                </option>
              ))}
            </select>
            <select
              value={sendMinute}
              onChange={(e) => setSendMinute(Number(e.target.value))}
              className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            >
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")} min
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Hora local de Moçambique (Maputo, UTC+2).
          </p>
        </Field>

        <div className="flex items-center gap-1.5 rounded-xl bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
          <Icon name="chart" size={13} className="shrink-0" />
          <span>
            Alcance estimado:{" "}
            <span className="font-semibold text-foreground">
              {estimateReach().toLocaleString()} utilizadores
            </span>
          </span>
        </div>

        {sendMsg && (
          <div
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs ${sendMsg.ok ? "bg-emerald-500/10 text-emerald-700 border border-emerald-300/30" : "bg-amber-500/10 text-amber-700 border border-amber-300/30"}`}
          >
            <Icon name={sendMsg.ok ? "check" : "alert"} size={13} className="shrink-0" />
            {sendMsg.text}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSchedule}
            disabled={(mode === "custom" && (!title.trim() || !body.trim())) || sending}
            className="press h-11 flex-1 rounded-xl border border-primary text-sm font-semibold text-primary disabled:opacity-50"
          >
            Agendar
          </button>
          <button
            onClick={handleSendNow}
            disabled={(mode === "custom" && (!title.trim() || !body.trim())) || sending}
            className="press h-11 flex-1 rounded-xl text-sm font-semibold text-primary-foreground disabled:opacity-50"
            style={{ background: "var(--gradient-primary)" }}
          >
            {sending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                A enviar…
              </span>
            ) : (
              tr("adminSendNowAction")
            )}
          </button>
        </div>
      </div>

      {/* Agendamentos activos */}
      {!scheduledLoading && scheduled.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-semibold text-foreground">Notificações agendadas</div>
          {scheduled.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold text-foreground">
                  {s.mode === "auto_visit" ? tr("adminAutoPersonalized") : s.title}
                </div>
                <button
                  role="switch"
                  aria-checked={s.active}
                  onClick={async () => {
                    await toggleScheduledNotification(s.id, !s.active);
                    reload();
                  }}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${s.active ? "bg-primary" : "bg-muted-foreground/30"}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${s.active ? "translate-x-4" : "translate-x-0.5"}`}
                  />
                </button>
              </div>
              <div className="text-[11px] text-muted-foreground">{s.body}</div>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/70">
                <span>
                  {s.target}
                  {s.city ? ` · ${s.city}` : ""}
                </span>
                <span>
                  {String(s.send_hour).padStart(2, "0")}:{String(s.send_minute).padStart(2, "0")}
                </span>
                <span>
                  {s.schedule_type === "weekly"
                    ? (s.weekdays ?? []).map((d) => WEEKDAY_LABELS[d]).join(", ")
                    : s.send_at
                      ? new Date(s.send_at).toLocaleDateString("pt-MZ")
                      : "—"}
                </span>
                {s.last_sent_at && (
                  <span>Último envio: {new Date(s.last_sent_at).toLocaleDateString("pt-MZ")}</span>
                )}
              </div>
              <button
                onClick={async () => {
                  await deleteScheduledNotification(s.id);
                  reload();
                }}
                className="text-[10px] font-medium text-destructive"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Histórico real de envios */}
      {log.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-semibold text-foreground">Histórico de envios</div>
          {log.slice(0, 10).map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-muted/30 p-3 space-y-1">
              <div className="text-xs font-semibold text-foreground">{c.title}</div>
              <div className="text-[11px] text-muted-foreground">{c.body}</div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70">
                <span>{c.target ?? "—"}</span>
                <span>
                  {c.success_count}/{c.recipients_count} entregues
                </span>
                <span>{new Date(c.sent_at).toLocaleString("pt-MZ")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Aparência / Temas sazonais Tab (v14) ────────────────────────────────
// Limite generoso mas seguro: o JSON do tema completo (com a imagem em
// base64 lá dentro) é descarregado por TODOS os utilizadores em TODOS os
// carregamentos do app — não só pelo admin que fez o upload. Uma foto de
// telemóvel normal (5-10MB+) sem este limite tornava o app lento para
// todos. Base64 tem ~33% de overhead, por isso o limite no ficheiro
// original é menor do que o limite final em base64.
const MAX_THEME_IMAGE_BYTES = 600 * 1024; // 600 KB no ficheiro original

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AppearanceTab() {
  const tr = useT();
  const BG_TYPE_LABELS: Record<BackgroundType, string> = {
    gradient: "Gradiente",
    color: tr("adminSolidColorLabel"),
    image: tr("adminImageLabel"),
  };
  const [theme, setTheme] = useState<AppTheme>(defaultTheme());
  const [loading, setLoading] = useState(true);
  const [activeScreen, setActiveScreen] = useState<ThemeScreen>("login");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchTheme().then((t) => {
      setTheme(t);
      setLoading(false);
    });
  }, []);

  const screen = theme.screens[activeScreen];

  function patchScreen(patch: Partial<ScreenAppearance>) {
    setTheme((prev) => ({
      ...prev,
      screens: { ...prev.screens, [activeScreen]: { ...prev.screens[activeScreen], ...patch } },
    }));
  }

  function applyPreset(presetId: string) {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const built = preset.build();
    setTheme((prev) => ({ ...prev, themeName: built.themeName, screens: built.screens }));
  }

  async function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_THEME_IMAGE_BYTES) {
      setSaveMsg({
        ok: false,
        text: `Imagem demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Use uma imagem até ${(MAX_THEME_IMAGE_BYTES / 1024).toFixed(0)} KB — esta imagem é carregada por todos os utilizadores em todas as páginas, e uma foto muito grande torna o app lento para todos.`,
      });
      e.target.value = "";
      return;
    }
    const b64 = await readFileAsBase64(file);
    patchScreen({ backgroundType: "image", backgroundValue: b64 });
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    const { error } = await saveTheme(theme);
    setSaving(false);
    setSaveMsg(
      error ? { ok: false, text: error } : { ok: true, text: tr("adminThemePublishedOk") },
    );
    setTimeout(() => setSaveMsg(null), 5000);
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Pacotes sazonais */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon name="sparkles" size={15} /> {tr("adminPackagesTitle")}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Aplique um tema completo com um toque (fundo, animação e textos da página de login e
          início). Pode afinar tudo a seguir.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={`press flex items-center gap-2 rounded-xl border p-2.5 text-left transition ${
                theme.themeName === p.label
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/30"
              }`}
            >
              <span className="text-lg leading-none">{p.emoji}</span>
              <span className="text-xs font-medium text-foreground">{p.label}</span>
            </button>
          ))}
        </div>
        {theme.themeName !== "Padrão" && (
          <div className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-[11px] font-medium text-primary">
            <Icon name="check" size={13} /> {tr("adminThemeActivePrefix")} {theme.themeName}
          </div>
        )}
      </div>

      {/* Selecção de cenário */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon name="image" size={15} /> {tr("adminCustomizeByPageTitle")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {THEME_SCREENS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveScreen(s.id)}
              className={`press rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                activeScreen === s.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-muted/30 text-muted-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Toggle activar/desactivar este cenário */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2.5">
          <div>
            <div className="text-xs font-semibold text-foreground">
              Usar tema personalizado nesta página
            </div>
            <div className="text-[10px] text-muted-foreground">
              Desactivado, esta página mantém o visual padrão da app.
            </div>
          </div>
          <button
            role="switch"
            aria-checked={screen.enabled}
            onClick={() => patchScreen({ enabled: !screen.enabled })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              screen.enabled ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                screen.enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {screen.enabled && (
          <div className="space-y-3 animate-slide-up">
            {/* Tipo de fundo */}
            <Field label={tr("adminBgTypeLabel")}>
              <div className="flex gap-1.5">
                {(Object.keys(BG_TYPE_LABELS) as BackgroundType[]).map((bt) => (
                  <button
                    key={bt}
                    onClick={() => patchScreen({ backgroundType: bt })}
                    className={`press flex-1 rounded-xl border py-2 text-xs font-semibold transition ${
                      screen.backgroundType === bt
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    {BG_TYPE_LABELS[bt]}
                  </button>
                ))}
              </div>
            </Field>

            {screen.backgroundType === "image" ? (
              <Field label={tr("adminBgImageLabel")}>
                <label className="press flex h-28 w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 text-xs text-muted-foreground overflow-hidden">
                  {screen.backgroundValue?.startsWith("data:") ||
                  screen.backgroundValue?.startsWith("http") ? (
                    <img
                      src={screen.backgroundValue}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex flex-col items-center gap-1">
                      <Icon name="camera" size={20} /> {tr("adminLoadImageAction")}
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadImage}
                  />
                </label>
              </Field>
            ) : (
              <Field
                label={
                  screen.backgroundType === "color"
                    ? tr("adminSolidColorLabel")
                    : tr("adminGradientCssLabel")
                }
              >
                <input
                  value={screen.backgroundValue}
                  onChange={(e) => patchScreen({ backgroundValue: e.target.value })}
                  placeholder={
                    screen.backgroundType === "color"
                      ? "#1a1a2e ou oklch(0.3 0.1 280)"
                      : "linear-gradient(160deg, #1a1a2e, #16213e)"
                  }
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs outline-none focus:border-primary font-mono"
                />
              </Field>
            )}

            {/* Animação */}
            <Field label={tr("adminBgAnimLabel")}>
              <div className="grid grid-cols-2 gap-1.5">
                {ANIMATIONS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => patchScreen({ animation: a.id })}
                    className={`press flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-left text-[11px] font-medium transition ${
                      screen.animation === a.id
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <span>{a.emoji}</span> {a.label}
                  </button>
                ))}
              </div>
            </Field>

            {/* Textos (apenas onde faz sentido: login e home) */}
            {(activeScreen === "login" || activeScreen === "home") && (
              <>
                <Field label={tr("adminPageTitleLabel")}>
                  <input
                    value={screen.heading ?? ""}
                    onChange={(e) => patchScreen({ heading: e.target.value })}
                    placeholder={tr("adminPageTitlePlaceholder")}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </Field>
                <Field label={tr("adminSubtextLabel")}>
                  <input
                    value={screen.subtext ?? ""}
                    onChange={(e) => patchScreen({ subtext: e.target.value })}
                    placeholder={tr("adminSubtextPlaceholder")}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </Field>
              </>
            )}

            {/* Preview */}
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                Pré-visualização
              </div>
              <ThemeBackdrop appearance={screen} className="h-28 w-full rounded-2xl">
                <div className="relative flex h-full flex-col items-start justify-end p-3 text-white">
                  {screen.heading && (
                    <div className="text-sm font-bold leading-tight">{screen.heading}</div>
                  )}
                  {screen.subtext && <div className="text-[10px] opacity-80">{screen.subtext}</div>}
                </div>
              </ThemeBackdrop>
            </div>
          </div>
        )}
      </div>

      {saveMsg && (
        <div
          className={`flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs ${
            saveMsg.ok
              ? "bg-emerald-500/10 text-emerald-700 border border-emerald-300/30"
              : "bg-amber-500/10 text-amber-700 border border-amber-300/30"
          }`}
        >
          <Icon name={saveMsg.ok ? "check" : "alert"} size={13} className="shrink-0" />
          {saveMsg.text}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="press h-11 w-full rounded-xl text-sm font-semibold text-primary-foreground disabled:opacity-50"
        style={{ background: "var(--gradient-primary)" }}
      >
        {saving ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            A publicar…
          </span>
        ) : (
          "Publicar para todos os utilizadores"
        )}
      </button>
    </div>
  );
}

// ── Accounts Tab ──────────────────────────────────────────────────────
// BUG CORRIGIDO (auditoria 2026-07-08): esta secção tinha 5 contas
// completamente inventadas (Ana Silva, Carlos Melo...), guardadas no
// localStorage do navegador, e nunca ligadas a dados reais — ver
// fetchAccounts()/setAccountSuspended() em admin-storage.ts, que agora
// leem e escrevem a sério na tabela "profiles" do Supabase (precisa do
// bloco "ADMIN REAL" no fim do SUPABASE_SETUP.sql já ter corrido, e da
// tua conta estar na tabela "admins" — ver instruções lá).

function AccountsTab() {
  const tr = useT();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "suspended" | "personal" | "business">(
    "all",
  );
  const [pendingId, setPendingId] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    fetchAccounts()
      .then(setAccounts)
      .finally(() => setLoading(false));
  };

  useEffect(reload, []);

  const toggleStatus = async (account: AccountRecord) => {
    setPendingId(account.id);
    const ok = await setAccountSuspended(account.id, !account.suspended);
    if (ok) {
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, suspended: !a.suspended } : a)),
      );
    }
    setPendingId(null);
  };

  const filtered = accounts.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (a.email ?? "").toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      (a.city ?? "").toLowerCase().includes(q);
    const status = a.suspended ? "suspended" : "active";
    const matchFilter = filter === "all" || filter === status || filter === a.profileType;
    return matchSearch && matchFilter;
  });

  const stats = {
    total: accounts.length,
    active: accounts.filter((a) => !a.suspended).length,
    suspended: accounts.filter((a) => a.suspended).length,
    business: accounts.filter((a) => a.profileType === "business").length,
  };

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total", value: stats.total, color: "bg-blue-500/15 text-blue-700" },
          { label: "Activos", value: stats.active, color: "bg-emerald-500/15 text-emerald-700" },
          { label: "Suspensos", value: stats.suspended, color: "bg-red-500/15 text-red-700" },
          { label: "Negócio", value: stats.business, color: "bg-violet-500/15 text-violet-700" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl p-3 text-center ${s.color}`}>
            <div className="text-xl font-bold">{s.value}</div>
            <div className="text-[9px] font-semibold mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Info banner — agora dados reais. "Suspender" bloqueia mesmo o
          acesso (ver isSelfSuspended() em auth.ts): a próxima vez que
          essa pessoa abrir a app, é desconectada com um aviso. Não há
          botão de apagar conta aqui de propósito — apagar um utilizador
          Supabase Auth a sério requer a service_role key, que nunca deve
          estar no browser (dá acesso total à base de dados a quem a
          conseguisse ver); isso precisa de uma função de servidor
          própria (Edge Function), ainda por implementar. */}
      <div className="rounded-2xl border border-blue-300/30 bg-blue-500/10 p-3 flex items-start gap-2">
        <Icon name="user" size={14} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="text-[11px] text-blue-700">
          <strong>Gestão de contas:</strong> dados reais do Supabase. Suspender bloqueia mesmo o
          próximo acesso da pessoa. Apagar contas ainda não está disponível aqui — precisa de uma
          função de servidor à parte, por segurança.
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Icon
          name="search"
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          className="h-11 w-full rounded-xl border border-input bg-card pl-8 pr-3 text-sm outline-none focus:border-primary"
          placeholder={tr("adminSearchUsersPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {(
          [
            { id: "all", label: `Todos (${stats.total})` },
            { id: "active", label: tr("adminActiveLabel") },
            { id: "suspended", label: tr("adminSuspendedLabel") },
            { id: "personal", label: tr("adminPersonalLabel") },
            { id: "business", label: tr("adminBusinessType") },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`press shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
              filter === f.id
                ? "text-primary-foreground"
                : "border border-border bg-card text-muted-foreground"
            }`}
            style={filter === f.id ? { background: "var(--gradient-primary)" } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          A carregar…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          {accounts.length === 0
            ? 'Nenhuma conta real encontrada — confirma se já correste o bloco "ADMIN REAL" do SUPABASE_SETUP.sql e se a tua conta está na tabela admins.'
            : "Nenhuma conta encontrada"}
        </div>
      ) : (
        <div className="space-y-3 stagger">
          {filtered.map((account) => (
            <div
              key={account.id}
              className={`rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)] transition ${account.suspended ? "border-destructive/20 opacity-70" : "border-border"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-sm font-bold text-primary-foreground ${account.suspended ? "bg-muted" : ""}`}
                    style={
                      !account.suspended ? { background: "var(--gradient-primary)" } : undefined
                    }
                  >
                    {account.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {account.name}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {account.email ?? "—"}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${!account.suspended ? "bg-emerald-500/15 text-emerald-700" : "bg-destructive/15 text-destructive"}`}
                  >
                    {!account.suspended ? tr("adminActiveStatus") : tr("adminSuspendedStatus")}
                  </span>
                  {account.profileType && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${account.profileType === "business" ? "bg-violet-500/15 text-violet-700" : "bg-blue-500/15 text-blue-700"}`}
                    >
                      {account.profileType === "business"
                        ? tr("adminBusinessType")
                        : tr("adminPersonalType")}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                {(account.province || account.city) && (
                  <span className="flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5">
                    <Icon name="pin" size={9} />{" "}
                    {[account.city, account.province].filter(Boolean).join(", ")}
                  </span>
                )}
                <span className="flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5">
                  Entrou {new Date(account.joinedAt).toLocaleDateString("pt-MZ")}
                </span>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => toggleStatus(account)}
                  disabled={pendingId === account.id}
                  className={`press flex-1 h-9 rounded-xl text-[11px] font-semibold transition disabled:opacity-50 ${
                    !account.suspended
                      ? "border border-amber-300/40 bg-amber-500/10 text-amber-700"
                      : "text-primary-foreground"
                  }`}
                  style={account.suspended ? { background: "var(--gradient-primary)" } : undefined}
                >
                  {!account.suspended ? tr("adminSuspendAction") : tr("adminReactivateAction")}
                </button>
                {account.email && (
                  <a
                    href={`mailto:${account.email}?subject=Spotter Local — Conta`}
                    className="press grid h-9 w-9 place-items-center rounded-xl border border-border bg-muted"
                  >
                    <Icon name="mail" size={14} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────
function AdminDashboard() {
  const tr = useT();
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState<MerchantRecord[]>([]);
  const [filter, setFilter] = useState<"all" | MerchantRecord["status"]>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MerchantRecord | null | "new" | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<
    | "merchants"
    | "accounts"
    | "billing"
    | "notifications"
    | "payments"
    | "push"
    | "appearance"
    | "flags"
    | "reports"
    | "audit"
  >("merchants");
  const [billingStats, setBillingStats] = useState<BillingStats | null>(null);
  const [notifications, setNotifications] = useState<BillingNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [billingRunning, setBillingRunning] = useState(false);
  const [billingResult, setBillingResult] = useState<string | null>(null);
  const [pendingProofs, setPendingProofs] = useState(0);
  useEffect(() => {
    getPaymentProofs().then((ps) =>
      setPendingProofs(ps.filter((p) => p.status === "pending").length),
    );
  }, []);

  useEffect(() => {
    getMerchants().then(setMerchants);
    computeBillingStats().then(setBillingStats);
    getNotifications().then(setNotifications);
    getUnreadCount().then(setUnread);
  }, []);

  const handleRunBilling = async () => {
    setBillingRunning(true);
    setBillingResult(null);
    localStorage.removeItem("spotter.billing.lastrun.v1");
    try {
      const result = await runBillingEngine();
      getMerchants().then(setMerchants);
      computeBillingStats().then(setBillingStats);
      getNotifications().then(setNotifications);
      getUnreadCount().then(setUnread);
      setBillingResult(
        `Processados: ${result.processed} · Bloqueados: ${result.blocked} · Notificações: ${result.notified}`,
      );
    } catch (err) {
      console.warn("Falha ao correr o motor de billing:", err);
      setBillingResult(tr("adminBillingFailedMsg"));
    } finally {
      setBillingRunning(false);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllRead();
    getNotifications().then(setNotifications);
    setUnread(0);
  };

  // Antes, só era possível marcar TODAS as notificações como lidas de
  // uma vez — markNotifRead() já existia em billing-engine.ts mas nunca
  // era chamada, então não havia forma de marcar uma notificação
  // individualmente sem limpar as restantes.
  const handleMarkOneRead = (n: BillingNotification) => {
    if (n.read) return;
    markNotifRead(n.id);
    getNotifications().then(setNotifications);
    getUnreadCount().then(setUnread);
  };

  const filtered = merchants.filter((m) => {
    const matchStatus = filter === "all" || m.status === filter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      m.businessName.toLowerCase().includes(q) ||
      m.ownerName.toLowerCase().includes(q) ||
      m.city.toLowerCase().includes(q) ||
      m.phone.includes(q);
    return matchStatus && matchSearch;
  });

  const stats = {
    total: merchants.length,
    active: merchants.filter((m) => m.status === "active").length,
    trial: merchants.filter((m) => m.status === "trial").length,
    overdue: merchants.filter((m) => m.status === "overdue").length,
    blocked: merchants.filter((m) => m.status === "blocked").length,
    mrr: merchants
      .filter((m) => m.status === "active")
      .reduce((s, m) => s + PLAN_PRICES[m.planId], 0),
  };

  const handleSave = (id: string, patch: Partial<MerchantRecord>) => {
    if (id === "__new__")
      addMerchant(patch as Omit<MerchantRecord, "id" | "joinedAt">).then(setMerchants);
    else updateMerchant(id, patch).then(setMerchants);
  };

  const handleDelete = (id: string) => {
    deleteMerchant(id).then(setMerchants);
  };

  const quickAction = (id: string, action: "activate" | "block" | "unblock") => {
    const now = new Date();
    const renews = new Date(now);
    renews.setMonth(renews.getMonth() + 1);
    const patches: Record<string, Partial<MerchantRecord>> = {
      activate: {
        status: "active",
        lastPaymentAt: now.toISOString(),
        renewsAt: renews.toISOString(),
      },
      block: { status: "blocked" },
      // "Desbloquear" devolve o acesso sem fingir uma renovação que não
      // aconteceu — volta a "active" (não a "trial", que já não existe
      // como estado real desde a remoção do período de teste).
      unblock: { status: "active" },
    };
    updateMerchant(id, patches[action]).then(setMerchants);
  };

  const TABS = [
    { id: "merchants", label: tr("adminMerchantsTabLabel") },
    { id: "accounts", label: tr("adminAccountsTabLabel") },
    { id: "billing", label: tr("adminBillingTabLabel") },
    { id: "notifications", label: `Notif.${unread > 0 ? ` (${unread})` : ""}` },
    { id: "payments", label: `Pagamentos${pendingProofs > 0 ? ` (${pendingProofs})` : ""}` },
    { id: "push", label: "Push" },
    { id: "appearance", label: tr("adminAppearanceTabLabel") },
    { id: "flags", label: tr("adminFlagsTabLabel") },
    { id: "reports", label: tr("adminReportsTabLabel") },
    { id: "audit", label: tr("adminAuditTabLabel") },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header
        className="relative overflow-hidden px-5 pb-5 pt-12"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-start justify-between">
          <div className="animate-slide-up">
            <div className="text-[10px] uppercase tracking-widest text-primary-foreground/70">
              XTACK OFICIAL
            </div>
            <div className="mt-0.5 text-2xl font-bold text-primary-foreground">Painel Admin</div>
            <div className="mt-1 text-xs text-primary-foreground/80">
              Gestão de comerciantes · spotter v11
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <LangSwitcher />
            <button
              onClick={() => {
                adminLogout();
                window.location.reload();
              }}
              className="press rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-primary-foreground ring-1 ring-white/20"
            >
              Sair
            </button>
          </div>
        </div>

        {/* KPI bar */}
        <div className="mt-5 grid grid-cols-3 gap-2 animate-slide-up">
          {[
            { label: "Total", value: stats.total, color: "text-white" },
            { label: "Activos", value: stats.active, color: "text-emerald-300" },
            { label: "Em atraso", value: stats.overdue + stats.blocked, color: "text-red-300" },
          ].map((k) => (
            <div
              key={k.label}
              className="rounded-2xl bg-white/10 px-3 py-3 text-center ring-1 ring-white/10"
            >
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
              <div className="mt-0.5 text-[10px] text-primary-foreground/70">{k.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 rounded-2xl bg-white/10 px-4 py-2.5 ring-1 ring-white/10 flex items-center justify-between">
          <div className="text-[11px] text-primary-foreground/70">MRR estimado</div>
          <div className="text-base font-bold text-emerald-300">
            {stats.mrr.toLocaleString()} MZN
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border bg-card overflow-x-auto no-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-3 py-2.5 text-xs font-medium transition ${activeTab === tab.id ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="flex-1 px-5 py-5 pb-24 space-y-4">
        {/* ── Tab: Merchants ── */}
        {activeTab === "merchants" && (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Icon
                  name="search"
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  className="h-11 w-full rounded-xl border border-input bg-card pl-8 pr-3 text-sm outline-none focus:border-primary"
                  placeholder={tr("adminSearchMerchantsPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                onClick={() => setSelected("new")}
                className="press grid h-11 w-11 shrink-0 place-items-center rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                <Icon name="plus" size={20} />
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {(["all", "active", "trial", "overdue", "blocked"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`press shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                    filter === f
                      ? "text-primary-foreground"
                      : "border border-border bg-card text-muted-foreground"
                  }`}
                  style={filter === f ? { background: "var(--gradient-primary)" } : undefined}
                >
                  {f === "all" ? `Todos (${stats.total})` : STATUS_LABELS[f]}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
                Nenhum comerciante encontrado
              </div>
            ) : (
              <div className="space-y-3 stagger">
                {filtered.map((m) => {
                  const days = daysTo(m.renewsAt);
                  return (
                    <div
                      key={m.id}
                      className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-sm text-foreground">
                            {m.businessName}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {m.ownerName} · {m.city}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${STATUS_COLOR[m.status]}`}
                        >
                          {STATUS_LABELS[m.status]}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-lg bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">
                          {PLAN_LABELS[m.planId]} — {PLAN_PRICES[m.planId]} MZN
                        </span>
                        <span className="rounded-lg bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">
                          {m.productCount} produtos
                        </span>
                        {m.paymentMethod && (
                          <span className="rounded-lg bg-accent px-2 py-0.5 text-[10px] text-accent-foreground uppercase">
                            {m.paymentMethod}
                          </span>
                        )}
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[10px] font-medium ${days < 0 ? "bg-destructive/15 text-destructive" : days <= 5 ? "bg-amber-500/15 text-amber-700" : "bg-emerald-500/10 text-emerald-700"}`}
                        >
                          {days < 0 ? `Venceu há ${Math.abs(days)}d` : `Renova em ${days}d`}
                        </span>
                      </div>

                      {m.notes && (
                        <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
                          <Icon name="pencil" size={12} className="mt-0.5 shrink-0" />
                          <span>{m.notes}</span>
                        </div>
                      )}

                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => setSelected(m)}
                          className="press flex-1 h-9 rounded-xl border border-border bg-muted text-[11px] font-medium text-foreground"
                        >
                          Editar
                        </button>
                        {m.status === "blocked" || m.status === "overdue" ? (
                          <button
                            onClick={() => quickAction(m.id, "activate")}
                            className="press flex h-9 items-center justify-center gap-1 px-3 rounded-xl text-[11px] font-semibold text-primary-foreground"
                            style={{ background: "var(--gradient-primary)" }}
                          >
                            <Icon name="check" size={12} /> {tr("adminActivateAction")}
                          </button>
                        ) : m.status === "active" ? (
                          <button
                            onClick={() => quickAction(m.id, "block")}
                            className="press h-9 px-3 rounded-xl border border-destructive/40 bg-destructive/10 text-[11px] font-medium text-destructive"
                          >
                            Bloquear
                          </button>
                        ) : null}
                        <a
                          href={`https://wa.me/${m.phone.replace(/\D/g, "")}?text=Ol%C3%A1%20${encodeURIComponent(m.ownerName)}%2C%20contacto%20da%20XTACK%20sobre%20o%20seu%20plano%20Spotter.`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="press grid h-9 w-9 place-items-center rounded-xl bg-[#25D366] text-white"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                            <path d="M12 2C6.477 2 2 6.477 2 12c0 1.989.574 3.842 1.563 5.408L2 22l4.738-1.543A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.963 7.963 0 01-4.236-1.22l-.303-.181-3.135 1.02 1.05-3.044-.198-.313A7.963 7.963 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z" />
                          </svg>
                        </a>
                        <a
                          href={`tel:${m.phone}`}
                          className="press grid h-9 w-9 place-items-center rounded-xl border border-border bg-muted"
                        >
                          <Icon name="phoneCall" size={14} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(() => {
              const expiring = merchants.filter(
                (m) => m.status === "active" && daysTo(m.renewsAt) <= 3 && daysTo(m.renewsAt) >= 0,
              );
              if (!expiring.length) return null;
              return (
                <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 mb-2">
                    <Icon name="clock" size={14} /> {expiring.length} plano
                    {expiring.length > 1 ? "s" : ""} a vencer em breve
                  </div>
                  {expiring.map((m) => (
                    <div key={m.id} className="text-xs text-amber-700 mt-1">
                      · {m.businessName} — {daysTo(m.renewsAt)}d ({m.phone})
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        )}

        {/* ── Tab: Billing ── */}
        {activeTab === "billing" && billingStats && (
          <div className="space-y-4 animate-slide-up">
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "MRR",
                  value: `${billingStats.mrr.toLocaleString()} MZN`,
                  sub: tr("adminMonthlyRevenueLabel"),
                  color: "bg-emerald-500/15 text-emerald-700",
                },
                {
                  label: tr("adminArrLabel"),
                  value: `${(billingStats.arr / 1000).toFixed(0)}K MZN`,
                  sub: tr("adminAnnualLabel"),
                  color: "bg-blue-500/15 text-blue-700",
                },
                {
                  label: tr("adminAtRiskRevenueLabel"),
                  value: `${billingStats.overdueRevenue.toLocaleString()} MZN`,
                  sub: `${billingStats.overdueCount} em atraso`,
                  color: "bg-orange-500/15 text-orange-700",
                },
                {
                  label: tr("adminConversionLabel"),
                  value: `${billingStats.conversionRate}%`,
                  sub: tr("adminTrialToActiveLabel"),
                  color: "bg-violet-500/15 text-violet-700",
                },
              ].map((s) => (
                <div key={s.label} className={`rounded-2xl p-4 ${s.color}`}>
                  <div className="text-lg font-bold">{s.value}</div>
                  <div className="text-[10px] font-semibold">{s.label}</div>
                  <div className="text-[10px] opacity-70">{s.sub}</div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="text-sm font-semibold text-foreground">Distribuição por plano</div>
              {Object.entries(billingStats.planBreakdown).map(([plan, d]) => (
                <div key={plan} className="flex items-center justify-between">
                  <div className="text-sm font-medium text-foreground capitalize">{plan}</div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{d.count} comerciantes</span>
                    <span className="font-semibold text-foreground">
                      {d.revenue.toLocaleString()} MZN/mês
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <div className="text-sm font-semibold text-foreground">
                Motor de cobrança automática
              </div>
              <p className="text-xs text-muted-foreground">
                Corre sozinho todos os dias às 06:00 UTC (cron no Supabase). O
                botão abaixo força uma verificação imediata, sem esperar pelo
                próximo ciclo.
              </p>
              {billingResult && (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-300/30 p-2 text-xs text-emerald-700">
                  {billingResult}
                </div>
              )}
              <button
                onClick={handleRunBilling}
                disabled={billingRunning}
                className="press h-10 w-full rounded-xl text-sm font-semibold text-primary-foreground disabled:opacity-50"
                style={{ background: "var(--gradient-primary)" }}
              >
                {billingRunning ? tr("adminProcessingAction") : tr("adminRunBillingAction")}
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: Notifications ── */}
        {activeTab === "notifications" && (
          <div className="space-y-3 animate-slide-up">
            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="press w-full rounded-xl border border-border bg-card py-2 text-xs text-muted-foreground"
              >
                Marcar todas como lidas ({unread})
              </button>
            )}
            {notifications.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
                Sem notificações de billing
              </div>
            ) : (
              notifications.map((n) => {
                const COLOR: Record<string, string> = {
                  trial_ending: "bg-amber-500/10 border-amber-300/30",
                  trial_expired: "bg-orange-500/10 border-orange-300/30",
                  payment_due: "bg-blue-500/10 border-blue-300/30",
                  payment_overdue: "bg-orange-500/10 border-orange-300/30",
                  auto_blocked: "bg-destructive/10 border-destructive/30",
                  plan_renewed: "bg-emerald-500/10 border-emerald-300/30",
                };
                return (
                  <button
                    key={n.id}
                    onClick={() => handleMarkOneRead(n)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${COLOR[n.event] ?? "border-border bg-card"} ${n.read ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-foreground">{n.businessName}</div>
                      <div className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(n.createdAt).toLocaleDateString("pt-MZ")}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-foreground/80">{n.message}</p>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* ── Tab: Payments ── */}
        {activeTab === "payments" && <PaymentsTab />}

        {/* ── Tab: Push ── */}
        {activeTab === "push" && <PushTab merchants={merchants} />}

        {/* ── Tab: Aparência ── */}
        {activeTab === "appearance" && <AppearanceTab />}

        {/* ── Tab: Feature Flags ── */}
        {activeTab === "flags" && <FlagsTab />}

        {/* ── Tab: Reports ── */}
        {activeTab === "reports" && <ReportsTab merchants={merchants} />}

        {/* ── Tab: Audit Log ── */}
        {activeTab === "audit" && <AuditTab />}

        {/* ── Tab: Accounts ── */}
        {activeTab === "accounts" && <AccountsTab />}
      </main>

      <div className="py-4 text-center text-[10px] text-muted-foreground border-t border-border">
        © XTACK OFICIAL · Powered by spotter v11
      </div>

      {selected !== undefined && (
        <MerchantModal
          merchant={selected === "new" ? null : selected}
          onClose={() => setSelected(undefined)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

// ── Route component ───────────────────────────────────────────────────
function AdminPage() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    setAuthed(getAdminSession());
    const interval = setInterval(() => {
      const isStillAuthed = getAdminSession();
      if (!isStillAuthed) setAuthed(false);
    }, 10000);
    return () => clearInterval(interval);
  }, []);
  return authed ? <AdminDashboard /> : <AdminLogin onAuth={() => setAuthed(true)} />;
}
