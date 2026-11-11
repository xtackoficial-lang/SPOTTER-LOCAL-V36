// ============================================================
// SPOTTER — O que se pode e não se pode publicar (eventos e mais)
// ------------------------------------------------------------
// Uma só lista, usada no painel do comerciante e na página de publicar.
// Também é a base das regras de conteúdo exigidas pela Google Play.
// ============================================================
export const PUBLICATION_IDEAS: string[] = [
  "Festas, concertos, música ao vivo e noites temáticas",
  "Feiras, mercados e exposições (ex.: feira de artesanato)",
  "Inaugurações, aniversário do negócio, novo menu ou novos quartos",
  "Promoções com data (ex.: happy hour, pacote de fim de semana)",
  "Workshops, aulas, torneios e eventos desportivos",
  "Campanhas solidárias e eventos da comunidade",
  "Fotos reais do local, do evento e dos teus produtos",
];

export const PUBLICATION_RULES: string[] = [
  "Conteúdo sexual, nudez, violência ou que incite ao ódio ou à discriminação",
  "Venda de drogas, armas, medicamentos sem receita ou outros produtos ilegais",
  "Burlas, esquemas de dinheiro fácil, prémios falsos ou informação enganosa",
  "Propaganda política ou partidária",
  "Fotos de outras pessoas sem autorização, ou fotos da internet que não são tuas",
  "Publicidade a outros negócios, links de spam ou grupos externos",
  "O mesmo evento publicado várias vezes só para ganhar destaque",
];

export const PUBLICATION_ENFORCEMENT =
  "Publicações que não cumprem estas regras podem ser removidas e a conta pode ser suspensa. Qualquer cliente pode denunciar uma publicação.";

/** Máximo de fotos por publicação (espelho da migração 018). */
export const MAX_PUBLICATION_PHOTOS = 10;
