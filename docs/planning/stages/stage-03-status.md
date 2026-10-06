# Stage 03 — Status: Sistema de armas

**Data:** 2026-10-05T15:45Z · **Status:** AGUARDANDO AVALIAÇÃO DO MONITOR

## Entregue
- `src/game/data/weapons.ts` — dados puros das armas: fuzil "VK-7 Fuzil" (auto, 720 rpm, 26 dmg, mag 30, reserva 120, recarga 2.1 s, spread hip 0.022 / ads 0.0035, recuo 0.0075/0.0022, adsFov 50) e pistola "P9 Sidearm" (semi, 420 rpm, 34 dmg, mag 12, reserva 60, recarga 1.5 s, hip 0.016 / ads 0.004, recuo 0.011/0.003, adsFov 55); `WEAPON_ORDER`; tempos de troca `SWITCH_OUT_TIME` 0.2 s / `SWITCH_IN_TIME` 0.24 s.
- `src/game/weapons/WeaponSystem.ts` — estado por arma (mag/reserva), cooldown por rpm, spread lerp hip/ads modulado por movimento/agachar/ar, raycast (far 250) contra `[targets.hitMeshes, worldMeshes]`, dano com headshot ×2 via `userData` (`targetId`/`zone`), auto-recarga com mag vazio, troca cancela recarga, ADS bloqueia tiro durante troca; callbacks `onHit`/`onStateChange`.
- `src/game/weapons/Viewmodel.ts` — armas procedurais anexadas à câmera (`scene.add(camera)`), poses hip/ads por arma, idle sway + bob, troca animada (0.2 s out / 0.24 s in), recarga (dip + rotação), `fire()` com kick de decaimento exponencial, `getMuzzleWorld()`.
- `src/game/weapons/Effects.ts` — pools: muzzle flash (4 sprites + PointLight 0xffb36b intensidade 55, vida ≤ 60 ms), tracers (12, 70 ms), sparks (32, 320 ms), decals (24), casings (10).
- `src/game/weapons/Targets.ts` — `TargetManager` com 4 dianas em ([-3.5,-4], [4.5,-8], [-9,3], [9,5]) viradas para o spawn (0,0,20), HP 100, `zone: "head"` no miolo (×2), queda (`rotation.x` −1.45) + respawn 2.6 s, flash emissivo ao levar dano, `hitMeshes` para raycast.
- `src/game/core/Input.ts` — botões/`pressed`/`wheelAcc`, `onMouseDown/Up/Wheel/ContextMenu`, `consumePressed`/`consumeWheel`, getters `primary`/`ads`, `clear()` estendido.
- `src/game/player/Player.ts` — `BASE_FOV` exportado, `lastLook`, `externalFovOverride` (ADS), `isSprinting`/`isCrouching`, `kickRecoil` (×18, mola k=260 d=22 — recuo nunca altera yaw/pitch diretamente), FOV com override, rotação com recoil.
- `src/game/world/ValidationScene.ts` — `hitMeshes` opcional; coleta ground/containers/crates/tower legs/cabin.
- `src/components/game/GameCanvas.tsx` — props `onProgress`/`onLockChange`/`onReady`/`onHit`/`onWeaponState`; `hitMeshes`, `targets` e `weapons` internos; ordem de update cena→player→armas; alçote de debug dev-only para targets (acesso por colchetes, `import.meta.env.DEV`).
- `src/routes/play.tsx` — HUD: crosshair, hitmarker (240 ms, animate-in), munição bottom-right, overlays de estado da arma.

## Gates §19 executados
- `bunx vitest run`: 8/8 passed. `bun run build`: OK. `bun run lint`: 0 errors (6 warnings pré-existentes de ui/). `bunx tsgo --noEmit`: 0 erros.
- Playwright (`/tmp/browser/`): pointer lock via botão, zero erros de console. Com eventos sintéticos de mira precisa (dx=−65): hitmarker, diana derrubada e respawn visíveis; flash de cano, casings e auto-recarga (mag 0/120 → "Recarregando…") confirmados; ADS (botão direito) reduz o FOV; tecla 2 troca para a pistola (11/60). Física de movimento validada por testes unitários — headless renderiza a ~3 fps.

## Decisões
- Recuo via `kickRecoil` com mola no Player (padrão AGENTS.md), nunca alterando yaw/pitch diretamente.
- Dados das armas em módulo puro (`data/weapons.ts`); sistemas em `src/game/weapons/**` TS puro, sem React.
- Flash com vida de 55 ms (≤ 60 ms do PRD), luz dinâmica pontual 0xffb36b.
- Correção pós-implementação: alçote de debug de targets movido para depois da inicialização de `targets` (TDZ crash na 1ª versão, corrigido e verificado no preview).
- Artefato de teste descartado: o "teleporte de mira" observado no 1º teste automatizado vinha dos deltas gigantes de mouse injetados pelo Playwright ao pressionar o botão em pointer lock; com eventos sintéticos a mira fica limpa.

## Pendências conhecidas (não bloqueiam fase)
- Inimigos humanoides com hit zones virão na Fase 4; as dianas cobrem a validação de dano/hitmarker.
- Áudio de armas na Fase 5.
