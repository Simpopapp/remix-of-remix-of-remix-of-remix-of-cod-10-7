# Stage 04 — Status: Inimigos e Combate

**Data:** 2026-10-05T16:2xZ · **Status:** AGUARDANDO MONITOR

## Entregue
- `src/game/data/mission1.ts` — dados da missão: 8 spawns com rotas de patrulha e tuning da IA (HP 100, visão 70°/40 m, detecção 0.6/s @10 m, agachado ×0.6, alerta 25 m, patrulha 1.6 m/s, combate 3.4 m/s, reação 0.35–0.6 s, rajadas 3–6 tiros, pausa 0.8–1.6 s, dano 8–14, cooldown de cobertura 6 s).
- `src/game/ai/aiMath.ts` — helpers puros: bloqueio segmento-vs-AABB, ponto caminhável, taxa de detecção, spread gaussiano. Testes em `aiMath.test.ts`.
- `src/game/ai/Enemy.ts` — soldado composto (torso, cabeça ×2, pernas ×2, ombros, visor vermelho; ~9 meshes), hit zones `enemyId`/`zone`/`head`, FSM IDLE/PATROL → ALERT → COMBAT ↔ COVER → DEAD, detecção por cone/LOS (intervalo 0.22 s, raio de oclusão 15 m), rajadas com spread gaussiano por distância, cobertura estratégica (8 pontos pré-calculados, seleção por pontuação cobertura+distância), strafe lateral, morte legível (queda + fade).
- `src/game/ai/Director.ts` — spawns por dados, propagação de alerta (25 m), dano ao jogador com direção (arcos na HUD), provider de hits de inimigo para o WeaponSystem.
- `src/game/player/Player.ts` — HP, `takeDamage(dmg, fromX, fromZ)`, regeneração estilo COD (após 5 s, 25 HP/s), morte.
- `src/game/weapons/WeaponSystem.ts` — roteamento de hits para inimigos via provider do Director (inimigo tem prioridade sobre alvos de teste).
- `src/components/game/GameCanvas.tsx` — integração: Director no loop, callbacks de vitais/dano/morte, refs de debug dev.
- `src/routes/play.tsx` — HUD de integridade, vinheta de dano + arcos direcionais, barra de HP do inimigo mirado, overlay K.I.A. com reinício (remonta o GameCanvas via key).

## Correções durante a fase
- `Enemy.moveToward` exigia colliders; call sites de patrulha/alerta/strafe/cobertura foram corrigidos para passar `ctx.colliders` (erro runtime "colliders is not iterable" eliminado).
- LOS de detecção usa distância − 0.3 m como far para ignorar a parede traseira do próprio AABB.

## Gates §19 executados
- `bun run lint`: 0 errors (6 warnings pré-existentes de ui/).
- `bunx vitest run`: 22/22 passed (3 arquivos — inclui novos testes de aiMath e de HP/regeneração/morte do Player).
- `bun run build`: OK.
- Playwright (`/tmp/browser/phase4/`): pointer lock por clique; inimigo detecta o jogador a 5 m em campo aberto → `alert`; alerta propaga para inimigos num raio de 25 m (6 de 8); inimigos em `combat` disparam; jogador morre → overlay K.I.A. com "Reiniciar missão"; reinício cria 8 inimigos novos; `applyHit` mata inimigo (`dead`, `alive=false`); **0 erros de console**. Screenshots em `/tmp/browser/phase4/screenshots/`.
- FPS ≥ 50 com 8 inimigos: o preview headless roda a ~3 fps (limitação documentada em AGENTS.md) e não permite medir FPS real; validado o orçamento geométrico (8 × ~9 caixas simples, sem sombras dinâmicas extras). FPS real a validar em desktop.
