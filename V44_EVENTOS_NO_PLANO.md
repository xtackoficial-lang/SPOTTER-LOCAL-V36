# v44 — Eventos incluídos nos planos Pro e Premium (sem Turbinar)

## O que mudou
- **Turbinar retirado.** O botão saiu do painel `/business` e `/boost` redireciona para o painel.
  Os destaques já pagos continuam a aparecer até acabarem. O código do servidor (`create-zumbopay-payment`,
  tipo `boost`) não foi tocado.
- **Eventos deixaram de ser pagos por dia.** Fazem parte do plano:

| Plano | Eventos por mês |
|---|---|
| Free | não publica |
| Starter | não publica |
| **Pro** | **4** |
| **Premium** | **8** |

- **Dia e hora à escolha**, nos dois extremos: quando o evento começa a aparecer e quando sai da aba Eventos.
- **Quota por mês de publicação.** Um evento agendado para dezembro conta na quota de dezembro. **Apagar um evento
  não devolve a quota** (fica registado em `event_publish_log`).
- A lista de funcionalidades de cada plano (página de planos) mostra a linha nova nas 4 línguas.

## Limites de hora e dia (validados no servidor, migração 017)
| Regra | Valor |
|---|---|
| Horas permitidas (publicar e remover) | horas certas, das 06:00 às 22:00, hora de Maputo |
| Publicar | nunca no passado; no máximo 60 dias à frente |
| Tempo publicado | no mínimo 1 hora, no máximo 30 dias |
| Remover | no máximo 1 dia depois do último dia do evento |
| Quem pode | só o dono do negócio, com plano Pro/Premium **ativo** (não "overdue"/"blocked") |

Para mudar estes números: constantes em `src/lib/event-schedule.ts` **e** os mesmos valores em
`supabase/migrations/017_event_plan_quota.sql` (função `publish_event_scheduled`) — o servidor é quem manda.
A quota do plano está em `eventsPerMonth` (`subscription-storage.ts`) **e** em `_event_quota_for()` na migração.

## Como aplicar
1. SQL Editor do Supabase: correr `supabase/migrations/017_event_plan_quota.sql` (depois da 013; a 014–016 também).
   É idempotente. Enquanto não correres, o formulário avisa que falta a migração e nada se publica.
2. Fazer deploy da app (Vercel). Não há Edge Functions novas nesta versão.
3. Testar com uma conta Pro: agendar um evento para daqui a 2 horas e ver a quota "usaste 1 de 4".

## Testes feitos (nesta máquina)
- Migração 017 corrida duas vezes num PostgreSQL 16 de teste, sem erros.
- No PostgreSQL de teste (com um Supabase simulado): Pro publica 4 e o 5.º é recusado; Premium 8 e o 9.º recusado;
  apagar não devolve quota; Free/Starter/Pro em atraso recusados; passado, +60 dias, minutos ≠ 00, 05h, 23h,
  mais de 30 dias, menos de 1 hora e "sai depois do fim do evento" recusados; outro utilizador e sem sessão recusados;
  `anon` sem permissão; só aparecem eventos publicados e não removidos.
- `tests/event-schedule.test.mjs` (regras da app), `tsc`, `eslint` (0 erros nos ficheiros tocados) e `vite build`.
- **Não testado:** o fluxo completo no browser com o teu Supabase e planos reais.

## Por decidir / a seguir
- Quando todos os telemóveis tiverem a versão nova (é PWA, pode demorar), bloqueia os tipos `boost` e `event` em
  `create-zumbopay-payment`, para ninguém pagar por algo que já não existe. Não o fiz porque a tua versão desse
  ficheiro no repo (v45) é diferente da deste zip.
- Planos antigos: um comerciante Starter perde acesso a publicar eventos (já só Pro/Premium). Eventos que já tinha
  publicados continuam a aparecer até expirarem.
- Botão "Reportar" nos eventos (ver `PLAYSTORE_PREPARACAO.md`, secção 5).
