# Assets da cidade (visão de base)

Sprites isométricos das construções da base, 20 níveis cada, gerados por IA
(Codex + GPT Image) e recortados por script.

## Arquivos

| Arquivo | O que é |
|---|---|
| `buildings.json` | Fonte da verdade: estilo, eras e a descrição visual de cada um dos 20 níveis de cada construção |
| `build_manifest.py` | Gera `manifest.json` a partir de `buildings.json` |
| `manifest.json` | Mapa completo: prompt exato de cada sheet + arquivo final de cada nível |
| `generate.py` | Roda o Codex (`gpt-5.6-luna`, esforço `medium`) e salva as sheets em `sheets/` |
| `cut_sprites.py` | Remove o fundo, separa os 4 quadrantes e salva os sprites finais |
| `sheets/` | Sheets brutas (fora do git, ~2 MB cada, regeneráveis) |

Sprites finais: `public/assets/city/buildings/<id>/lvl-NN.webp` (384×384, fundo transparente).

## Como funciona

Cada imagem gerada é uma sheet 2×2 com 4 níveis consecutivos da mesma construção.
São 5 sheets por construção, uma por era:

| Sheet | Níveis | Era | Materiais |
|---|---|---|---|
| s1 | 1–4 | Era da Pele | peles, galhos, corda, ossos |
| s2 | 5–8 | Era da Madeira | toras, palha, paliçada |
| s3 | 9–12 | Era da Pedra | muros de pedra, fundações, vigas |
| s4 | 13–16 | Era do Bronze | blocos talhados, bronze, telhas de barro |
| s5 | 17–20 | Era do Ferro | fortificação, ferro, estandartes, cristais arcanos |

A sheet N recebe a sheet N-1 como imagem de referência, o que mantém estilo,
câmera e escala ao longo dos 20 níveis.

## Construções

`tribe_hall` Salão da Tribo · `lumber_camp` Acampamento de Lenhadores · `quarry` Pedreira ·
`hunting_lodge` Cabana de Caça · `war_camp` Campo de Guerra · `scout_tent` Tenda dos Batedores ·
`forge` Forja · `shaman_circle` Círculo do Xamã

Total: 8 construções × 5 sheets = 40 gerações → 160 sprites.

## Regenerar

```bash
python art/city/build_manifest.py          # após editar buildings.json
python art/city/generate.py --workers 4    # retomável: pula sheets que já existem
python art/city/cut_sprites.py             # --force para recortar tudo de novo
```

Para refazer uma sheet, apague o PNG em `sheets/` e rode `generate.py` de novo
(as sheets seguintes da mesma construção usam ela como referência).

Requisitos: Codex CLI logado (a geração de imagem usa a cota do plano), Python com Pillow e numpy.
