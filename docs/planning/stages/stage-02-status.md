# Stage 02 — Status: Movimento FPS COD-like

**Data:** 2026-10-05T15:05Z (revisado 15:15Z) · **Status:** AGUARDANDO REAVALIAÇÃO DO MONITOR

## Entregue
- `src/game/core/Input.ts` — teclado (WASD/setas, Shift, Ctrl/C, Espaço), mouse relativo e pointer lock; limpa estado ao perder lock (pausa implícita), edge-detect de pulo.
- `src/game/player/Player.ts` — WASD com spring/atrito (walk 4.5 / sprint 7 / crouch 2.4 m/s), sprint com FOV kick 75→83, agachar com transição de altura 1.7→1.05, pulo (apex ~1.5 m) + gravidade 20 m/s², dip de câmera na aterrissagem (mola amortecida), head bob por estado, colisão AABB eixo a eixo (raio 0.35) e limites do mapa (±38). Sensibilidade via localStorage (`ob:sensitivity`).
- `src/game/world/ValidationScene.ts` — specs de contêineres/caixotes elevados a constantes exportadas + `getValidationColliders()` (AABB conservador p/ caixas orientadas).
- `src/components/game/GameCanvas.tsx` — integração Input+Player no loop (`window.__obPlayer` como alçote de verificação); sem câmera cinemática no jogo.
- `src/routes/play.tsx` — overlay iniciar/pausar: pointer lock só após clique, ESC solta lock → painel de pausa com slider de sensibilidade persistido; retomar funciona.
- `src/game/player/Player.test.ts` — 8 testes de física (aceleração/atrito, colisão, montar caixote, gravidade, agachar, sprint, limites).

## Gates §19 executados
- `bunx vitest run`: 8/8 passed. `bun run build`: OK. `bun run lint`: 0 errors (6 warnings pré-existentes de ui/).
- Playwright (`/tmp/browser/phase2/`): lock por clique OK; overlay de pausa ao soltar lock; sensibilidade 2.4 persiste após reload; zero erros de console; head bob/altura de agachamento confirmados via `__obPlayer`. Física fina (colisão/pulo/sprint) validada por testes unitários — headless renderiza a ~3 fps, inviável para medição de movimento no browser.

## Decisões
- Pulo 7.8 m/s (apex ~1.5 m) para permitir montar caixotes de 1.2 m; bump de cabeça só quando a subida cruza a base do obstáculo.
- ESC → soltar lock é nativo do browser; o overlay de pausa reage ao `pointerlockchange`.
- Correções pós-1ª avaliação do monitor: `Player` consome interface mínima `PlayerInput` (testes não dependem da classe Input); `velocity`/`grounded`/`height` públicos para HUD/IA/testes; alçote `__obPlayer` só em `import.meta.env.DEV` com acesso por colchetes. `bunx tsgo --noEmit`: 0 erros. 8/8 testes, lint 0 errors, build OK, smoke Playwright sem erros (movimento ~3 m confirmado).

## Pendências conhecidas (não bloqueiam fase)
- Sway de arma virá com o viewmodel (Fase 3); bob lateral já implementado na câmera.
- Crouch não verifica teto baixo ao levantar (não há passagens baixas no nível v1).
