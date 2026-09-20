// ============================================================
// SPOTTER — Gerir quartos (dashboard do comerciante)
// ------------------------------------------------------------
// Lista os quartos do negócio, permite adicionar/editar (nome,
// capacidade, preço/noite, 1 foto), ligar/desligar (active), e marcar
// "Ocupado até [data]" — 100% manual, sem calendário automático (ver
// nota do desenho em memória: decidido assim de propósito).
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import {
  fetchAllRoomsForBusiness,
  createRoom,
  updateRoom,
  setRoomActive,
  setRoomOccupiedUntil,
  type BusinessRoom,
} from "@/lib/reservations-db";
import { uploadMedia } from "@/lib/storage-upload";
import { useAuth } from "@/lib/auth-context";
import { useOnboarding } from "@/lib/onboarding-storage";
import { RequireBusiness } from "@/components/RequireBusiness";

export const Route = createFileRoute("/manage-rooms")({
  head: () => ({ meta: [{ title: "Gerir quartos — Spotter Local" }] }),
  component: () => (
    <RequireBusiness>
      <ManageRoomsPage />
    </RequireBusiness>
  ),
});

function RoomForm({
  businessId,
  existing,
  onSaved,
  onCancel,
}: {
  businessId: string;
  existing: BusinessRoom | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [capacity, setCapacity] = useState(String(existing?.capacity ?? "2"));
  const [price, setPrice] = useState(String(existing?.pricePerNight ?? ""));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(existing?.photoUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const handlePickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!name.trim() || !capacity || !price) {
      setError("Preenche o nome, a capacidade e o preço.");
      return;
    }
    if (!user) {
      setError("Precisas de ter sessão iniciada.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      let photoUrl = existing?.photoUrl ?? null;
      if (photoFile) {
        // CORREÇÃO (varredura 2026-09-19): a política de Storage exige
        // auth.uid() na 2ª pasta do caminho — businessId nunca bate com
        // isso (é gerado à parte), o upload seria rejeitado em silêncio.
        photoUrl = await uploadMedia(photoFile, "room", user.id);
      }
      if (existing) {
        await updateRoom(existing.id, {
          name: name.trim(),
          capacity: Number(capacity),
          pricePerNight: Number(price),
          photoUrl,
        });
      } else {
        await createRoom(businessId, {
          name: name.trim(),
          capacity: Number(capacity),
          pricePerNight: Number(price),
          photoUrl,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível guardar o quarto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handlePickPhoto}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="press flex h-36 w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-background"
      >
        {photoPreview ? (
          <img src={photoPreview} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <Icon name="image" size={22} />
            <span className="text-xs">Adicionar foto do quarto</span>
          </div>
        )}
      </button>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do quarto (ex: Quarto Duplo)"
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          value={capacity}
          onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder="Nº pessoas"
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
          inputMode="decimal"
          placeholder="Preço/noite (MT)"
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="press h-11 flex-1 rounded-full border border-border text-sm font-semibold"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="press h-11 flex-1 rounded-full text-sm font-semibold text-primary-foreground disabled:opacity-60"
          style={{ background: "var(--gradient-primary)" }}
        >
          {saving ? "A guardar…" : "Guardar quarto"}
        </button>
      </div>
    </div>
  );
}

function RoomCard({ room, onChanged }: { room: BusinessRoom; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [showOccupiedInput, setShowOccupiedInput] = useState(false);
  const [occupiedDate, setOccupiedDate] = useState(room.occupiedUntil ?? "");
  const businessId = room.businessId;

  if (editing) {
    return (
      <RoomForm
        businessId={businessId}
        existing={room}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const isOccupied =
    !!room.occupiedUntil && room.occupiedUntil >= new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex gap-3">
        <div className="h-16 w-16 flex-none overflow-hidden rounded-xl bg-background">
          {room.photoUrl && (
            <img src={room.photoUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">{room.name}</h3>
            <button
              onClick={async () => {
                await setRoomActive(room.id, !room.active);
                onChanged();
              }}
              className={`press rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                room.active
                  ? "bg-emerald-500/10 text-emerald-700"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {room.active ? "Ativo" : "Inativo"}
            </button>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {room.capacity} pessoas · {room.pricePerNight} MT/noite
          </p>
          {isOccupied && (
            <p className="mt-1 text-xs font-semibold text-amber-600">
              Ocupado até {room.occupiedUntil}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setEditing(true)}
          className="press h-9 flex-1 rounded-full border border-border text-xs font-semibold"
        >
          Editar
        </button>
        <button
          onClick={() => setShowOccupiedInput((v) => !v)}
          className="press h-9 flex-1 rounded-full border border-border text-xs font-semibold"
        >
          {isOccupied ? "Alterar ocupação" : "Marcar ocupado"}
        </button>
      </div>

      {showOccupiedInput && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="date"
            value={occupiedDate}
            onChange={(e) => setOccupiedDate(e.target.value)}
            className="h-10 flex-1 rounded-xl border border-border bg-background px-2 text-sm"
          />
          <button
            onClick={async () => {
              await setRoomOccupiedUntil(room.id, occupiedDate || null);
              setShowOccupiedInput(false);
              onChanged();
            }}
            className="press h-10 rounded-full px-3 text-xs font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            Guardar
          </button>
          {isOccupied && (
            <button
              onClick={async () => {
                await setRoomOccupiedUntil(room.id, null);
                setShowOccupiedInput(false);
                onChanged();
              }}
              className="press h-10 rounded-full border border-border px-3 text-xs font-semibold"
            >
              Limpar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ManageRoomsPage() {
  const navigate = useNavigate();
  const { draft } = useOnboarding();
  const businessId = draft.business.businessId || "default";
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingNew, setAddingNew] = useState(false);

  const reload = () => {
    setLoading(true);
    fetchAllRoomsForBusiness(businessId).then((list) => {
      setRooms(list);
      setLoading(false);
    });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <button onClick={() => navigate({ to: "/business" })} className="press rounded-full p-1">
          <Icon name="chevronLeft" size={22} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Gerir quartos</h1>
      </div>

      <div className="mx-auto max-w-md px-4 py-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Cada quarto que criares aqui aparece como opção de reserva no teu perfil. Um quarto
          inativo, ou marcado como ocupado, fica visível mas não pode ser reservado.
        </p>

        {addingNew ? (
          <RoomForm
            businessId={businessId}
            existing={null}
            onSaved={() => {
              setAddingNew(false);
              reload();
            }}
            onCancel={() => setAddingNew(false)}
          />
        ) : (
          <button
            onClick={() => setAddingNew(true)}
            className="press flex h-11 w-full items-center justify-center gap-2 rounded-full border border-dashed border-border text-sm font-semibold text-foreground"
          >
            <Icon name="plus" size={16} /> Adicionar quarto
          </button>
        )}

        {loading ? (
          <p className="text-center text-sm text-muted-foreground">A carregar…</p>
        ) : rooms.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Ainda não criaste nenhum quarto.
          </p>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} onChanged={reload} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
