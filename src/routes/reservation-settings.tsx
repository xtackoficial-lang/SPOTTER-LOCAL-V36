// ============================================================
// SPOTTER — Definições de reserva (dashboard do comerciante)
// ------------------------------------------------------------
// Ecrã dedicado, isolado do editor de perfil (merchant.tsx) — lê e
// grava directo nas colunas novas de "businesses" via reservations-db.
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Icon } from "@/components/Icon";
import {
  fetchReservationSettings,
  updateReservationSettings,
  type BusinessReservationSettings,
} from "@/lib/reservations-db";
import { useOnboarding } from "@/lib/onboarding-storage";
import { RequireBusiness } from "@/components/RequireBusiness";

import { normalizePhone } from "@/lib/validators";
export const Route = createFileRoute("/reservation-settings")({
  head: () => ({ meta: [{ title: "Definições de reserva — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <ReservationSettingsPage />
    </RequireBusiness>
  ),
});

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="press flex w-full items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left"
    >
      <div>
        <p className="text-sm font-bold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div
        className={`relative h-6 w-11 flex-none rounded-full transition-colors ${
          checked ? "bg-emerald-500" : "bg-muted"
        }`}
      >
        <div
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </div>
    </button>
  );
}

function ReservationSettingsPage() {
  const navigate = useNavigate();
  const { draft } = useOnboarding();
  const businessId = draft.business.businessId || "default";

  const [settings, setSettings] = useState<BusinessReservationSettings | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  const [numeroRepasse, setNumeroRepasse] = useState("");
  const [precoNormal, setPrecoNormal] = useState("200");
  const [precoEvento, setPrecoEvento] = useState("500");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchReservationSettings(businessId).then((s) => {
      if (s) {
        setSettings(s);
        setWhatsapp(s.whatsappReservas ?? "");
        setNumeroRepasse(s.numeroRepasse ?? "");
        setPrecoNormal(String(s.mesaPrecoNormal));
        setPrecoEvento(String(s.mesaPrecoEvento));
      }
      setLoading(false);
    });
  }, [businessId]);

  const handleSave = async () => {
    // v41 (segurança): números reais e preços com sentido
    setFormError(null);
    const wa = whatsapp.trim() ? normalizePhone(whatsapp) : null;
    if (wa && !wa.ok) {
      setFormError(`WhatsApp de reservas: ${wa.error}`);
      return;
    }
    const rep = numeroRepasse.trim() ? normalizePhone(numeroRepasse) : null;
    if (rep && (!rep.ok || !/^\+258\d{9}$/.test(rep.value))) {
      setFormError(
        rep && !rep.ok
          ? `Número de repasse: ${rep.error}`
          : "Número de repasse: tem de ser um número M-Pesa/e-Mola de Moçambique.",
      );
      return;
    }
    const pn = Number(precoNormal);
    const pe = Number(precoEvento);
    if (!(pn > 0 && pn <= 1_000_000) || !(pe > 0 && pe <= 1_000_000)) {
      setFormError("Os preços da mesa têm de ser números maiores que 0.");
      return;
    }
    setSaving(true);
    setSaved(false);
    await updateReservationSettings(businessId, {
      acceptsRoomReservation: settings?.acceptsRoomReservation ?? false,
      acceptsTableReservation: settings?.acceptsTableReservation ?? false,
      whatsappReservas: wa && wa.ok ? wa.value : null,
      numeroRepasse: rep && rep.ok ? rep.value : null,
      mesaPrecoNormal: pn,
      mesaPrecoEvento: pe,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading || !settings) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="glass-bar sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <button
          onClick={() => navigate({ to: "/business", replace: true })}
          className="press rounded-full p-1"
        >
          <Icon name="chevronLeft" size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Definições de reserva</h1>
      </div>

      <div className="mx-auto max-w-md px-4 py-6 space-y-4">
        {!settings.roomEligible && !settings.tableEligible ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Reservas online não disponíveis</p>
            <p className="mt-1.5 leading-relaxed">
              As reservas com pagamento online são só para hotéis, hotéis + restaurantes,
              restaurantes, lanchonetes e parques / sítios turísticos. O teu tipo de negócio
              continua a aparecer no Spotter Local e os clientes podem contactar-te directamente.
            </p>
          </div>
        ) : (
          <>
            {settings.roomEligible && (
              <Toggle
                checked={settings.acceptsRoomReservation}
                onChange={(v) => setSettings({ ...settings, acceptsRoomReservation: v })}
                label="Aceitar reservas de quarto"
                description="Mostra o botão de reserva de quarto no teu perfil e activa a aba Reservas."
              />
            )}
            {settings.tableEligible && (
              <Toggle
                checked={settings.acceptsTableReservation}
                onChange={(v) => setSettings({ ...settings, acceptsTableReservation: v })}
                label="Aceitar reservas de mesa"
                description="Mostra o botão de reserva de mesa no teu perfil — confirma-se automaticamente."
              />
            )}

            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                  WhatsApp de reservas (só contacta o cliente depois de pagar)
                </p>
                <input
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value.replace(/[^\d\s+()-]/g, ""))}
                  inputMode="tel"
                  maxLength={20}
                  placeholder="84 123 4567"
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                  Número de M-Pesa/e-Mola para repasse (usado no e-mail de aviso)
                </p>
                <input
                  value={numeroRepasse}
                  onChange={(e) => setNumeroRepasse(e.target.value.replace(/[^\d\s+()-]/g, ""))}
                  inputMode="tel"
                  maxLength={20}
                  placeholder="84 123 4567"
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </div>
              {formError && <p className="text-xs text-red-600">{formError}</p>}
            </div>

            {settings.acceptsTableReservation && (
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <p className="text-xs font-semibold text-foreground">Preços da reserva de mesa</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">Normal (MT)</p>
                    <input
                      value={precoNormal}
                      onChange={(e) => setPrecoNormal(e.target.value.replace(/\D/g, ""))}
                      inputMode="numeric"
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">Evento (MT)</p>
                    <input
                      value={precoEvento}
                      onChange={(e) => setPrecoEvento(e.target.value.replace(/\D/g, ""))}
                      inputMode="numeric"
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="press h-12 w-full rounded-full text-sm font-semibold text-primary-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-primary)" }}
            >
              {saving ? "A guardar…" : saved ? "✓ Guardado" : "Guardar definições"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
