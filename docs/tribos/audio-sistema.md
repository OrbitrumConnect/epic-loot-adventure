# Sistema de Áudio TRIBOS — referência (p/ não quebrar de novo)

> Já quebrou **2 vezes** por sync de snapshot que "gutou" o `audio-manager` (removeu
> métodos + trocou `shot` de flecha pra tiro + apagou arquivos). Se sumir de novo,
> este doc diz exatamente o que tem que existir. **Não remover nada disto num sync.**

## Arquivos (`public/audio/`)
| arquivo | uso |
|---|---|
| `arrow-hit.wav` | som de **flecha** (arco) |
| `gun-shot.mp3` | som de **tiro** (pistola/rifle) |
| `melee-hit.wav` | **melee** (espada/machado/picareta/especial) |
| `harvest-hit.wav` | **coleta** (madeira/pedra/etc.) |
| `footsteps.wav` | **passos** (loop; acelera no sprint) |
| `campfire-crackles.wav` | fogueira por proximidade (loop) |
| `dry-ground-calls.mp3`, `cautionary-pacing.mp3`, `passos-na-fuga.mp3` | trilhas de música |

## `src/game/audio/audio-manager.ts` — métodos que PRECISAM existir
- `playShot()` → toca `arrow-hit.wav` (flecha). **Atenção: NÃO trocar o `shot` por gun-shot.**
- `playGunShot()` → `gun-shot.mp3` (tiro).
- `playMelee()` → `melee-hit.wav`.
- `playHarvest()` → `harvest-hit.wav`.
- `setFootsteps(active, sprinting)` → loop de passos, playbackRate maior no sprint.
- `updateCampfireDistance(d)`, `pulseCombat()`, música (`play/stop/toggle/armAutoplay/setMaster/setAmbientTrack`).
- `ensure()` guarda `typeof window/Audio === 'undefined'`. Play usa `.play().catch(()=>{})`.

## Onde CADA som é chamado (os callers — restaurar se sumirem)
- **`src/game/state/game-store.ts`** (import `audioManager` de `../audio/audio-manager`):
  - ataque normal (após o projétil): `bow→playShot`, `pistol/rifle→playGunShot`, `!usingRanged→playMelee`.
  - especial (jump/spin): `playMelee()`.
  - `harvestAt` (quando `result.harvested > 0`): `playHarvest()`.
- **`src/components/game-world.tsx`** (no `useFrame` principal):
  - `audioManager.setFootsteps(moving && isGrounded.current, sprinting)`.
  - `audioManager.updateCampfireDistance(...)`.
- **`src/components/MusicPlayer.tsx`**: `pulseCombat()` no `attackTick`. (NÃO tocar som por arma aqui — é no game-store.)
- **`src/routes/index.tsx`**: `audioManager.armAutoplay()` (música liga no 1º input).
- **`src/test/setup.ts`**: stub `HTMLMediaElement.prototype.play = () => Promise.resolve()` (jsdom não implementa).

## Checklist se o áudio sumir (3ª vez)
1. Arquivos em `public/audio/` existem? (restaurar do git: `git checkout <sha-bom> -- public/audio/...`)
2. `audio-manager.ts` tem os métodos acima e `shot = arrow-hit.wav`?
3. Os callers (game-store / game-world) existem?
4. `import { audioManager }` no game-store?
5. Stub do jsdom no `setup.ts`?

Commit bom de referência: **`ad7bc6c`** (20/10, restauração completa).
