---
name: tribos-visual-articulado
description: "DIREÇÃO VISUAL (selada Pedro 08/10): separar gameplay×visual (Entity = Gameplay + Visual) = mesma fundação do asset-swap; personagem articulado (cotovelo/joelho) com rig hierárquico de segmentos (não skinned); REGRA do orçamento de performance. Ordem: personagem → camada visual/registry → polimento."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-08
---

# TRIBOS — Direção Visual: personagem articulado + camada visual (selada 08/10)

Afia e dá corpo ao "asset-swap ready" selado na sessão 8. Serve a [[tribos-visao-pos-colapso]]
(diferencial = **mecânica + arte própria**, não asset genérico de IA). Conversa Pedro×GPT.

## Regra-mãe (selada, Pedro×GPT 08/10)

> **O primeiro objetivo do sistema visual não é deixar tudo bonito; é tornar o visual SUBSTITUÍVEL.**

Decorrência: dá pra ficar agora com **personagem low-poly + articulação simples** e, semanas depois,
plugar um modelo muito melhor **sem tocar** em combate, HP, IA, loot, movimento, PvP, raid, mundo
aberto. Vale igual pra animais e objetos. "Bonito" vem depois; "trocável" vem primeiro.

**Sockets** (pontos de encaixe que a articulação já cria): `head · chest · hand_L · hand_R · back · foot_L · foot_R`.
O asset visual entra na camada visual por esses pontos; a entidade continua a mesma.

## Princípio: separar gameplay × visual

Toda entidade = **Gameplay** (vida, física, interação, IA) **+ Visual** (modelo, rig, materiais,
animações, sockets). O gameplay não conhece o modelo; o visual é **trocável** sem reescrever regra.
É a MESMA fundação do registry de props — agora com o visual estruturado pra evoluir.

```
ENTITY
 ├── Gameplay  (vida · física · interação · IA)   ← dado único (posição/altura/colisor já existem)
 └── Visual    (modelo · rig · materiais · animações · sockets)  ← trocável
```

## Personagem articulado (o maior salto visual AGORA)

Hoje o personagem é blocos retos (ver análise no diário 08/10): pernas/braço retos, pivô no centro,
braço direito ausente (só a arma). Evoluir pra **hierarquia articulada**, mantendo o low-poly:

- **Perna:** quadril → coxa → **joelho** → canela → pé.
- **Braço:** ombro → braço superior → **cotovelo** → antebraço → mão (a direita segura a arma).
- Juntas (cotovelo/joelho) = volume arredondado **parcialmente embutido**, não esfera solta.
- **Rig hierárquico de segmentos** (grupos pai→filho com pivô/rotação), **NÃO** skeletal/skinned
  (exagero e peso pro low-poly). Reusa o `walkCycle`/animação que já existe.
- Mesma ideia vale pra bichos (corpo→cabeça→mandíbula→patas→cauda); animal nem precisa de precisão humana.

## REGRA selada — Orçamento de performance

> Toda melhoria visual deve respeitar um orçamento de performance. **Não aumentar geometria,
> texturas, draw calls ou animações sem justificar o custo.**

Ferramentas: **instancing** (árvores/pedras/vegetação — já usado), **LOD** (longe = simples),
**frustum culling**, **materiais/texturas compartilhados**, rig só onde precisa, versões simples pra
objetos/jogadores distantes (ex.: raid cheia). Não deixar "o boneco lindo e o navegador a 12 FPS".

## Ordem (checklist pro elite)

1. **Articular o personagem** (cotovelo/joelho/ombro/quadril + proporções + braço direito real) — aditivo, barato, maior diferença percebida. **Começa aqui.**
2. **Extrair a camada visual / registry** (asset-swap) — Gameplay×Visual aplicado a props e bichos.
3. **Polimento gráfico incremental** (materiais com roughness/propriedades, sombras/AO, ambiente menos "blocado", névoa) — sob o orçamento.
4. **Performance** (LOD, dynamic resolution) e, **só se valer e sem reescrever**, WebGPU + temporal upscale.

## NÃO agora

WebGPU migration, DLSS/upscaling, rig skinned completo, refatoração estética do código inteiro.
WebGL dá conta; o personagem articulado rende mais que qualquer upscaler neste momento.
