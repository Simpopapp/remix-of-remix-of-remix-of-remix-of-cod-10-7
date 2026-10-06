# Roadmap — PROJECT1: OPERATION BLACKOUT

> Derivado do PRD (docs/planning/PRD.md). Ordem por dependência. Gates = §19 AGENTS.md.
> Marcar [x] com a linha de Gates ao concluir. Monitor avalia em docs/planning/reports/.

## Fase 1 — Fundação do motor 3D cinematográfico
- [x] Instalar three; criar `src/game/core/Engine.ts` isolado de React (loop, cleanup)
- [x] Rota `/play` com `<ClientOnly>` + `React.lazy` (SSR-safe) e loading com progresso real
- [x] Renderer: ACES tone mapping, sombras PCFSoft, fog, exposure, resize
- [x] Composer: Bloom + Vignette + film grain (subtle)
- [x] Cena de validação: noturna industrial (ground PBR, caixotes, holofote, luzes práticas)
- [x] Rota `/` com CTA "Iniciar Missão" → `/play`; head metadata atualizado
- Gates: ✅ build OK + lint OK + preview sem erros de console + screenshot (`/tmp/browser/phase1/`) + unmount limpo — avaliado pelo monitor em `docs/planning/reports/stage-01-eval.md`

## Fase 2 — Movimento FPS COD-like
- [x] Input.ts: teclado/mouse/pointer-lock; pausa ao perder lock
- [x] Player: WASD spring/atrito, sprint (FOV kick), crouch, pulo + gravidade, aterrissagem
- [x] Head bob + sway; sensitivity em localStorage; colisão AABB e limites do mapa
- Gates: ✅ build OK + lint OK (0 errors) + preview sem erros de console (Playwright: lock por clique, pause overlay, sensibilidade persistida) + física validada por testes unitários (`src/game/player/Player.test.ts`, 8/8) + movimento/colisão/bob no preview

## Fase 3 — Sistema de armas
- [x] WeaponSystem: fuzil + pistola (dados em src/game/data/weapons.ts), troca 1/2/roda
- [x] Viewmodel sway/bob; ADS (FOV 75→50); disparo raycast + spread + recuo com recovery
- [x] Efeitos: muzzle flash + luz dinâmica, tracers, impactos; munição/recarga (R)
- [x] Alvos de teste no nível para validar dano e hitmarker
- [x] Gates: build + lint + preview sem erros + screenshot com tracer/flash visível

## Fase 4 — Inimigos e combate
- [x] Enemy: soldado composto com HP, hit zones (head ×2) e morte legível
- [x] FSM: IDLE/PATROL → ALERT → COMBAT → COVER; detecção por cone/distância/postura
- [x] Rajadas com spread, cobertura, reposicionamento, alerta em raio de 25 m
- [x] Dano ao jogador com direção na HUD, regeneração COD, morte
- [x] Director v0: spawns e triggers por dados
- Gates: ✅ build + lint + vitest 22/22 + preview sem erros de console + combate validado por Playwright (detecção, alerta 25 m, rajadas, morte, K.I.A., reinício) + status em `docs/planning/stages/stage-04-status.md`; fps real a validar em desktop (headless ~3 fps)

## Fase 5 — Nível realista + áudio
- [x] Level.ts: layout completo da missão 1 por dados (muro, pátio, armazém, cobertura)
- [x] Atmosphere: teal & orange final, névoa, poeira, céu noturno
- [x] Audio.ts: SFX sintetizados + música em camadas (calmo/tensão/intenso)
- [x] Otimização: escala dinâmica de resolução e culling; budget 60 fps
- Gates: build OK + lint 0 errors + vitest 22/22 + preview sem erros de console (Playwright: nível navegável, áudio pós-gesto sem erro, screenshots em /tmp/browser/phase5/) + escala dinâmica de resolução ativa; fps ≥ 55 real a validar em desktop — status em `docs/planning/stages/stage-05-status.md`, aguardando avaliação do monitor

## Fase 6 — Missão cinematográfica completa
- [x] Objectives: A–E com waypoints, checkpoints e waves de contra-ataque
- [x] Cinematic: intro (crane + letterbox + título), subtítulos de rádio, killcam
- [x] HUD completo + overlays (pause/death/complete com estatísticas)
- [x] Polish final: slow-motion no abate final de objetivo (cortável), grain/vinheta calibrados
- Gates: build OK + typecheck OK + lint 0 errors + vitest 22/22 + preview sem erros de console (Playwright: intro, objetivo A→B→C, checkpoint, hack; screenshots em /tmp/browser/phase6/) + missão fim-a-fim a validar em desktop — status em `docs/planning/stages/stage-06-status.md`

## Notas
- Cada fase: registrar docs/planning/stages/stage-NN-status.md e invocar o monitor (Skill 15).
- Extras "polish" podem ser cortados por perf — decisão registrada no PRD/roadmap.
