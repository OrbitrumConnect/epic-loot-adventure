---
name: tribos-camera-system
description: "Arquitetura de câmera definida: yaw/pitch próprio, Pointer Lock, WASD relativo à câmera, camera collision, zoom scroll, transição suave iso↔third. Próximo a implementar."
metadata:
  node_type: memory
  type: project
  modified: 2026-10-06T21:11:20.631Z
  originSessionId: 1d6313bf-b086-4ca5-bcb4-18b1523664cb
---

# TRIBOS — Sistema de Câmera (decisão 06/10)

## Princípio central

A câmera tem estado PRÓPRIO (yaw/pitch). O player NÃO dita a câmera — a câmera dita a direção do movimento.

**Why:** Com câmera dependendo de player.rotation.y, girar o personagem gira a câmera junto, criando efeito nauseante. Separar permite olhar ao redor sem mover o personagem.

**How to apply:** Implementar CameraState com yaw/pitch próprios. Player.rotation segue a direção do MOVIMENTO (não da câmera).

## Arquitetura

```
INPUT (mouse movementX/Y)
  ↓
CAMERA STATE (yaw, pitch)
  ↓
MOVEMENT (WASD relativo ao yaw da câmera)
  ↓
PLAYER ROTATION (segue direção do movimento, suavizado)
```

## CameraState

```ts
yaw: number        // rotação horizontal (mouse horizontal)
pitch: number      // rotação vertical (mouse vertical)
distance: number   // distância do player (scroll wheel)
height: number     // altura acima do player
shoulder: number   // offset lateral (ombro)
sensitivity: number // sensibilidade do mouse
```

Valores iniciais: distance=5, height=2.8, shoulder=0.7, sensitivity=0.0025

## Pointer Lock (third-person)

- Clique no viewport → `requestPointerLock()`
- Cursor desaparece
- `mousemove` usa `event.movementX/Y` (delta, não posição absoluta)
- ESC → `exitPointerLock()` → cursor volta
- Modo iso NÃO usa Pointer Lock

## WASD relativo à câmera

```ts
const forward = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
const right = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
move = forward * forwardInput + right * strafeInput;
```

W = direção que a câmera aponta, não eixo Z fixo.

## Pitch limits

```ts
pitch = clamp(pitch, -1.0, 0.65)
```

Impede virar de cabeça pra baixo ou olhar completamente pro chão.

## Camera collision

Raycast: player head → desired camera position. Se obstáculo, aproximar câmera. Quando sair, voltar suavemente.

## Zoom (scroll wheel)

```ts
minDistance = 3
maxDistance = 8
```

Suavizar com lerp.

## Transição iso ↔ third

Interpolar posição/rotação em ~300-500ms. Não trocar instantaneamente.

## Decisões CONFIRMADAS por Pedro (06/10)

- **Space = PULO** — confirmado. Attack é SOMENTE no mouse esquerdo. Nunca attack no Space.
- **Click esquerdo = attack** — único botão de ataque
- **M = mapa global** — overlay de gestão (ver base, inventário, ajustar personagem, encontrar/iniciar raids). Jogador fica INVENCÍVEL enquanto no mapa. É o hub de tudo que não é gameplay direto.
- **Click esquerdo inteligente** (raycast → criatura=attack, recurso=interact, chão=move) — implementar

## Shoulder dinâmico (futuro)

Shoulder offset muda por contexto:
- Exploração: 0.65
- Combate: 0.8
- Mira (AIM mode): 0.95

Transição suave entre valores. Dá sensação cinematográfica.

## Click inteligente (Bloco 2-3)

```
CLICK → raycast → o que acertou?
  criatura → attack(creatureId)
  recurso  → interact(resourceId)
  chão     → moveTo(point) (só no modo ISO)
```

Preparar `onAttack?: (targetId?: string) => void` e `onInteract?: (entityId: string) => void`.

## Wolf animation (Bloco 2)

Lobo atual desliza (sin/cos). Corrigir:
- walkCycle com pernas alternando
- Corpo sobe/desce levemente: `baseY + abs(sin(walkCycle*2)) * 0.03`
- Cabeça acompanha direção
- States: idle → wander (depois alert → chase → attack → return)
- Pés no terreno (feetOffset, não centro do modelo)

## Futuro: modo AIM (3º estado de câmera)

```
ISO → visão ampla, gestão
THIRD → exploração, combate
AIM → câmera mais próxima, right mouse, precisão
```

Não implementar agora, mas arquitetura já suporta (é só mudar distance/shoulder).

## Identidade visual do jogo

"Low-poly refinado, NÃO voxel." Refinar o estilo existente, não trocar.
- Formas mais suaves, menos cubos
- Silhuetas fortes
- Diorama vivo
- Referências de sensação: Project Zomboid (leitura), Ragnarok (estilo), RuneScape (mundo)

## Conceito "chiclete"

A cada 20-40 segundos de exploração deve existir POTENCIAL para: recurso, criatura, evento, ruína, jogador, estrutura, descoberta. Não precisa acontecer sempre — precisa PARECER possível. O jogador deve pensar: "só mais uma saída."

## O que NÃO fazer agora

- 6+ arquivos separados (CameraController.ts etc) — manter dentro do game-world por enquanto
- Target system com userData em cada mesh
- Cone de ataque com ângulo
- MAP_HALF > 45 sem conteúdo pra preencher
- Multiplayer, servidor, tribos, guerra, mercado, monetização, 120 jogadores
