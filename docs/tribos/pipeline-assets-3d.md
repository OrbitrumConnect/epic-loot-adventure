# TRIBOS — contrato de referência 2D → asset 3D runtime

## Decisão central

PNG isolado serve para conceito, ícone ou sprite. Não serve como fonte única para modelo 3D confiável.

Pipeline-alvo:

```text
direção visual → pacote de referências coerentes → blockout 3D → malha final → materiais → rig/sockets → animação → GLB/runtime → teste dentro do jogo
```

O pacote de imagens reduz ambiguidade. Geometria, topologia, UV, rig, animação, colisão e otimização continuam sendo etapas próprias.

## Pacote obrigatório por asset

### 1. Todos os assets

- `hero-sheet.png`: frente, costas, perfil esquerdo, perfil direito, 3/4 frente e 3/4 costas.
- `ortho-sheet.png`: frente, costas, esquerda, direita, topo e base; câmera ortográfica, escala idêntica.
- `silhouette.png`: máscara preto/branco, sem sombra externa.
- `palette-materials.png`: cores planas separadas por material; pele, tecido, metal, osso, cristal, emissivo.
- `detail-sheet.png`: closeups de elementos que definem identidade; sem perspectiva conflitante.
- `design.json`: escala, altura, sockets, materiais, triângulos-alvo, nomes de partes e regras de leitura.

### 2. Personagem principal e inimigo

- corpo inteiro em A-pose neutra; T-pose somente se rig exigir.
- mãos abertas visíveis; dedos simplificados e contáveis.
- pés separados, joelhos e cotovelos legíveis.
- rosto/máscara em closeup frontal + 3/4.
- equipamento removível separado: cabeça, peito, mãos, costas, pés.
- `pose-sheet.png`: idle, caminhada, corrida, ataque primário, ataque secundário, dano, morte.
- `rig-guide.png`: pivôs de ombro, cotovelo, pulso, quadril, joelho, tornozelo, pescoço e sockets.
- proporções fixas entre vistas; sem pose dinâmica nas vistas ortográficas.

### 3. Arma

- frente, costas, perfil, topo, 3/4 e vista desmontada.
- empunhadura destacada e escala compatível com `hand_L`/`hand_R`.
- ponto de origem, eixo de mira, boca/cabeça de impacto e área de colisão.
- variantes: guardada, equipada, disparo/ativação, impacto.
- peças móveis explicitadas: gatilho, ferrolho, lâmina, corda, tambor, núcleo.

### 4. Árvore/prop

- frente, costas, laterais, topo e 3/4.
- base de contato clara para encaixe no terreno.
- partes separadas: tronco, galhos, folhas, frutos/luzes, raízes decorativas.
- versão `LOD0`, `LOD1`, `LOD2` como referência de complexidade visual.
- variante modular para instancing: tronco-base + 2–4 conjuntos de copa.

## O que deve ser imagem e o que deve ser dado

| Necessidade | Imagem resolve? | Entrega correta |
|---|---:|---|
| Silhueta, paleta, materiais | Sim | multi-view + palette/material sheet |
| Forma 3D sem ambiguidade | Parcial | ortho + 3/4 coerentes |
| Topologia, edge loops, deformação | Não | malha Blender editável |
| Rig e animação | Não | armature + clips/actions |
| Colisão e gameplay | Não | collider/metadata no runtime |
| LOD/performance | Não | versões de malha + métricas |
| Shader/emissivo | Parcial | material IDs + mapas + parâmetros |

## Entrega 3D final por asset

```text
<asset>.blend                 # fonte editável
<asset>.glb                   # runtime
<asset>-collision.glb         # colisão simples, se necessário
textures/<asset>-albedo.webp
textures/<asset>-normal.webp
textures/<asset>-orm.webp     # occlusion / roughness / metallic
textures/<asset>-emissive.webp
animations/<asset>.glb        # clips, quando aplicável
<asset>.json                  # escala, sockets, bounds, LOD, materiais, gameplay tags
```

