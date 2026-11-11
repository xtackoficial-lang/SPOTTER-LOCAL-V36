// node tests/r2-keys.test.mjs  (precisa de: npx tsx)
import {
  makeKey,
  isOwnedKey,
  isPublicKind,
  ALLOWED_TYPES,
} from "../supabase/functions/_shared/r2-keys.ts";
let f = 0;
const t = (n, c) => {
  if (!c) {
    f++;
    console.log("FALHOU:", n);
  }
};
const uid = "123e4567-e89b-12d3-a456-426614174000";
const k = makeKey("cover", uid, "image/jpeg", 1700000000000, 0.123456);
t(
  "formato da chave",
  /^cover\/123e4567-e89b-12d3-a456-426614174000\/1700000000000-[a-z0-9]+\.jpg$/.test(k),
);
t("própria pasta", isOwnedKey(k, uid));
t("pasta de outro", !isOwnedKey(k, "223e4567-e89b-12d3-a456-426614174000"));
t("path traversal", !isOwnedKey(`cover/${uid}/../x.jpg`, uid));
t("sub-pasta", !isOwnedKey(`cover/${uid}/a/1-a.jpg`, uid));
t("kind inválido", !isOwnedKey(`chat/${uid}/1-a.jpg`, uid));
t("extensão inválida", !isOwnedKey(`cover/${uid}/1-a.html`, uid));
t("kinds", isPublicKind("gallery") && !isPublicKind("chat") && !isPublicKind(undefined));
let threw = false;
try {
  makeKey("cover", uid, "text/html");
} catch {
  threw = true;
}
t("recusa html", threw);
threw = false;
try {
  makeKey("cover", "../../x", "image/png");
} catch {
  threw = true;
}
t("recusa uid falso", threw);
t("tipos", Object.keys(ALLOWED_TYPES).length === 3);
console.log(f ? `${f} FALHAS` : "r2-keys: todos passaram");
process.exit(f ? 1 : 0);
