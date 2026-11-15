// ============================================================
// SPOTTER — Publicar evento (incluído nos planos Pro e Premium)
// ------------------------------------------------------------
// Pro: 4 eventos por mês · Premium: 8 por mês (sem pagar por evento).
// O comerciante escolhe o DIA e a HORA em que o evento aparece e o DIA e a
// HORA em que sai da aba Eventos. Horas certas entre as 06:00 e as 22:00.
// Quem decide é o servidor (migração 017): plano, quota do mês e horas.
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { Icon } from "@/components/Icon";
import { ShimmerButton } from "@/components/ShimmerButton";
import { uploadMedia } from "@/lib/storage-upload";
import { normalizePhone, validateWebsite } from "@/lib/validators";
import { PROVINCES_MZ, citiesForProvince } from "@/lib/mozambique-locations";
import { useOnboarding } from "@/lib/onboarding-storage";
import { useAuth } from "@/lib/auth-context";
import { useSubscription } from "@/lib/subscription-storage";
import { RequireBusiness } from "@/components/RequireBusiness";
import { PublicationGuide } from "@/components/PublicationGuide";
import { MAX_PUBLICATION_PHOTOS } from "@/lib/publication-rules";
import {
  deleteMyEvent,
  fetchMyEvents,
  formatEventDates,
  todayLocalISO,
  type MyEvent,
} from "@/lib/posts-events-db";
import {
  EVENT_FIRST_HOUR,
  EVENT_LAST_HOUR,
  EVENT_MAX_DAYS_AHEAD,
  EVENT_MAX_VISIBLE_DAYS,
  addDaysISO,
  checkSchedule,
  firstPublishSlot,
  hourLabel,
  maputoInstant,
  maputoNow,
  maxRemoveDate,
  publishHoursFor,
  removeHoursFor,
} from "@/lib/event-schedule";
import { fetchEventQuota, publishScheduledEvent, type EventQuota } from "@/lib/event-publish-db";