### Contrato inicial de runtime

- personagem/inimigo: 5k–15k triângulos no LOD gameplay; LOD distante abaixo disso.
- arma: 500–4k triângulos conforme importância.
- árvore: 300–3k triângulos; instancing obrigatório para grupos.
- materiais compartilhados; evitar material único por peça sem necessidade.
- sockets mínimos: `head`, `chest`, `hand_L`, `hand_R`, `back`, `foot_L`, `foot_R`.
- pivôs em juntas; braço e perna articulados por hierarquia de segmentos, conforme direção visual existente.
- exportar com escala consistente e origem documentada.

## Animações mínimas

### Herói

`idle`, `walk`, `run`, `attack_primary`, `attack_secondary`, `hit`, `death`, `interact`, `equip`, `unequip`.

### Inimigo

`idle`, `alert`, `walk`, `run`, `attack`, `hit`, `stagger`, `death`.

### Arma

Sem rig próprio quando estática. Rig separado só para partes móveis ou ataques especiais.

## Critérios de aceitação

1. Silhueta bate nas seis vistas principais.
2. Heroína/herói e inimigo continuam reconhecíveis em thumbnail.
3. Arma encaixa no socket sem escala/rotação manual por cena.
4. Animações não quebram ombros, cotovelos, quadris, joelhos ou mãos.
5. Collider acompanha volume jogável, não detalhe visual.
6. GLB abre no viewer e no mundo Three.js sem material ausente.
7. LOD, draw calls, triângulos e textura ficam dentro do orçamento.
8. Screenshot no jogo mantém direção visual aprovada.

## Próxima execução recomendada

Não converter 120 PNGs em massa ainda. Escolher 1 pack e produzir piloto completo:

1. herói;
2. inimigo;
3. arma do herói;
4. árvore/prop;
5. Blender + GLB + animações + sockets;
6. integração no `game-world.tsx`;
7. teste visual, interação e performance;
8. congelar template e só então escalar para demais packs.

## Registro de gate visual — Ashland, round 2 (2026-10-11)

Referências revisitadas individualmente: `art/packs/01-ashland-lowpoly/{tree,weapon,hero,enemy}.png` e `references/hero-turnaround.png`. Comparação do preview feito no Blender contra PNGs: os quatro modelos ainda estão abaixo da fidelidade visual de referência; esta rodada não aprova o piloto para produção.

Revisão independente do round 2 (silhueta/proporção / composição / cor/material / detalhe): árvore **4/5/3/2**, arma **5/4/3/2**, herói **3/4/4/2**, inimigo **4/5/3/2**. O herói é o maior gap de silhueta; detalhe de superfície é o gate mais fraco nos quatro.

- Árvore: tronco curvo mais largo, galhos varridos, raízes expostas orgânicas; emissivo ciano preservado. Ainda falta casca irregular/cristais e silhueta mais próxima da árvore retorcida da referência.
- Arma: contorno de cutelo ampliado/recortado; abertura de amarração agora é furo booleano real, não esfera escura simulando abertura. Ainda falta lâmina com espessura/formas de ferrugem e gaiola de reator mais integrada.
- Herói: mantidos rig, clips e sockets. Desvio grande persiste: armadura/tecido são peças geométricas simples e o personagem não reproduz pose/composição com cajado da referência.
- Inimigo: quadrúpede alargado, patas/ombros e placas dorsais ampliados. Ainda precisa de silhueta lateral longa, focinho e crista mais reconhecíveis e superfície menos facetada.

Preview geral atualizado em `art/packs/01-ashland-lowpoly/models/ashland-pack-preview.png`. `verify_glb_assets.py` reimporta os quatro GLBs no Blender 5.2.2; confirmou malhas não vazias, bounds e rig/clips do herói/inimigo. Contagem: árvore 1.746 tris, cutelo 5.312, herói 4.820, stalker 2.884. A contagem do cutelo excede ligeiramente o limite inicial de 4k e precisa otimização antes de produção.
