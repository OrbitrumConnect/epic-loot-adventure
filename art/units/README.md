# Sprites das tropas

Quatro WebP RGBA de 256 x 256 em `public/assets/units/`: `warrior`, `spearman`, `archer`, `scout`.

`units.json` define estilo, fundo e ordem da sheet: guerreiro/lanceiro na linha superior, arqueiro/batedor na inferior. `sheets/troops.png` conserva a sheet fonte 2x2. `preview.png` mostra recortes em 144, 48 e 32 px, nessa ordem horizontal. `prompt.txt` registra o prompt inicial.

## Pipeline reutilizado

`generate.py` e `cut_sprites.py` foram copiados de `art/items/`, alterando somente caminhos de uso, nome do JSON e pasta de saída. Mesma geração Codex, chroma key, despill, enquadramento e WebP quality=92. Execute da raiz:

```powershell
python art/units/generate.py --only troops
python art/units/cut_sprites.py --size 256 --force
```

A geração pula sheets existentes. Para regenerar, arquive antes `sheets/troops.png`. Geração exige o Codex e modelo configurados pelo script original.

Entrega inicial gerada pela ferramenta imagegen integrada com o prompt do próprio `generate.py`; uma edição corrigiu fundo transparente indevido e preservou os quatro desenhos. Saída nativa: 1254 x 1254. Pixels de fundo dentro da distância 70 do magenta (mesmo limiar do recortador) foram normalizados para RGB(255,0,255), sem alterar personagens. Recorte executado pelo script reutilizado.

## Direção de arte

Couro costurado, ocre, tecido vermelho-ferrugem, osso e metal reaproveitado conectam tropas aos itens existentes. Guerreiro: facão curto e proteção simples. Lanceiro: lança alta, escudo alongado e reforços de sucata. Arqueiro: arco grande, aljava, proteção leve com acabamento mais elaborado; evolução por especialização. Batedor: mochila, cantil e mão sobre os olhos; exploração reconhecível sem armamento caro.

Sem integração ao jogo nesta entrega.
