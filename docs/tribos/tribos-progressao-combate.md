---
name: tribos-progressao-combate
description: "Níveis e XP, coleta com ferramentas, sprites de item, troca de arma, transparência por oclusão e retorno visual do combate. Sessões 6 e 7 (Caio, 07/10)."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-07
---

# TRIBOS — Progressão, coleta e retorno visual do combate

## Progressão

XP sai dos **próprios números da criatura**: `0,15 × vida + 2 × ataque + 3 × armadura`.
Coelho 4 · Cervo 12 · Batedor 24 · Lobo 34 · Javali 40 · Xamã 47 · Guerreiro 50 · Lobo Alfa 68 ·
Brutamontes 95 · Urso 99. Colher também dá XP.

Curva `110 × 1,2^(nível-1)`, teto no nível 30. Nível 2 em ~4 lobos, nível 5 em 18, nível 10 em 68.
Por nível: +12 de vida máxima, +6 de mana, +4 de vigor, +2 de ataque; sobe de nível curando por completo.

O ataque base do jogador **passou a vir do nível** (`10 + 2 × (nível-1)`), então o nível 1 continua
exatamente como era antes.

## Coleta

276 nós por semente fixa, com exclusão de nascedouro, ruínas, acampamentos e borda.

| Nó | Ferramenta | Por golpe | Na mão | Capacidade |
|---|---|---|---|---|
| Árvore | machado | 4 | 1 | 16 |
| Pedregulho | mão | 2 | 2 | 4 |
| Rocha | picareta | 5 | — | 25 |
| Veio de ferro | picareta | 3 | — | 12 |
| Veio de ouro | picareta | 2 | — | 8 |
| Cristal | mão | 1 | 1 | 4 |

Ferramenta de ferro rende o dobro. Carregar a ferramenta basta — não precisa estar equipada.
Render em `instancedMesh` por tipo, com visual próprio de esgotado e clique que resolve
`instanceId` → id do nó.

## Fauna

32 bichos selvagens além dos acampamentos: coelho 6, cervo 8 (**pacíficos, fogem**), javali 8,
lobo 4, lobo alfa 3, urso 3. `CreatureDefinition` ganhou a marca `peaceful`, lida pela IA e pelo mapa.

## Poções

`autoPotion` liga e desliga a cura automática — desligada, o piloto **recua em vez de curar**.
Vale também no jogo manual: a regra pura `shouldAutoDrink` é acionada pelo `tickWorld`.
`DEV_INFINITE_POTIONS` (em `src/game/config/dev-flags.ts`) fica ligada por `import.meta.env.DEV` e
**some sozinha no build de produção**; o rodapé mostra `× ∞` em vez de um número falso.

## Sprites de item

28 sprites em `public/assets/items/<id>.webp` (256×256, fundo transparente), gerados pelo Codex com
`gpt-5.6-luna` em esforço médio. Pipeline regenerável em `art/items/`: `items.json` descreve cada item,
`generate.py` gera sheets 2×2, `cut_sprites.py` recorta. As sheets brutas ficam fora do git.

Convenção: `itemSpriteUrl(id)` em `data/items.ts`. O ícone lucide antigo continua como **reserva** se a
imagem falhar. Os sprites substituíram os ícones na hotbar, no inventário, no rodapé, nas receitas, no
armazém e na tela da cidade; o lucide ficou na navegação, nos painéis e nas ações.

## Arma na mão

O modelo que o personagem segura segue o slot escolhido na hotbar: espada, machado, picareta, as
versões de ferro, tocha acesa e punho quando o slot não é arma nem ferramenta. A animação do golpe
continua dirigindo um único ref — só o conteúdo troca. (`components/world/held-weapon.tsx`.)

## Transparência por oclusão

Árvores, rochas, ruínas, estruturas de acampamento e nós de colheita ficam translúcidos quando entram
na frente do personagem, e voltam quando saem. **Inimigos e o personagem nunca somem.**

