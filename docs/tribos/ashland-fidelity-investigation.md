# Ashland — fidelidade visual e pipeline

## Estado verificado (R5)

`art/packs/01-ashland-lowpoly/models/r5/` contém o rebuild fonte, quatro GLBs e renders isolados. Os GLBs reimportam em Blender 5.2.2; hero e stalker mantêm armature e clips Idle/Walk. R5 interpolou as curvas orgânicas, tornou os reatores do herói visíveis e inclinou a arma como geometria real. Renders: `ashland-{tree,weapon,hero,enemy}-review-r5.png`.

| Asset | Triângulos GLB | O que ainda diverge da referência |
|---|---:|---|
| Árvore | 6.864 | Tronco/galhos ainda parecem volumes procedurais lisos; faltam casca esculpida, fissuras finas ramificadas e seiva integrada à superfície. |
| Arma | 4.278 | Silhueta e inclinação melhoraram; lâmina permanece uma placa simples, sem pátina/arranhões e com reator pouco integrado. |
| Herói | 5.848 | Capuz, máscara, lentes, manto e bastão estão presentes; anatomia, pose de mãos, armadura em camadas e cápsulas ainda são simplificadas. |
| Inimigo | 3.630 | Focinho e olhos agora leem como canídeo; ainda faltam boca aberta legível, pelagem, placas/cristais menores e fissuras ciano densas. |

## Causas encontradas

1. As referências são imagens únicas com transparência, não turnarounds nem mapas de profundidade. Costas, espessuras e articulações estão indeterminadas; inventá-las exige decisão artística.
2. O builder atual compõe muitas primitivas separadas e pouca escultura contínua. Aumentar polígonos em tubos corrige o contorno, mas não produz sulcos, tecido, pelo, ferrugem ou microformas da referência.
3. Cores por vértice e materiais simples não substituem UVs e mapas PBR. Nós procedurais do Blender não são portáveis diretamente ao GLB; a aparência precisa ser convertida/bakeada para texturas glTF.
4. O gerador MCP do Blender e as bibliotecas estão desligados. A estação tem RTX 2060 com 6 GB e já reportava cerca de 4,7 GB usados durante a inspeção; não há modelo local image-to-3D confirmado que caiba com segurança. Não usei serviço pago nem folha PNG como modelo.
5. A cena live do Blender contém trabalho do owner e permanece intocada; o trabalho foi feito em Blender headless com arquivos R3/R4/R5 separados.

## Próximo pipeline gratuito recomendado

1. Aprovar/produzir vistas ortográficas frente, lado e costas de cada asset, preservando a identidade das PNGs atuais.
2. Esculpir cada asset como massa contínua em Blender: blockout de silhueta, remesh/subdivisão, sculpt de formas médias e grandes; separar acessórios rígidos que precisam de pivô/rig.
3. Fazer retopologia de jogo, UVs e bake de base color, roughness, normal e emissive a partir do high-poly; materiais simples compatíveis com glTF.
4. Rig/weight-paint de deformações; testar ciclos em 3 poses e GLB reimportado no viewer Three.js do jogo.
5. Gate visual fixo: frente, perfil, costas e câmera isométrica, mesma escala/iluminação da referência; não promover enquanto silhueta, proporções, cor e pontos emissivos não forem reconhecíveis.

## Iterações TripoSR R13/R14 (2026-10-11)

- Fonte: `references/hero-turnaround.png`, recorte frontal para inferência TripoSR 128³ (CPU, pesos oficiais gratuitos); alinhamento X-up→Z-up validado por render.
- R13: remesh voxel 0,006 m, escala de profundidade 0,62, 53.786 vértices. Frente preserva muito bem máscara/lentes/lenço/placas/paleta, mas mãos, botas e recortes inferiores deformam; perfil apresenta manchas e fragmentação; costas reconhecíveis pela textura, porém pouco consistentes.
- R14: mesma fonte/transformação, sem voxel-remesh, 17.502 vértices após importação. Perfil continua com fragmentos e furos. Portanto o remesh não é causa-raiz: ele substitui vazios por manchas/faixas sem recuperar profundidade ausente.
- Diagnóstico: reconstrução monocular da malha neural não contém volume correto nos perfis; projetar mapas de turnaround sobre essa superfície transfere erro geométrico para as vistas laterais. Silhueta frontal forte não comprova personagem 3D fiel.
- Decisão: rejeitar R13/R14 como asset final. Manter como estudo de projeção e preservar renders. Próximo método é construção semântica em peças 3D guiada pelas seis vistas: massas separadas para tronco, braços, pernas, capuz, mochila e placas; volumes/UV por vista, acessórios rígidos separados. Testar primeiro torso+mochila e braços, nas quatro câmeras, antes de escalar ao personagem todo. Rig só após aprovação do blockout e acabamento.

R5 é protótipo 3D funcional, ainda não réplica visual. TripoSR R13 chega perto apenas de frente e falha nos perfis; R14 confirma que não é artefato exclusivo de voxel-remesh. Seguir com malha semântica guiada por turnaround, não mais inferência monocular nem projeção integral sobre volume neural.

## Construção semântica R15/R16 (2026-10-11)

