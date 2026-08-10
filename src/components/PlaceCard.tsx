import { Link } from "@tanstack/react-router";
import { type Place, priceText } from "@/lib/places-data";
import { Icon } from "@/components/Icon";
import { formatDistance } from "@/lib/geo-utils";
import { useT } from "@/lib/i18n";

export function PlaceCard({ place }: { place: Place }) {
  const tr = useT();
  const distStr = formatDistance(place.distanceKm);

  return (
    <Link
      to="/place/$id"
      params={{ id: place.id }}
      className="press group block overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
    >
      <div className="relative h-36 w-full overflow-hidden bg-muted">
        <img
          src={place.cover}
          alt={place.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

        {/* Badge esquerda: Turbinado / Promo / Online */}
        {place.boosted ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-semibold text-white shadow-md">
            <Icon name="flame" size={11} /> {tr("boostedBadge")}
          </span>
        ) : place.isDigital ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-violet-600 px-2.5 py-1 text-[10px] font-semibold text-white shadow-md">
            <Icon name="delivery" size={11} /> {tr("onlineBadge")}
          </span>
        ) : (
          place.promo && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-destructive px-2.5 py-1 text-[10px] font-semibold text-destructive-foreground shadow-md">
              <Icon name="flame" size={11} /> {place.promo}
            </span>
          )
        )}

        {/* Badge direita: Aberto/Fechado (negócios digitais mostram "Online 24h") */}
        {place.isDigital ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-violet-600/90 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            {tr("online24hBadge")}
          </span>
        ) : (
          <span
            className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold backdrop-blur ${place.openNow ? "bg-emerald-500/95 text-white" : "bg-black/55 text-white"}`}
          >
            <span className="relative grid h-1.5 w-1.5 place-items-center">
              <span
                className={`absolute inset-0 rounded-full ${place.openNow ? "bg-white animate-pulse-ring" : ""}`}
              />
              <span
                className={`relative h-1.5 w-1.5 rounded-full ${place.openNow ? "bg-white" : "bg-white/70"}`}
              />
            </span>
            {place.openNow ? tr("open") : tr("closed")}
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
              <Icon name={place.icon} size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <div className="truncate text-base font-semibold text-foreground">{place.name}</div>
                {place.verified && (
                  <Icon
                    name="verified"
                    size={14}
                    className="shrink-0 text-primary"
                    aria-label={tr("verifiedBusinessAria")}
                  />
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {place.categoryLabel} · {priceText(place.priceLevel)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-1 text-sm font-semibold text-foreground">
              <Icon name="star" size={13} className="fill-amber-400 stroke-amber-500" />{" "}
              {place.rating}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {place.reviews} {tr("reviewsCount")}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          {place.isDigital ? (
            <span className="inline-flex items-center gap-1.5 text-violet-600 font-medium">
              <Icon name="delivery" size={12} /> {tr("digitalBusinessLabel")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="navigation" size={12} />
              {distStr || <span className="text-muted-foreground/50">{tr("noGpsLabel")}</span>}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Icon name="clock" size={12} /> {place.hours}
          </span>
        </div>
      </div>
    </Link>
  );
}