Sem raycast: uma vez por quadro, um teste de ponto-a-segmento entre a câmera e o peito do jogador
contra esferas envolventes (~0,1 ms para ~590 testes). Lotes instanciados usam um atributo `aFade`
por instância com um ajuste no shader, então cada instância some sozinha e o lote segue em uma
chamada de desenho. (`components/world/occlusion.ts`.)

## Retorno visual do combate

`src/game/types/feedback.ts` define eventos **efêmeros** (`damage`, `heal`, `death`, `xp`, `loot`,
`levelup`, `harvest`) com tempo de vida próprio. Não são estado do jogo: são o eco visual do que o
sistema decidiu. A lista é podada sozinha e tem teto de 40.

O mundo mostra: número de dano subindo (claro quando o jogador bate, vermelho quando apanha, maior no
crítico), jato de sangue no ponto do golpe, barra de vida e nome sobre cada criatura **a até 12 m**
(ferido ou alvo aparece a qualquer distância), marcador e trilha no chão até o alvo.

O HUD mostra: cartas de recompensa com o sprite de cada item, a experiência e a morte; banner da
caçada com a vida do alvo; e o momento de subir de nível. Tudo em lotes reaproveitados, sem alocar
por golpe.

## Loot

7 materiais novos: osso, tendão, carne crua, galhada, garra de urso, pé de coelho, emblema saqueador.
Tabela por criatura, com queda rara de item fabricado (espada 8% no brutamontes, armadura 6% no urso).
Receitas de campo: assar carne, armadilha de tendão, arco de osso, armadura de osso.

## Armadilhas já pagas (não repetir)

| Armadilha | O que acontecia |
|---|---|
| Escrita com estado velho | `tickWorld` lia o estado no começo e escrevia no fim, **apagando os eventos criados no meio**: os avisos de loot e XP piscavam e sumiam. Passou a usar `set` funcional |
| Carne sem uso | Os bichos passaram a largar carne crua, que não curava nem servia de nada — caçar ficou pior que antes. Virou receita de assar |
| Receita invisível | O painel de fabricação listava só as 4 ferramentas, escondendo as receitas novas. Virou "Fabricar no campo" |
| Cura pelo índice | Com a poção infinita, o índice de cura vinha como 0 — que é a espada — e o piloto "curava" usando a arma. Passou a chamar `drinkPotion()` |
| Fila cega | `gather_node` só enxergava o array legado `resources`, então enfileirar um nó novo devolvia "Alvo inválido" |
| Barras demais | Barra de vida a 38 m cobria meio mapa. Passou a 12 m |

## Limites conhecidos

Retrato da criatura no banner é uma sigla colorida, não sprite — não existe arte de criatura.
A rota no mapa anima a 5 Hz, então pisca em passos. Fogueiras não ficam translúcidas.
As 180 árvores decorativas seguem não instanciadas (~720 materiais).
O array legado `resources` continua ativo e dá madeira ao clicar no terreno, confundindo com o sistema
novo de nós — vale aposentar.

Relacionado: [tribos-acampamentos-objetivos.md](tribos-acampamentos-objetivos.md) · [tribos-cidade.md](tribos-cidade.md)

## Atualização 09/10 — crítico e equipamento

Crítico vem da **destreza**: chance `0,30 × destreza/100`, multiplicador de 1,5× a 2,0×. Destreza 0
dá chance zero, então o nível 1 sem pontos é idêntico ao de antes. O sorteio é injetável (`rng`).

O número laranja de dano passou a vir do crítico **real**. Antes vinha de uma heurística de "sorteio
alto" que o pintava em ~1/6 dos golpes mesmo no nível 1. `isCriticalDamage` continua exportado como
legado porque um teste o usa.

Armadura dá **carga** por raridade (4/8/14/22%) — a mitigação de dano já vem do campo `armor`, não
contar duas vezes. Acessório dá destreza e velocidade. Campo opcional `Item.attrBonus` tem prioridade
quando existe. **Não existe nenhum item de acessório no jogo ainda** — o código aceita, falta arte e
decisão de design.