- Novo builder: `art/packs/01-ashland-lowpoly/build_semantic_turnaround.py`; usa quatro mapas com RGB preenchido, 25 volumes separados, normais exteriores, UVs por bbox e escolhe projeção frontal/traseira/lateral pela componente dominante da normal. Sem imagem-plano; proporção do herói é 2,08 m x 1,72 m x 0,72 m.
- R15: 15.280 vértices/14.560 faces, render CPU Cycles de frente/lado/costas/3-4 e GLB roundtrip confirmado: 26 nós mesh importados, 4 imagens e os 4 materiais direcionais presentes.
- Causa técnica corrigida: orientação de faces custom era inward (`dθ × dφ`), UV abrangia a tela toda em vez do bbox foreground, e projeção frontal com alpha em cada volume abria círculos/vazios. Corrigidos winding, bbox e RGB preenchido.
- R16: braços mais estreitos e elipses alongadas menos sobrepostas. Roundtrip: 26 nós mesh, 17.636 vértices no import triangulado, 4 mapas e materiais. Frente mantém identidade, perfil/costas têm volume e a T-pose não é billboard.
- Limites ainda visíveis: silhueta inflada no ombro/joelho/bota, emendas entre volumes, transição de projeção no 3/4, braço/hands simplificados; textura de 512 px está esticada. Não existe rig nem animação neste protótipo; não promover a produção.
- Próximo: substituir elipsoides visíveis por malhas loft com silhueta recortada, usar perfil real para controlar profundidade de cada segmento, separar armadura/tecido como shells discretas e adicionar rig/weight tests somente após gate visual. Depois aplicar aprendizados ao stalker, árvore e arma; objetivo dos quatro permanece aberto.

R15/R16 são protótipos volumétricos exportáveis, não assets finais fiéis. O R16 melhora proporções dos braços, mas ainda perde a silhueta estilizada nas articulações e costura mapas em vistas oblíquas. Segue malha semântica por segmentos guiada pelo turnaround, com teste por asset e sem declarar aprovação antes do render multivista.

## Loft dos membros R17 (2026-10-11)

- Braços e canelas migraram de elipsoides segmentados para lofts de seção elíptica com taper nas extremidades; pauldron e joelheira tiveram volume reduzido.
- Render CPU Cycles produzido nos quatro ângulos. Frente continua coerente com a arte; juntas menos globosas, mas ombros arredondados, botas e geometrias sobrepostas ainda deixam aparência de blockout. Perfil/costas mostram volumes reais; 3/4 ainda tem seams e textura projetada esticada.
- GLB reimportado em Blender 5.2.2: 26 nós de malha, 15.740 vértices após triangulação/importação, 4 imagens e 5 slots de material (inclui slot default). Export está íntegro; anatomia não está aprovada nem rigada.
- Próximo teste deve substituir ombro/boot por shells com contorno extrudado e usar o perfil medido para profundidade, depois avaliar frontal e 3/4 lado a lado. R17 segue estudo; repetir o mesmo refinamento nos demais assets só depois de confirmar abordagem de superfície.

## Iterações ombro/bota R18–R20 e árvore R7–R10 (2026-10-11)

- Herói R18: pauldron em placa extrudada e botas facetadas ficaram lâminas/caixas deslocadas. R19 reposicionou placa por bbox da referência e arredondou bota; ainda leu como triângulo rígido/tecido inflado. R20 voltou a ombro elipsoidal mais raso e bota oval: melhor leitura que R18/R19, porém ainda blockout. GLB R20 reimportado: 26 meshes, 15.716 vértices triangulados, 5 materiais, 4 imagens. Sem rig; não aprovado.
- Árvore R7: sweep orgânico 3D com projeção frontal. PNG alpha ligado à transparência do shader abriu recortes serrilhados; lado/costas ficaram bege e sem detalhe. Render de 12 samples sem denoise também granulou.
- R8 removeu alpha da opacidade, mas o nó MixRGB não recebeu entrada de cor da imagem; casca ficou branca/bege. Erro de wiring identificado no render antes da promoção.
- R9 conectou textura corretamente, 48 samples + denoise. Frente ficou mais próxima na paleta/veios, mas galhos e raízes continuaram claros e a textura só cobre faces frontais; laterais/costas não correspondem à arte. GLB gerado.
- R10 substituiu `organic_tube` local por sweep sem torção. Eliminou estrias helicoidais causadas por rotação fixa de 0,29 rad por anel no helper antigo. Perfil/costas mais lisos, porém com aparência de tubo liso, ramificação simétrica e pouco bark. GLB roundtrip confirmado: 37 meshes, 8.097 vértices, 6 materiais, 1 imagem. R10 ainda não fiel nem pronto para jogo.
- Problemas de cor transferíveis: PNG como alpha de superfície corta o volume; ao usar alpha só como máscara de mistura, ligar RGB explicitamente é obrigatório. Projeção planar por `normal.y` deixa as faces laterais sem pintura; uma única vista frontal não fornece dados de costas. Adicionar polígonos não resolve esses limites de informação.
- Próximo passo: manter R10 como base geométrica experimental; redesenhar ramos assimétricos pela silhueta real (topo recurvado à esquerda, galho esquerdo quase horizontal, braço direito mais baixo), combinar base bark escura com placas de casca esculpidas e fissuras finas; projeção/bake UV para frente, e material procedural/artist-authored consistente nas faces sem referência. Depois validar R11 nas quatro vistas e reimportar. Não promover R10.
