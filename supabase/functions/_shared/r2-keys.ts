// Regras puras (sem rede) para as chaves das imagens no R2 — testadas em tests/r2-keys.test.mjs.
export const PUBLIC_KINDS = ["cover", "gallery", "product", "post", "event", "room"] as const;
export type PublicKind = (typeof PUBLIC_KINDS)[number];

export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_BYTES = 6 * 1024 * 1024; // a app já comprime para ~200-600 KB; 6 MB é folga

export function isPublicKind(k: unknown): k is PublicKind {
  return typeof k === "string" && (PUBLIC_KINDS as readonly string[]).includes(k);
}

/** Chave sempre dentro da pasta do utilizador autenticado — o cliente não escolhe o caminho. */
export function makeKey(kind: PublicKind, uid: string, contentType: string, now = Date.now(), rnd = Math.random() || 0.123456): string {
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) throw new Error("tipo de ficheiro não permitido");
  if (!/^[0-9a-f-]{36}$/i.test(uid)) throw new Error("utilizador inválido");
  return `${kind}/${uid}/${now}-${rnd.toString(36).slice(2, 8)}.${ext}`;
}

/** Só pode apagar ficheiros da própria pasta (kind/uid/ficheiro) e sem truques de caminho. */
export function isOwnedKey(key: unknown, uid: string): key is string {
  if (typeof key !== "string" || key.length > 200) return false;
  const parts = key.split("/");
  if (parts.length !== 3) return false;
  const [kind, owner, file] = parts;
  if (!isPublicKind(kind) || owner.toLowerCase() !== uid.toLowerCase()) return false;
  return /^[0-9]+-[a-z0-9]{1,8}\.(jpg|png|webp)$/i.test(file);
}
