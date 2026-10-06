# Stage 06 — Status

**Data:** 2026-10-05
**Fase:** 6 — Missão cinematográfica completa (última do roadmap)
**Status:** implementada, aguardando avaliação do monitor

## Escopo entregue

### Objectives (PRD §RF-04)
- `src/game/mission/Objectives.ts`: máquina de objetivos A–E — A avanço ao portão,
  B eliminar sentinelas, C hack (segurar E por 4 s, reinicia com inimigos a <8 m),
  D sobreviver 3 waves de contra-ataque (delay 2.5 s entre waves), E extração.
- Waypoints por dados (`src/game/data/mission1.ts`: OBJECTIVES, ATTACK_WAVES, RADIO_LINES).
- Checkpoint: `ob:checkpoint` no localStorage a cada objetivo concluído; reinício
  retoma no último objetivo (prop `startObjective` no GameCanvas).
- Waves: `Director.spawnWave(specs)` com reatribuição sequencial de ids
  (invariante id == índice em applyHit mantido).

### Cinematic (PRD §RF-06)
- `src/game/mission/Cinematic.ts`: IntroCamera (crane-down aéreo de 6 s) e Killcam
  (2 s vistos da origem do tiro letal, via `DirectorCallbacks.onPlayerDeath(source)`).
- Letterbox + título "OPERAÇÃO: BLACKOUT — 02:47, Zona Industrial Norte" na intro.
- Subtítulos de rádio typewriter por transição de objetivo (play.tsx).
- Controle suspenso durante cinemáticas: `Input.suspended` (lock mantido, input congelado).

### HUD completo (PRD §RF-05)
- Objetivo ativo (título + detalhe + contador de waves), waypoint 3D projetado
  na tela com distância em metros, kill feed (4 s), barra de hack, direção de dano,
  HP, munição, crosshair/hitmarker (existentes).

### Overlays (PRD §RF-08)
- Pausa (volume/sensibilidade, agora com nota de checkpoint).
- Morte: estatísticas (abates/precisão/tempo) + "Reiniciar do checkpoint".
- Missão concluída: estatísticas + jogar novamente / voltar ao menu.

### Polish
- Slow-motion (0.25×) por 0.6 s no último abate de objetivo/wave: `Engine.timeScale`.
- Grain/vinheta já calibrados na Fase 1 (uGrain 0.035, vinheta 0.55).

## Verificação (gates §19)

- `bun run build` OK; typecheck (tsgo --noEmit) OK; lint 0 errors; vitest 22/22.
- Playwright (/tmp/browser/phase6/): intro com crane + letterbox + título;
  objetivo A→B por teleporte (rádio + checkpoint `1`); B→C eliminando sentinelas
  via Director (checkpoint `2`); hack com E avança hackProgress; zero erros de console
  em todos os fluxos.
- Pendência conhecida: missão fim-a-fim completa (waves D + extração E) a validar em
  desktop real — headless roda a ~3 fps (limitação registrada no AGENTS.md).

## Arquivos

- Novos: `src/game/mission/Objectives.ts`, `src/game/mission/Cinematic.ts`
- Editados: `src/game/data/mission1.ts` (objetivos/waves/rádio), `src/game/ai/Director.ts`
  (spawnWave, onEnemyKilled, onPlayerDeath(source)), `src/game/core/Engine.ts` (timeScale,
  cameraMotion nullable), `src/game/core/Input.ts` (suspended, holdingE, crouch),
  `src/components/game/GameCanvas.tsx` (missão/cinemática/estatísticas),
  `src/routes/play.tsx` (HUD completo, overlays com estatísticas, checkpoint).
