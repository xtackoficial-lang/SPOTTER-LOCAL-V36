/* eslint-disable @typescript-eslint/no-explicit-any */
import "../../src/styles.css";
import { createRoot } from "react-dom/client";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { BlockGallery } from "@/components/ProfileBlocks";
const img = (n: number) => `/tests/e2e-fotos/img/${n}.jpg`;
const theme: any = {
  border: "#ddd",
  accent: "#c00",
  accentSoft: "#fee",
  text: "#111",
  sub: "#666",
};
const mk = (n: number, layout = "strip") =>
  ({
    place: {
      name: "Teste",
      gallery: Array.from({ length: n }, (_, i) => img((i % 7) + 1)),
      blockOrder: layout === "strip" ? undefined : ["cover", "gallery", `galeria:${layout}`],
    },
    theme,
  }) as any;
createRoot(document.getElementById("r")!).render(
  <div style={{ maxWidth: 420, margin: "0 auto" }}>
    <div id="carousel">
      <PhotoCarousel photos={[1, 2, 3, 4, 5].map(img)} alt="evento" />
    </div>
    <div id="carousel7">
      <PhotoCarousel photos={[1, 2, 3, 4, 5, 6, 7].map(img)} alt="sete" />
    </div>
    <div id="single">
      <PhotoCarousel photos={[img(6)]} alt="uma" className="aspect-[4/5]" />
    </div>
    {(["strip", "mosaic", "grid"] as const).flatMap((l) =>
      [1, 2, 3, 4, 5, 7, 12, 26].map((n) => (
        <div key={l + n} id={`${l}${n}`}>
          <BlockGallery ctx={mk(n, l)} />
        </div>
      )),
    )}
  </div>,
);
