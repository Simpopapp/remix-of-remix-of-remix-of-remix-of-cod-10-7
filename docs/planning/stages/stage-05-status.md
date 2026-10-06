# Stage 05 — Status: Nível realista + áudio

**Data:** 2026-10-05T17:05Z · **Status:** AGUARDANDO MONITOR

## Entregue
- `src/game/data/level1.ts` — layout completo da missão 1 por dados: muro perimetral
  (espessura 0.6, altura 5.5) com portão ao norte, armazém 26 × 12 (casco com portão
  frontal de 6 × 4 m, telhado, 4 pilares internos), 7 barreiras Jersey, 8 tambores,
  6 luzes práticas quentes, ponto de extração e spawn do jogador.
- `src/game/world/Level.ts` — construtor do nível completo (data-driven): céu noturno
  com lua, piso PBR, poças refletivas, contêineres/caixotes (specs reaproveitados de
  ValidationScene), muros, armazém, barreiras, tambores, torre de vigia com holofote
  varrendo o pátio, beacon vermelho, anel verde pulsante de extração, atmosfera
  teal & orange (hemi + lua fria + rim quente + práticas âmbar), poeira, `getLevelColliders()`
  derivado dos specs (contêineres, caixotes, muros, pilares, barreiras, tambores).
- `src/game/audio/Audio.ts` — áudio 100% sintetizado (WebAudio, zero assets):
  disparos por arma (fuzil/pistola) com variação, tiro inimigo atenuado por distância,
  impacto, passos por distância percorrida (zancada maior na sprint), recarga (start/end),
  hitmarker (normal/headshot/abate), beep de UI, e música em 3 camadas com crossfade
  (calmo = pad grave / tensão = pulso lento / intenso = percussão rápida). Contexto criado
  apenas no gesto do usuário (política de autoplay).
- `src/game/core/Engine.ts` — escala dinâmica de resolução: fps < 50 → −10% (mínimo 0.6),
  fps ≥ 58 → +5% até 1.0, aplicada via pixel ratio do renderer + composer.
- `src/game/ai/Enemy.ts` + `src/game/ai/Director.ts` — hook `onEnemyShot` (áudio posicional
  simples) e `Director.musicLevel()` (calmo/tensão/intenso pelo estado dos inimigos).
- `src/game/weapons/WeaponSystem.ts` — callbacks `onShot`/`onReload` para o áudio.
- `src/components/game/GameCanvas.tsx` — integração: nível completo, GameAudio, passos,
  crossfade de música a cada 0.5 s, `setVolume` na GameApi.
- `src/routes/play.tsx` — controle de volume master no menu de pausa (persistido em
  localStorage `ob:volume`).

## Gates §19 executados
- `bun run lint`: 0 errors (6 warnings pré-existentes de ui/).
- `bunx vitest run`: 22/22 passed.
- `bun run build`: OK.
- Playwright (`/tmp/browser/phase5/screenshots/`): missão carrega no nível completo;
  spawn (0, 20) → pátio navegável com muro perimetral, contêineres, barreiras e armazém
  visíveis; portão do armazém transitável; interior com anel de extração; 5 disparos
  (áudio + efeitos) sem nenhum erro de console. 8 inimigos em patrulha nas rotas
  originais (nenhum collider novo sobre as rotas).
- FPS ≥ 55: o preview headless roda a ~3 fps (limitação documentada em AGENTS.md) e não
  permite medir FPS real; validado o orçamento geométrico (nível composto por caixas/
  cilindros simples, luzes pontuais limitadas, escala dinâmica de resolução ativa como
  fallback). FPS real a validar em desktop.
- Áudio/autoplay: AudioContext criado só dentro do gesto (clique em "Assumir o
  controle"); nenhum erro de autoplay no console.
