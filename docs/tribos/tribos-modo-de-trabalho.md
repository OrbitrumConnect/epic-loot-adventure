---
name: tribos-modo-de-trabalho
description: "Modo de trabalho do TRIBOS — diário todo dia, escopo fechado, regras de produção, não-regressão, dev em localhost:5173."
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1d6313bf-b086-4ca5-bcb4-18b1523664cb
  modified: 2026-10-06T16:03:06.141Z
---

# Modo de trabalho — TRIBOS

- Diário todo dia com timeline puxando os anteriores
- Escopo fechado SÓ no TRIBOS (epic-loot-adventure)
- Seguir sem pedir menu — implementar na ordem dos blocos
- Dev em localhost (vite dev, porta padrão 5173)
- Lovable conectado — NÃO force push, NÃO rebase de commits publicados
- Não apagar/trocar o que existe (especialmente visual) — só ADICIONAR [[feedback-nao-apagar-conteudo]]
- Refinar o estilo 3D existente, NÃO trocar

## Regras de produção (Doc Mestre §95)
Antes de adicionar qualquer sistema:
1. É divertido?  2. É necessário?  3. Conecta com o loop?  4. Cria decisão?
5. Cria consequência?  6. É escalável?  7. É seguro?  8. É performático?
Se não → não entra ainda.

## Qualidade AAA sem regressão
- Cada sistema novo passa pelo filtro acima
- Arquitetura separada (types → data → systems → store → UI → render)
- Cliente NUNCA decide regra de jogo
- Testar no browser antes de reportar pronto
- Performance: instancing, LOD, limitar sombras, não usar React state pra movimento frame-by-frame

**Why:** Pedro quer foco total no TRIBOS com qualidade AAA escalável.
**How to apply:** toda sessão começa verificando o bloco atual e segue a ordem oficial de produção.
