# Avaliação — Stage 06

**Data:** 2026-10-05
**Veredito:** parcial
**Confiança da avaliação:** média

## Resumo executivo
A Fase 6 está substancialmente implementada: máquina de objetivos A–E (`Objectives.ts`), intro crane-down de 6 s com letterbox + título COD, killcam de 2 s, rádio typewriter, HUD completo com waypoint projetado, overlays com estatísticas e slow-motion 0,25×. Gates revalidados pelo monitor (`bunx vitest run` 22/22). Dois gaps impedem o "concluída": (1) a intro não tem handler de skip (Enter/Espaço) — o aceite do PRD §18 item 1 exige intro pulável, e nenhum listener de skip existe em `GameCanvas.tsx`; (2) o fluxo D (waves) → E (extração) fim-a-fim não foi validado nem em headless (evidências phase6 cobrem até o hack), pendência já declarada no status e Ó compatível com o limite de ~3 fps do headless. Há ainda um typo em `RADIO_LINES.C` e um risco real de checkpoint-resume gerar waves + sentinelas remanescentes.

## Cobertura de requisitos
- Atendido: objetivos A–E em sequência (`Objectives.update`: A por `REACH_RADIUS` 3,5 m; B por `aliveCount()===0` + slowmo; C hack 4 s com reset por inimigos < 8 m; D 3 waves com `WAVE_DELAY` 2,5 s; E extração) — `src/game/mission/Objectives.ts:69-97`, PRD §RF-04.
- Atendido: waypoints por dados (`OBJECTIVES`/`GATE_POINT`/`HACK_POINT` em `mission1.ts`) + marcador 3D projetado com distância (`GameCanvas.tsx:293-312`) + checkpoint `ob:checkpoint` por objetivo (`play.tsx:42,281-302`).
- Atendido: intro crane-down 6 s (`IntroCamera.begin/update`, `Cinematic.ts:25-58`) + letterbox intro/killcam (`play.tsx:362-368`) + título/subtítulo COD (`play.tsx:531-541`, `MISSION_TITLE/SUBTITLE`).
- Atendido: killcam 2 s da origem do tiro letal → overlay de falha → "Reiniciar do checkpoint" (`GameCanvas.tsx:140-163`, `play.tsx:663-691`).
- Atendido: estatísticas (abates, precisão, tempo) em morte e conclusão (`play.tsx:676-722`, `MissionStats` em `GameCanvas.tsx:133`).
- Atendido: rádio typewriter por transição (`RadioSubtitle`, `play.tsx:64-80,522-529` + `onRadio` em `advance()` e fim da intro).
- Atendido: slow-motion 0,25× por 0,6 s no último abate (`Engine.timeScale`, `GameCanvas.tsx:195-204`) — polish cortável, presente sem quebrar nada.
- Parcial: PRD §18 item 1 exige "pode ser pulada (Enter)" — nenhum handler de skip existe no `GameCanvas` (grep por `skip/Skip/Enter/Space` em `GameCanvas.tsx` retorna só `introDone/introStarted`; a única menção a "pular" na UI é `Espaço` na lista de controles, que é pulo do jogador, não skip da intro).
- Parcial: PRD §18 item 2 (waves + extração E fim-a-fim) — código das waves existe, mas evidências `/tmp/browser/phase6/` cobrem intro → A → B → hack; D+E só existem como código, sem validação runtime (limitação headless declarada, não falha do builder).
- Ausente / não evidenciado: validação de fps ≥ 50 sob carga e playthrough completo cronometrado 5–10 min (métricas PRD §13) — exigem desktop real.

## Qualidade do código
Pontos fortes (com referência):
- Fronteira respeitada: `src/game/mission/*.ts` e `src/game/data/mission1.ts` TS puro, sem React; shell React consome só snapshots throttled (~8 Hz) — NFR-04 atendido.
- `Input.suspended` congela todo input durante cinemáticas mantendo o lock (`Input.ts:123-184`) — evita o clássico "jogador atira durante a intro".
- `Director.spawnWave` mantém o invariante id == índice via `nextId` sequencial (`Director.ts:112-119`); `applyHit` roteia por `userData.enemyId` — correto.
- Hack segue o PRD à letra: proximidade reinicia o progresso, não falha a missão (`Objectives.ts:99-121`).
- `dispose()` completo no `sceneController` (input, weapons, director, targets, audio, slowmoTimer) — NFR-03 atendido.