export const Route = createFileRoute("/publish-event")({
  head: () => ({ meta: [{ title: "Publicar evento — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <PublishEventPage />
    </RequireBusiness>
  ),
});

type Step = "form" | "done";

/** Uma foto da publicação: ficheiro novo (por enviar) ou foto já guardada (ao repetir). */
type PhotoItem = { id: string; file?: File; url?: string; preview: string };

const fmtWhen = (dateISO: string, hour: number): string =>
  `${new Date(`${dateISO}T12:00:00`).toLocaleDateString("pt-MZ")} às ${hourLabel(hour)}`;

const fmtInstant = (iso: string): string =>
  new Date(iso).toLocaleString("pt-MZ", {
    timeZone: "Africa/Maputo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function PublishEventPage() {
  const navigate = useNavigate();
  const { draft } = useOnboarding();
  const businessId = draft.business.businessId || "default";
  const { user } = useAuth();
  const { plan, hydrated, isBlocked, isOverdue } = useSubscription(businessId);
  const canPublish = plan.eventsPerMonth > 0 && !isBlocked && !isOverdue;

  const [step, setStep] = useState<Step>("form");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [uploadIdx, setUploadIdx] = useState(0);
  const [title, setTitle] = useState("");
  const [ticketPhone, setTicketPhone] = useState("");
  const [ticketLink, setTicketLink] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [myEvents, setMyEvents] = useState<MyEvent[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneInfo, setDoneInfo] = useState<{ when: string; until: string; left: number } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Agendamento: dia e hora de publicar, dia e hora de remover.
  const initial = useMemo(() => firstPublishSlot(), []);
  const [publishDate, setPublishDate] = useState(initial.date);
  const [publishHour, setPublishHour] = useState(initial.hour);
  const [removeDate, setRemoveDate] = useState(addDaysISO(initial.date, 7));
  const [removeHour, setRemoveHour] = useState(EVENT_LAST_HOUR);
  const [removeTouched, setRemoveTouched] = useState(false);
  const [quota, setQuota] = useState<EventQuota | null>(null);

  const today = todayLocalISO();
  const nowM = maputoNow();
  const publishMin = nowM.date;
  const publishMax = addDaysISO(nowM.date, EVENT_MAX_DAYS_AHEAD);
  const publishHours = useMemo(() => publishHoursFor(publishDate), [publishDate]);
  const removeMin = publishDate;
  const removeMax = maxRemoveDate(publishDate, eventDate || undefined, eventEndDate || undefined);
  const removeHours = useMemo(
    () => removeHoursFor(publishDate, publishHour, removeDate),
    [publishDate, publishHour, removeDate],
  );

  // Mantém a hora de publicar válida quando o dia muda (ex.: hoje já passou das horas).
  useEffect(() => {
    if (publishHours.length && !publishHours.includes(publishHour)) setPublishHour(publishHours[0]);
  }, [publishHours, publishHour]);

  // Sugere o dia de remoção (fim do evento, ou 7 dias depois) até o comerciante escolher.
  useEffect(() => {
    if (removeTouched) return;
    const wanted = eventEndDate || eventDate || addDaysISO(publishDate, 7);
    const clamped = wanted < removeMin ? removeMin : wanted > removeMax ? removeMax : wanted;
    setRemoveDate(clamped);
  }, [removeTouched, eventDate, eventEndDate, publishDate, removeMin, removeMax]);

  // Mantém a data de remoção dentro dos limites e a hora de remover válida.
  useEffect(() => {
    if (removeDate < removeMin) setRemoveDate(removeMin);
    else if (removeDate > removeMax) setRemoveDate(removeMax);
  }, [removeDate, removeMin, removeMax]);
  useEffect(() => {
    if (removeHours.length && !removeHours.includes(removeHour)) {
      setRemoveHour(
        removeHours.includes(EVENT_LAST_HOUR)
          ? EVENT_LAST_HOUR
          : removeHours[removeHours.length - 1],
      );
    }
  }, [removeHours, removeHour]);

  // Quota do mês em que o evento vai aparecer.
  useEffect(() => {
    if (!canPublish || !publishHours.includes(publishHour)) return;
    let cancelled = false;
    fetchEventQuota(businessId, maputoInstant(publishDate, publishHour)).then((q) => {
      if (!cancelled) setQuota(q);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, publishDate, publishHour, publishHours, canPublish, reloadTick, step]);

  useEffect(() => {
    if (step !== "form") return;
    let cancelled = false;
    fetchMyEvents(businessId).then((list) => {
      if (!cancelled) setMyEvents(list);
    });
    return () => {
      cancelled = true;
    };
  }, [step, businessId, reloadTick]);

  const monthName = new Date(`${publishDate}T12:00:00`).toLocaleDateString("pt-MZ", {
    month: "long",
  });
  const quotaFull = quota ? quota.used >= quota.limit : false;
  const lastEventDay = eventEndDate || eventDate;
  const endsAfterListing = !!lastEventDay && removeDate < lastEventDay;

  const repeatEvent = (ev: MyEvent) => {
    setTitle(ev.title);
    setTicketPhone(ev.ticketPhone ?? "");
    setTicketLink(ev.ticketLink ?? "");
    setEventDate("");
    setEventEndDate("");
    setPhotos(ev.photoUrls.map((u, i) => ({ id: `old-${i}-${u}`, url: u, preview: u })));
    setRemoveTouched(false);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeEvent = async (ev: MyEvent) => {
    if (
      !window.confirm(
        `Remover o evento "${ev.title}"? Deixa de aparecer na aba Eventos. Atenção: não devolve o evento do teu plano deste mês.`,
      )
    )
      return;
    if (await deleteMyEvent(ev.id)) setReloadTick((n) => n + 1);
    else setError("Não foi possível remover o evento.");
  };

  const eventStatusText = (ev: MyEvent): string => {
    if (ev.status === "pending") return "A aguardar pagamento (formato antigo)";
    const lastDay = ev.eventEndDate ?? ev.eventDate;
    const ended =
      ev.status === "expired" ||
      (ev.expiresAt && Date.parse(ev.expiresAt) <= Date.now()) ||
      (lastDay && lastDay < today);
    if (ended) return "Terminado";
    if (ev.publishAt && Date.parse(ev.publishAt) > Date.now())
      return `Agendado para ${fmtInstant(ev.publishAt)}`;
    if (ev.expiresAt) return `Visível até ${fmtInstant(ev.expiresAt)}`;
    return "Visível";
  };

  const handlePickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite escolher a mesma foto outra vez
    if (!files.length) return;
    const room = MAX_PUBLICATION_PHOTOS - photos.length;
    if (files.length > room) {
      setError(`Cada publicação leva no máximo ${MAX_PUBLICATION_PHOTOS} fotos.`);
    } else {
      setError(null);
    }
    const added = files
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, Math.max(0, room))
      .map((file) => ({
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: URL.createObjectURL(file),
      }));
    setPhotos((prev) => [...prev, ...added]);
  };

  const removePhoto = (id: string) => setPhotos((prev) => prev.filter((p) => p.id !== id));
  const makeCover = (id: string) =>
    setPhotos((prev) => {
      const hit = prev.find((p) => p.id === id);
      return hit ? [hit, ...prev.filter((p) => p.id !== id)] : prev;
    });

  const handleSubmit = async () => {
    if (photos.length === 0) {
      setError("Escolhe pelo menos uma foto (a primeira é a capa).");
      return;
    }
    if (title.trim().length < 3) {
      setError("Dá um título ao evento (mínimo 3 letras).");
      return;
    }
    if (!ticketPhone.trim() && !ticketLink.trim()) {
      setError("Indica pelo menos um contacto ou link para bilhetes.");
      return;
    }
    const phoneCheck = ticketPhone.trim() ? normalizePhone(ticketPhone) : null;
    if (phoneCheck && !phoneCheck.ok) {
      setError(phoneCheck.error);
      return;
    }
    const linkCheck = ticketLink.trim() ? validateWebsite(ticketLink) : null;
    if (linkCheck && !linkCheck.ok) {
      setError("O link dos bilhetes não é um endereço válido.");
      return;
    }
    if (eventDate && eventDate < today) {
      setError("A data de início do evento já passou.");
      return;
    }
    if (eventEndDate && !eventDate) {
      setError("Indica primeiro a data de início do evento.");
      return;
    }
    if (eventEndDate && eventEndDate < eventDate) {
      setError("A data de fim não pode ser antes da data de início.");
      return;
    }
    const sched = checkSchedule({
      publishDate,
      publishHour,
      removeDate,
      removeHour,
      eventDate: eventDate || undefined,
      eventEndDate: eventEndDate || undefined,
    });
    if (!sched.ok) {
      setError(sched.error);
      return;
    }
    if (quotaFull) {
      setError(
        "Já usaste todos os eventos do teu plano neste mês. Escolhe um dia do mês seguinte.",
      );
      return;
    }
    if (!accepted) {
      setError("Confirma que a publicação cumpre as regras do que se pode publicar.");
      return;
    }
    if (!user) {
      setError("Precisas de ter sessão iniciada.");
      return;
    }
    setError(null);
    setLoading(true);
    setUploading(true);
    try {
      // businessId ≠ auth.uid(): a pasta no armazenamento é do utilizador (ver publish-post.tsx).
      const photoUrls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const item = photos[i];
        setUploadIdx(i + 1);
        photoUrls.push(
          item.file ? await uploadMedia(item.file, "event", user.id) : (item.url as string),
        );
      }
      setUploading(false);

      const result = await publishScheduledEvent({
        businessId,
        title: title.trim(),
        photoUrls,
        eventDate: eventDate || undefined,
        eventEndDate: eventEndDate || undefined,
        ticketPhone: phoneCheck && phoneCheck.ok ? phoneCheck.value : undefined,
        ticketLink: linkCheck && linkCheck.ok ? linkCheck.value : undefined,
        city: city || undefined,
        publishAt: maputoInstant(publishDate, publishHour),
        expiresAt: maputoInstant(removeDate, removeHour),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDoneInfo({
        when: fmtWhen(publishDate, publishHour),
        until: fmtWhen(removeDate, removeHour),
        left: Math.max(0, result.limit - result.used),
      });
      setStep("done");
    } catch (err) {
      console.warn("Falha ao publicar evento:", err);
      setError(err instanceof Error ? err.message : "Não foi possível publicar o evento.");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  const inputCls =
    "w-full rounded-2xl border border-border bg-card px-3 py-3 text-sm text-foreground outline-none";

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="glass-bar sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <button onClick={() => navigate({ to: "/merchant" })} className="press rounded-full p-1">
          <Icon name="chevronLeft" size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Publicar evento</h1>
      </div>

      <div className="mx-auto max-w-md space-y-6 px-4 py-6">
        {step === "form" && hydrated && !canPublish && (
          <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-5 text-sm">
            <div className="text-base font-bold text-foreground">
              Eventos nos planos Pro e Premium
            </div>
            <p className="text-muted-foreground">
              Divulga festas, concertos, inaugurações e promoções na aba Eventos, sem pagar por
              evento: o plano <b>Pro</b> inclui <b>4 eventos por mês</b> e o <b>Premium</b> inclui{" "}
              <b>8 por mês</b>.
            </p>
            {(isBlocked || isOverdue) && (
              <p className="text-xs text-destructive">
                O teu plano não está ativo. Reativa-o para voltares a publicar.
              </p>
            )}
            <ShimmerButton
              onClick={() => navigate({ to: "/subscribe" })}
              className="press h-12 w-full rounded-2xl text-sm font-bold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              Ver planos
            </ShimmerButton>
          </div>
        )}

        {step === "form" && canPublish && (
          <>
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
              <div className="mb-1 font-bold text-foreground">Para que serve?</div>
              <p className="text-muted-foreground">
                Divulga uma festa, concerto, inauguração, feira ou promoção a todos os clientes da
                tua cidade. O evento aparece na aba Eventos com o cartaz, a data e o contacto ou
                link para comprarem bilhetes.
              </p>
              <p className="mt-2 text-muted-foreground">
                <span className="font-semibold text-foreground">Incluído no teu plano:</span>{" "}
                {plan.eventsPerMonth} eventos por mês, com o dia e a hora de publicar e de remover à
                tua escolha.
              </p>
              <p className="mt-2 text-muted-foreground">
                Quando a publicação ficar visível, os teus seguidores (clientes que te têm nos
                favoritos) recebem uma notificação:{" "}
                <i>“{draft.business.businessName || "O teu negócio"} publicou uma foto”</i>.
              </p>
            </div>

            <PublicationGuide defaultOpen />

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Fotos da publicação</span>
                <span className="text-muted-foreground">
                  {photos.length}/{MAX_PUBLICATION_PHOTOS} · a 1.ª é a capa
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePickPhotos}
                className="hidden"
              />
              <div className="grid grid-cols-3 gap-2">
                {photos.map((ph, i) => (
                  <div
                    key={ph.id}
                    className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border bg-card"
                  >
                    <img
                      loading="lazy"
                      decoding="async"
                      src={ph.preview}
                      alt={`Foto ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    {i === 0 ? (
                      <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                        Capa
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => makeCover(ph.id)}
                        className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                      >
                        Usar de capa
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Remover foto"
                      onClick={() => removePhoto(ph.id)}
                      className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PUBLICATION_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="press flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-card text-muted-foreground"
                  >
                    <Icon name="plus" size={22} />
                    <span className="text-[11px]">
                      {photos.length === 0 ? "Adicionar fotos" : "Mais fotos"}
                    </span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Com mais de uma foto, os clientes deslizam para o lado, como no Instagram.
              </p>
            </div>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Título do evento"
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none"
            />

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Data de início do evento
                </span>
                <input
                  type="date"
                  min={today}
                  value={eventDate}
                  onChange={(e) => {
                    setEventDate(e.target.value);
                    if (eventEndDate && e.target.value && eventEndDate < e.target.value) {
                      setEventEndDate("");
                    }
                  }}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Data de fim (opcional)
                </span>
                <input
                  type="date"
                  min={eventDate || today}
                  value={eventEndDate}
                  onChange={(e) => setEventEndDate(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>

            <input
              value={ticketPhone}
              onChange={(e) => setTicketPhone(e.target.value.replace(/[^\d\s+()-]/g, ""))}
              inputMode="tel"
              maxLength={20}
              placeholder="Contacto para bilhetes (ex: 84 123 4567)"
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none"
            />

            <input
              value={ticketLink}
              onChange={(e) => setTicketLink(e.target.value)}
              placeholder="Link para comprar bilhete (opcional)"
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none"
            />

            <div className="grid grid-cols-2 gap-3">
              <select
                value={province}
                onChange={(e) => {
                  setProvince(e.target.value);
                  setCity("");
                }}
                className="rounded-2xl border border-border bg-card px-3 py-3 text-sm text-foreground"
              >
                <option value="">Província</option>
                {PROVINCES_MZ.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={!province}
                className="rounded-2xl border border-border bg-card px-3 py-3 text-sm text-foreground disabled:opacity-50"
              >
                <option value="">Cidade</option>
                {citiesForProvince(province).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <div className="text-sm font-semibold text-foreground">
                Quando aparece e quando sai
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">
                  Publicar no dia e à hora
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    type="date"
                    min={publishMin}
                    max={publishMax}
                    value={publishDate}
                    onChange={(e) => e.target.value && setPublishDate(e.target.value)}
                    className={inputCls}
                  />
                  <select
                    value={publishHour}
                    onChange={(e) => setPublishHour(Number(e.target.value))}
                    disabled={!publishHours.length}
                    className="rounded-2xl border border-border bg-background px-3 py-3 text-sm text-foreground disabled:opacity-50"
                  >
                    {publishHours.map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </select>
                </div>
                {!publishHours.length && (
                  <p className="mt-1 text-xs text-destructive">
                    Hoje já não há horas disponíveis. Escolhe outro dia.
                  </p>
                )}
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">
                  Remover no dia e à hora
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    type="date"
                    min={removeMin}
                    max={removeMax}
                    value={removeDate}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setRemoveTouched(true);
                      setRemoveDate(e.target.value);
                    }}
                    className={inputCls}
                  />
                  <select
                    value={removeHour}
                    onChange={(e) => {
                      setRemoveTouched(true);
                      setRemoveHour(Number(e.target.value));
                    }}
                    disabled={!removeHours.length}
                    className="rounded-2xl border border-border bg-background px-3 py-3 text-sm text-foreground disabled:opacity-50"
                  >
                    {removeHours.map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <ul className="space-y-1 text-[11px] leading-snug text-muted-foreground">
                <li>
                  • Horas certas, das {hourLabel(EVENT_FIRST_HOUR)} às {hourLabel(EVENT_LAST_HOUR)}{" "}
                  (hora de Maputo).
                </li>
                <li>• Podes agendar até {EVENT_MAX_DAYS_AHEAD} dias à frente.</li>
                <li>
                  • Fica publicado no mínimo 1 hora e no máximo {EVENT_MAX_VISIBLE_DAYS} dias, e sai
                  no máximo 1 dia depois de o evento acabar.
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Aparece na aba Eventos</span>
                <span className="font-semibold text-foreground">
                  {fmtWhen(publishDate, publishHour)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Sai da aba</span>
                <span className="font-semibold text-foreground">
                  {fmtWhen(removeDate, removeHour)}
                </span>
              </div>
              {quota && (
                <div
                  className={`mt-3 rounded-xl p-3 text-xs ${
                    quotaFull ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                  }`}
                >
                  Em {monthName}: usaste {quota.used} de {quota.limit} eventos do teu plano
                  {quotaFull ? ". Escolhe um dia do mês seguinte." : "."}
                </div>
              )}
              {endsAfterListing && (
                <div className="mt-3 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700">
                  O evento acaba depois de a publicação sair da aba. Escolhe um dia de remoção mais
                  tarde, se queres que apareça até ao fim.
                </div>
              )}
            </div>

            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                Confirmo que as fotos e o texto são meus (ou tenho autorização) e cumprem as regras
                do que se pode publicar.
              </span>
            </label>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <ShimmerButton
              onClick={handleSubmit}
              disabled={
                loading || quotaFull || !publishHours.length || photos.length === 0 || !accepted
              }
              className="press h-14 w-full rounded-2xl text-base font-bold text-primary-foreground disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {uploading
                ? `A enviar fotos ${uploadIdx}/${photos.length}…`
                : loading
                  ? "A publicar…"
                  : "Publicar evento"}
            </ShimmerButton>
          </>
        )}

        {step === "form" && myEvents.length > 0 && (
          <div className="space-y-3 border-t border-border pt-6">
            <div className="text-sm font-semibold text-foreground">Os teus eventos</div>
            {myEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <img
                  loading="lazy"
                  decoding="async"
                  src={ev.posterUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{ev.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatEventDates(ev.eventDate, ev.eventEndDate) || "Sem data"}
                  </div>
                  <div className="text-xs font-medium text-primary">{eventStatusText(ev)}</div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {canPublish && (
                    <button
                      type="button"
                      onClick={() => repeatEvent(ev)}
                      className="press rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground"
                    >
                      Repetir
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeEvent(ev)}
                    className="press rounded-lg border border-destructive/40 px-2.5 py-1 text-xs font-semibold text-destructive"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <Icon name="check-circle" size={48} className="text-emerald-600" />
            <h2 className="text-lg font-bold text-foreground">Evento agendado!</h2>
            <p className="text-sm text-muted-foreground">
              Aparece na aba Eventos e no teu perfil a {doneInfo?.when} e sai a {doneInfo?.until}.
              Nessa hora os teus seguidores recebem uma notificação.
              {doneInfo
                ? ` Ainda tens ${doneInfo.left} ${doneInfo.left === 1 ? "evento" : "eventos"} neste mês.`
                : ""}
            </p>
            <ShimmerButton
              onClick={() => {
                setStep("form");
                setTitle("");
                setPhotos([]);
                setAccepted(false);
                setRemoveTouched(false);
              }}
              className="press h-12 w-full rounded-2xl text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              Publicar outro evento
            </ShimmerButton>
            <button
              onClick={() => navigate({ to: "/merchant" })}
              className="press text-sm font-semibold text-muted-foreground underline"
            >
              Voltar ao painel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
