// Regra do cardápio por tipo de negócio (correr: npx vite-node tests/menu-rule.test.mjs)
import {
  getStructure,
  menuLockedByCategory,
  STRUCTURES_BY_FAMILY,
  familyForCategory,
} from "../src/lib/profile-styles.ts";
import { getPlanById } from "../src/lib/subscription-storage.ts";
let f = 0;
const t = (n, c) => {
  console.log((c ? "ok   " : "FALHA ") + n);
  if (!c) f++;
};
const menuStruct = STRUCTURES_BY_FAMILY.comida.find((s) => s.blocks.includes("menu"));
const get = (cat, plan, id) =>
  getStructure(familyForCategory(cat), id, getPlanById(plan).maxStructures, cat, plan);
for (const cat of ["restaurant", "snack_bar", "hotel_restaurant"]) {
  t(`${cat} Starter vê o cardápio`, get(cat, "starter", menuStruct.id).blocks.includes("menu"));
  t(`${cat} Pro vê o cardápio`, get(cat, "pro", menuStruct.id).blocks.includes("menu"));
}
for (const cat of ["bar", "bakery"]) {
  t(`${cat} Free NÃO vê o cardápio`, !get(cat, "free", menuStruct.id).blocks.includes("menu"));
  t(
    `${cat} Starter NÃO vê o cardápio`,
    !get(cat, "starter", menuStruct.id).blocks.includes("menu"),
  );
  t(`${cat} Pro vê o cardápio`, get(cat, "pro", menuStruct.id).blocks.includes("menu"));
  t(`${cat} Premium vê o cardápio`, get(cat, "premium", menuStruct.id).blocks.includes("menu"));
}
t(
  "loja não é afectada",
  !menuLockedByCategory("loja", STRUCTURES_BY_FAMILY.loja[0], "clothing_store", "free"),
);
t(
  "chamada antiga (sem categoria) não muda",
  getStructure("comida", menuStruct.id, 6).id === menuStruct.id,
);
console.log(f ? f + " FALHAS" : "REGRA DO CARDÁPIO: tudo ok");
