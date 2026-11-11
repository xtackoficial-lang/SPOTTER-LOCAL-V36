# Teste de fotos no browser (carrossel, mosaico, visualizador com zoom)
Precisa de Chromium via Playwright (`npm i -D playwright`).
```
npx vite --config tests/e2e-fotos/vite.config.mjs        # na raiz do projeto; porta 5199
node tests/e2e-fotos/teste-visualizador.cjs              # noutro terminal
```
Simula um telemóvel: toque, duplo toque, pinça, deslizar, miniaturas, "+N" no mosaico. Tem de acabar com "consola sem erros" e nenhuma linha "FALHA".

## Seletor da forma da galeria (editor do comerciante)
`tests/e2e-fotos/teste-editor-galeria.cjs` abre `/merchant` → Visual com um comerciante de teste, escolhe Fila/Mosaico/Grelha, guarda e reabre. Instruções no topo do ficheiro.
