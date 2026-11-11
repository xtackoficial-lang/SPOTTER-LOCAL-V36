// Forma da galeria do perfil (correr: npx vite-node tests/gallery-layout.test.mjs)
import {
  galleryLayoutFromBlockOrder,
  withGalleryLayout,
  getStructure,
  STRUCTURES_BY_FAMILY,
  DEFAULT_GALLERY_LAYOUT,
  GALLERY_LAYOUTS,
} from "../src/lib/profile-styles.ts";
let f = 0;
const t = (n, c) => {
  console.log((c ? "ok   " : "FALHA ") + n);
  if (!c) f++;
};
const order = ["cover", "info", "gallery", "about"];

t("predefinida = fila deslizante (como era antes)", DEFAULT_GALLERY_LAYOUT === "strip");
t("3 formas disponíveis: strip, mosaic, grid", GALLERY_LAYOUTS.join() === "strip,mosaic,grid");
t("sem etiqueta → fila", galleryLayoutFromBlockOrder(order) === "strip");
t(
  "null/undefined → fila",
  galleryLayoutFromBlockOrder(null) === "strip" &&
    galleryLayoutFromBlockOrder(undefined) === "strip",
);
t("etiqueta inválida → fila", galleryLayoutFromBlockOrder([...order, "galeria:xyz"]) === "strip");
for (const l of ["mosaic", "grid"]) {
  const saved = withGalleryLayout(order, l);
  t(`guardar ${l} e ler de volta`, galleryLayoutFromBlockOrder(saved) === l);
  t(
    `${l}: os blocos ficam intactos e a etiqueta vai no fim`,
    saved.slice(0, 4).join() === order.join() && saved.length === 5,
  );
}
t(
  "fila não deixa etiqueta (a base de dados fica igual à de antes)",
  withGalleryLayout(order, "strip").join() === order.join(),
);
t(
  "mudar de grelha para mosaico não acumula etiquetas",
  withGalleryLayout(withGalleryLayout(order, "grid"), "mosaic").filter((b) =>
    b.startsWith("galeria:"),
  ).length === 1,
);
t(
  "mudar de grelha para fila remove a etiqueta",
  !withGalleryLayout(withGalleryLayout(order, "grid"), "strip").some((b) =>
    b.startsWith("galeria:"),
  ),
);

// A etiqueta não pode estragar a ordem dos blocos no perfil (place.$id filtra pelos blocos da estrutura)
const fam = "comida";
const st = STRUCTURES_BY_FAMILY[fam][0];
const saved = withGalleryLayout(st.blocks, "grid");
const shownOrder = [
  ...saved.filter((b) => st.blocks.includes(b)),
  ...st.blocks.filter((b) => !saved.includes(b)),
];
t(
  "a etiqueta é ignorada na ordem dos blocos (nada duplicado nem a mais)",
  shownOrder.join() === st.blocks.join(),
);
t("getStructure continua a funcionar", getStructure(fam, st.id, 6).id === st.id);
console.log(f ? f + " FALHAS" : "FORMA DA GALERIA: tudo ok");
process.exit(f ? 1 : 0);