Pontos de atenção:
- `src/game/data/mission1.ts:358` — `RADIO_LINES.C`: "Hackeem e sir fm." — typo ("sir fm" não é português; provável resto de edição). 1 linha.
- `Director` sempre spawna os 8 sentinelas (`Director.ts:46-50`), mesmo com `startObjective > 0`. Retomar no checkpoint D deixa 8 sentinelas + waves vivos: `updateWaves` só avança com `aliveCount()===0`, então o jogador precisa caçar sentinelas antigas no meio do contra-ataque — jogável, mas mais difícil que o desenho (PRD §17.5: 4+6+8). Decidir: limpar sentinelas ao retomar em D/E, ou declarar o comportamento como intencional.
- `ATTACK_WAVES` tem 3+4+5 = 12 inimigos; PRD §17.5 prevê 4+6+8 = 18. Divergência de tuning vs. tabela — aceitar como override intencional (12 é mais seguro para perf) e registrar a decisão, como já feito na Fase 3.
- `Objectives.snapshot.hackProgress` retorna 0 quando o hack não está ativo (`Objectives.ts:173`) — correto para esconder a barra, mas o decaimento passivo (`-dt*0.5` ao soltar E) nunca aparece no HUD. Comportamento OK, só documentar.
- Retomar de checkpoint pula a intro mas não toca a linha de rádio do objetivo retomado (rádio só dispara em `advance()` e no fim da intro) — jogador que reinicia em C/D/E não ouve o contexto. Sugerido: emitir `RADIO_LINES[snapshot.id]` ao montar com `startObjective > 0`.

## Discrepâncias
Status × código (código é a verdade):
1. Status diz "controle suspenso durante cinemáticas: `Input.suspended` (lock mantido…)" — confirmado no código (`GameCanvas.tsx:111-116`, `Input.ts`). Sem divergência.
2. Status diz "intro com crane + letterbox + título" validada por Playwright — screenshots `2_intro.png` + código conferem. Sem divergência.
3. Status não menciona skip da intro, e o código confirma que ele não existe — gap real contra o aceite, não deriva documental.
4. Roadmap Fase 6 já marcado `[x]` incluindo "missão fim-a-fim a validar em desktop" — o próprio gate admite validação pendente; o `[x]` deveria aguardar o desktop ou ser anotado como condicional (mesmo padrão das Fases 4/5, aceito com ressalva).

## Riscos para as próximas etapas
- Roadmap 1–6 está funcionalmente fechado no código, mas sem playthrough D+E validado não há prova de que a missão é completável em 5–10 min nem de que o fps se sustenta com 12 inimigos + pós-processamento — validar em desktop real antes de declarar o remix 100% pronto.
- Checkpoint-resume em D com sentinelas remanescentes pode gerar soft-lock percebido (waves nunca "limpam" até caçar 8 patrulhas antigas) — testar em desktop e decidir limpar ou manter.
- Evidências em `/tmp/browser/phase6/` são efêmeras (fora do repo); se a sandbox for limpa, resta só o status escrito — considerar versionar 1–2 screenshots-chave em `docs/planning/stages/` (pequenos, < 500 KB).

## Recomendações
1. Adicionar skip da intro (Enter ou Espaço): no `setCameraMotion` da intro, listener de `keydown` que seta `introDone=true`, `input.suspended=false`, `onIntro(false)` — ~10 linhas, fecha o aceite §18 item 1 e vira o veredito para `concluída`.
2. Corrigir `RADIO_LINES.C` ("sir fm" → texto final, ex.: "Hackeem o terminal e segurem a posição.") — 1 linha.
3. Ao montar `GameCanvas` com `startObjective > 0`, emitir a linha de rádio do objetivo retomado — 3 linhas.
4. Decidir e registrar: limpar sentinelas ao retomar em D/E vs. manter como dificuldade extra; e congelar waves em 3+4+5 como override canônico do PRD §17.5.
5. Validar em desktop real: playthrough A→E cronometrado + fps sob waves (F3) + 1 screenshot por objetivo versionado — então marcar Fase 6 `[x]` sem ressalva.

## Evidências consultadas
- docs/planning/PRD.md (§5 RF-04/RF-05/RF-06/RF-08, §10 Fase 6, §17.5 waves, §18 aceite Fase 6, §21 checklist)
- docs/planning/ROADMAP.md (Fase 6, checkboxes e gates)
- docs/planning/stages/stage-06-status.md
- src/game/mission/Objectives.ts (máquina A–E, hack, waves)
- src/game/mission/Cinematic.ts (IntroCamera 6 s, Killcam 2 s)
- src/game/data/mission1.ts (OBJECTIVES, ATTACK_WAVES 3+4+5, RADIO_LINES, tuning)
- src/game/ai/Director.ts (spawnWave, aliveCount, applyHit, alertOthers 25 m, dispose)
- src/game/core/Input.ts (suspended, holdingE) e src/game/core/Engine.ts (timeScale, cameraMotion)
- src/components/game/GameCanvas.tsx (intro/killcam/slowmo/stats/waypoint/dispose)
- src/routes/play.tsx (letterbox, RadioSubtitle typewriter, HUD, overlays, checkpoint)
- Gates revalidados: `bunx vitest run` 3 files, 22/22 passed
- `/tmp/browser/phase6/` (1_loading, 2_intro, 3_gameplay, 4_obj_b, 5_hack + scripts) — cobre até o hack
- `src/routes/` sem rota `/oc` em arquivo (proxy via plugin; intocada) — PRD §4.1/aceite 5 atendido
