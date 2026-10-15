# Câmera livre de inspeção — modo `free`

Ferramenta de depuração visual para o Caio e o Pedro passearem pelo jogo **rodando**, vendo o que acontece e inspecionando em detalhe. Entregue em `abec7b7`.

## Controles

| tecla | ação |
|---|---|
| **`** (crase) | liga e desliga o modo livre |
| WASD | move no plano da visão, acompanhando o pitch |
| Q/E ou Espaço/Ctrl | sobe e desce |
| Shift | 3× a velocidade · Alt | ¼ da velocidade |
| roda do mouse | velocidade base, 1 a 60 m/s (×1,1 por clique) |
| `[` `]` | alcance de visão (`camera.far`), 40 a 300 m, passo 20 |
| mouse | olhar, pelo pointer lock — clique no canvas trava o ponteiro |
| V | continua alternando só `iso` ↔ `third`; desliga o livre |

No modo livre o clique **não ataca**, e o herói ignora WASD — ele continua sendo simulado pelo piloto e pelo clique-para-andar.

A câmera não mergulha abaixo de `terrainHeight + 0.6`, então não se perde dentro do terreno.

## Inspeção

A mira central escolhe o alvo mais próximo e mostra no HUD. Exemplo lido em teste real:

> **Pombo Bravo · HP 12/12 · behavior: patrol · wild_pigeon_21**

É o que transforma "tem algo errado ali" em diagnóstico com id na mão.

## Métricas

FPS, tempo de quadro, draw calls e triângulos, atualizados 4× por segundo — não a cada quadro. São lidos de `gl.info`; a ferramenta **mostra** os números, não os acrescenta.

## Custo — medido

**Nos modos `iso` e `third`: zero.** O overlay devolve `null`, não há componente novo dentro do Canvas, e o `useFrame` só ganhou um `if (cameraMode === 'free')`.

**No modo livre:** sem alocação por quadro — os vetores de rascunho são criados uma vez. O único custo não trivial, projetar criaturas e peças para a inspeção, está limitado a 4× por segundo. Nenhuma câmera nova, nenhum passe de render novo: move a câmera que já existe.

Se olhar longe estourar draw calls, o controle de alcance (`[` e `]`) existe exatamente para isso — baixar o `far` derruba o que está distante.

## Verificado voando, em tela

- Movimento: segurando W, overlay mostrou **FPS 51 · quadro 19,4 ms**
- Draw calls variaram **102 a 534** conforme a vista; triângulos 5,8M a 9,5M
- Velocidade: roda para cima levou 10 → 12,1 m/s; alcance: `[ [ ]` levou 160 → 140 m e a câmera aplicou
- **O jogo continua rodando**: durante o voo apareceu *"Aberração Fúngica surgiu no vale!"* — spawner e criaturas patrulhando, sem pausa
- Sem regressão: a crase desliga e volta ao `iso` limpo; V leva ao terceira-pessoa. Nenhum erro de console.

## Onde vive, e por quê

Disponível em **todas as builds, inclusive produção**, por atalho discreto e sem botão na barra. O Pedro testa no Vercel e precisa da ferramenta lá; o jogador comum não esbarra nela.

As métricas só aparecem com o modo ligado, então não poluem o jogo normal.

## Ressalva honesta

O **pointer lock não engata em automação headless** — exige gesto real de usuário. A rotação por mouse não pôde ser testada automaticamente; foi validada movendo a câmera por WASD e lendo o alvo centralizado. Em uso real o mouse-look reaproveita a mesma máquina de yaw/pitch da terceira pessoa, que já funciona.
