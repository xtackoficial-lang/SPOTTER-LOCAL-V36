// Testa o texto da notificação de nova publicação.  Correr: node tests/event-notify.test.mjs
import assert from "node:assert/strict";
import { buildEventNotification } from "../supabase/functions/_shared/event-notify.ts";

assert.deepEqual(
  buildEventNotification({
    business_name: "Hotel Bom Gosto",
    title: "Feira de Artesanato",
    photo_count: 1,
  }),
  { title: "Hotel Bom Gosto publicou uma foto", body: "Feira de Artesanato" },
);
assert.equal(
  buildEventNotification({ business_name: "Casa do Mar", title: "Festa", photo_count: 5 }).title,
  "Casa do Mar publicou 5 fotos",
);
assert.equal(
  buildEventNotification({ business_name: "X", title: "Y", photo_count: 0 }).title,
  "X publicou uma foto",
); // nunca "0 fotos"
assert.equal(
  buildEventNotification({ business_name: "", title: "Y", photo_count: 2 }).title,
  "Um negócio publicou 2 fotos",
);
const long = buildEventNotification({
  business_name: "N".repeat(80),
  title: "T ".repeat(100),
  photo_count: 1,
});
assert.ok(long.title.length <= 50 + " publicou uma foto".length + 1);
assert.ok(long.body.length <= 120 && long.body.endsWith("…"));
assert.equal(
  buildEventNotification({
    business_name: "A",
    title: "  muitos \n espaços   aqui ",
    photo_count: 1,
  }).body,
  "muitos espaços aqui",
);
console.log("event-notify: todos passaram");
