# Melhoria gráfica — 2026-10-12

Escopo confirmado pelo owner: melhorar somente o visual do jogo existente. Mecânicas, IA, progressão, controles, colisões e persistência não foram redesenhados.

## Implementado

- Árvores Ashroot do pack local, normalizadas e agrupadas por material em instâncias. Materiais do GLB resolvidos pela paleta semântica; desaparecimento por oclusão preservado. Pedras decorativas agora usam geometria 3D.
- Personagem: placas de armadura, capa, proteção de pernas/braços, adornos e detalhes de escudo, conectados às juntas existentes.
- Armas e ferramentas: guarda, punho, lâmina e acabamentos com materiais de metal, couro e madeira.
- Saqueadores, lobos e fauna: detalhes de traje e volumes anatômicos; comportamento existente preservado.
- Ruínas com alvenaria instanciada, portal, adornos e pedras soltas no mesmo espaço original.
- ACES, pós-processamento mais suave, MSAA no render target, sombras 2048, relevo aparente no terreno e estrada, reflexos locais PBR, água com transições suaves e partículas de cinza. Reflexos diminuem à noite.
- `palette()` voltou a consultar `--world-*`; fallback permanece disponível sem DOM.

## Validação

- TypeScript sem erros; `git diff --check` passou.
- 216 testes existentes passaram em 16 arquivos. No Windows sandbox foi necessário apontar TEMP/TMP para `node_modules/.tmp/visual-validation` para evitar EPERM no cache temporário do Vitest.
- Build de produção concluído com código 0; log em `art/review-graphics/build.log`.
- Câmeras isométrica e terceira pessoa capturadas; após corrigir atributos incompatíveis no merge das árvores, relatório sem erros de console/renderização.
- Interface completa do build validada pelo adaptador local; `art/review-production/report.json` registra `errors: []`, com capturas das duas câmeras. A checagem automatizada de movimento não produziu resultado nessa página; não é apresentada como aprovada.
- Script de captura: `art/visual-review.mjs`; relatórios em `art/review-production/`. A página temporária usada para isolar o mundo 3D foi removida após a validação da interface completa.

## Limites e execução local

O resultado permanece fantasia low-poly estilizada. Não deve ser apresentado como qualidade AAA equivalente a uma produção milionária. Não houve benchmark de FPS em dispositivos representativos, nem validação de todas as condições de iluminação e gameplay.

O servidor de desenvolvimento apresentou timeout de transporte SSR. `vite preview` procura `dist/server/server.js`, enquanto o preset instalado gera `.output/server/index.mjs` para Cloudflare. O adaptador `art/preview-production.mjs` permite revisar esse handler e os assets via HTTP local na porta 8004, sem alterar configuração de deploy. Ele é uma ferramenta de revisão, não substitui testes no runtime Cloudflare.

`graphify update .` foi tentado, mas o launcher instalado falhou com `uv trampoline failed to canonicalize script path`; não havia grafo no projeto antes desta tarefa.

Alterações anteriores em `.gitignore`, diário, assets e piloto Ashland foram preservadas. Nenhum commit, push ou deploy realizado.
