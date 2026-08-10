# Protótipos — Perfil do Comerciante (Estruturas & Temas)

> **Estado: implementado em código real.** Esta pasta guarda o
> protótipo visual original (exploração inicial). A implementação real
> já existe em produção — ver "Onde está a implementação real" abaixo.
> Esta pasta fica só como registo histórico da fase de desenho.

Ficheiros `.jsx` standalone (correm como Artifact no Claude.ai) — não
são importados pela app e não entram no build do Vite.

## Onde está a implementação real

- `src/lib/profile-styles.ts` — Famílias (para Estruturas), Temas, a
  galeria única de fundos (`BACKGROUND_GALLERY`), limite mensal de
  trocas (`countSwapsThisMonth`, `recordThemeSwap`).
- `src/lib/profile-backgrounds-data.ts` — as 28 imagens da galeria, em
  base64, alta qualidade (~8.3MB no total — decisão consciente do
  Abrão de não optimizar para ligações lentas, ver abaixo). Carregadas
  via `import()` dinâmico, nunca no ficheiro principal do app.
- `src/components/ProfileBlocks.tsx` — cada bloco (`BlockCover`,
  `BlockMenu`, `BlockRooms`, etc.) em React/TSX real.
- `src/routes/place.$id.tsx` — perfil público: lê `structure_id` /
  `theme_id` / `block_order` do negócio e renderiza os blocos na ordem
  certa, com o tema escolhido.
- `src/routes/merchant.tsx` — aba **"Visual"**: o comerciante escolhe
  Estrutura e Tema (com cadeado conforme o plano), reordena os blocos
  por arrastar, e vê o contador de trocas usadas este mês.
- `SUPABASE_SETUP.sql` — migração com as colunas novas em `businesses`
  (`structure_id`, `theme_id`, `block_order`) e a tabela
  `theme_swap_log` (histórico de trocas, com RLS).
- `src/lib/subscription-storage.ts` — `maxStructures`,
  `hasMultiCategory`, `themeSwapsPerMonth` em cada `Plan`.

## Contexto

Ideia em desenvolvimento (varredura de 2026-06-28, conversa pós-relatório):
permitir que cada comerciante escolha o layout do seu perfil público,
em vez de todos os negócios da mesma categoria ficarem visualmente
idênticos.

A escolha separa-se em dois eixos independentes:

- **Estrutura** — onde cada bloco vive na página (capa, info, mapa/rota,
  cardápio, galeria, contacto, reserva...) e em que ordem. O comerciante
  pode reordenar os blocos dentro da estrutura escolhida.
- **Tema** — cor de destaque + imagem de fundo (com overlay/gradiente
  por cima para manter o texto legível). Inclui uma opção **LED/Glow**,
  disponível para qualquer categoria de negócio (não só online), com
  cuidado extra de contraste.

## Regras de negócio implementadas

- 17 categorias de negócio agrupadas em **5 famílias** (ver
  `FAMILY_BY_CATEGORY` em `profile-styles.ts`): comida/bebida,
  alojamento, saúde/serviços pessoais, loja/produto físico,
  outros/serviços. Cada família tem o seu próprio conjunto de
  Estruturas (blocos específicos: cardápio, quartos, serviços,
  catálogo, roteiro).
- **Free = 2 estruturas básicas, sem bloco avançado, sem
  multi-categoria.** Planos pagos = Starter 4, Pro 5, Premium 6
  estruturas por família, com bloco avançado e podem activar mais de
  uma categoria no mesmo negócio.
- Estruturas Free incluem botão de Rota destacado (`routeBig` /
  `routeHero`) e bloco de reserva — upgrade visível mesmo sem pagar.
- Botão de "Rota" abre Google Maps / Apple Maps — não é um mapa novo
  dentro da app.
- **Limite mensal de trocas de Estrutura/Tema, incluído no plano**
  (Free 1, Starter 2, Pro 3, Premium 4) — não é compra avulsa.
  Reordenar os blocos dentro da mesma Estrutura/Tema não consome o
  limite. Histórico em `theme_swap_log`.
- Negócios já cadastrados antes desta funcionalidade ficam
  automaticamente em "Clássica" + "Clássico XTACK" (= o layout antigo,
  sem nenhuma mudança visual até o comerciante escolher outra coisa).
- Defesa em profundidade: o limite de estruturas por plano é reforçado
  tanto na escrita (painel do comerciante) como na leitura (perfil
  público), para que um `structure_id` inválido gravado por qualquer
  via fora da UI normal nunca mostre uma estrutura paga a um negócio
  Free.

## Ficheiros desta pasta

- `estruturas-temas-restaurante.jsx` — protótipo interactivo original,
  categoria Restaurante, antes da implementação real.

## Próximos passos (em aberto)

- Decidir se o limite de trocas deve dar algum aviso antecipado (ex:
  "última troca disponível este mês") antes de bloquear.
- Eventualmente desenhar mais Estruturas por família, além das que já
  existem.
- A galeria de fundos tem 28 imagens (resolvido em 2026-06-28, decisão
  explícita do Abrão de ser uma galeria única partilhada, sem
  restrição por categoria, e de não optimizar o peso para ligações
  lentas). Se mais tarde quiser adicionar mais imagens, é só seguir o
  mesmo padrão em `profile-backgrounds-data.ts` + `BACKGROUND_GALLERY`
  em `profile-styles.ts`.

