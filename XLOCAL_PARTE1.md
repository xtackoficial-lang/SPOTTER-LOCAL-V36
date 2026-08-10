# XLOCAL — Parte 1: Base + UI + PWA + QR + Mensalidade

## O que foi adicionado nesta versão

### Ficheiros novos
| Ficheiro | O que faz |
|---|---|
| `src/routes/qr.tsx` | Scanner QR completo com câmera, histórico e entrada manual |
| `src/routes/subscribe.tsx` | Página de planos (Starter/Pro/Premium) com pagamento M-Pesa, e-Mola e transferência |
| `src/routes/products.tsx` | CRUD completo de produtos para comerciantes |
| `src/lib/qr-storage.ts` | Histórico persistente de QR codes lidos |
| `src/lib/subscription-storage.ts` | Sistema de mensalidade com trial, status e bloqueio |
| `src/lib/products-storage.ts` | Gestão de produtos por negócio com localStorage |

### Ficheiros modificados
| Ficheiro | O que mudou |
|---|---|
| `src/components/BottomNav.tsx` | Adicionada tab "QR Scan" no menu inferior |
| `src/components/Icon.tsx` | Adicionado ícone `qr` (QrCode) |
| `src/routes/business.tsx` | Painel mostra plano actual, trial, bloqueio, links para produtos/QR/planos |
| `src/routeTree.gen.ts` | Registadas rotas /qr, /subscribe, /products |
| `public/manifest.webmanifest` | Actualizado com shortcuts e tema correcto |

## Sistema de Mensalidade

### Planos
- **Starter** — 300 MZN/mês — 10 produtos
- **Pro** — 500 MZN/mês — 50 produtos (mais popular)
- **Premium** — 900 MZN/mês — ilimitado + destaque

### Ciclo de vida
1. Comerciante regista-se → **Trial gratuito de 14 dias**
2. Trial expira → estado muda para **overdue** (aviso)
3. Sem pagamento em 30 dias → estado muda para **blocked**
4. Comerciante paga → estado volta a **active**

### Métodos de pagamento simulados (Parte 3 integra API real)
- M-Pesa (84x)
- e-Mola (86x)
- Transferência bancária (BCI)

## Scanner QR
- Usa a API nativa **BarcodeDetector** (Chrome/Android) — zero custo
- Fallback com canvas para outros browsers
- Campo manual para colar URLs
- Histórico dos últimos 50 scans

## Como instalar e executar
```bash
bun install
bun run dev
```

## Parte 2 (a fazer)
- Painel Admin XTACK completo
- Verificação de documentos do comerciante
- Notificações push de mensagens

## Parte 3 (a fazer)
- Integração real M-Pesa API (Vodacom Mozambique)
- Integração real e-Mola API (Tmcel)
- Supabase backend (tabelas, auth, RLS)
- Bloqueio automático server-side
