# Avaliação — Stage 02 (Movimento FPS COD-like)

**Data:** 2026-10-05
**Veredito:** parcial
**Confiança da avaliação:** alta

## Resumo executivo

A implementação funcional do movimento está sólida e cobre os 5 critérios de
aceite da Fase 2 do PRD: pointer lock com pausa, sprint com FOV kick, crouch,
pulo com gravidade, colisão AABB, head bob e sensibilidade persistida. Física
validada por testes unitários (7/7 passando). Porém o gate de TypeScript
estrito (`tsc --noEmit`, exigido pelo §19 do AGENTS.md e pelo checklist do
PRD Anexo E) **falha com 11 erros**, e o status registra contagem de testes
incorreta (8 alegados, 7 existentes). A etapa só pode ser dada como concluída
após a correção dos erros de tipo.

## Cobertura de requisitos

- Atendido: pointer lock só após clique + ESC pausa + retomar (`Input.ts`
  + `play.tsx` via `pointerlockchange`); WASD spring/atrito (walk 4.5 /
  sprint 7 / crouch 2.4 m/s, gravidade 20 — conforme PRD §17.1); FOV kick
  75→83 com easing; altura 1.7→1.05 ao agachar; pulo + colisão AABB eixo a
  eixo + limites ±38 (cobertos por teste); head bob por estado + dip de
  aterrissagem; sensibilidade ajustável em pausa persistida em
  `ob:sensitivity` (mesma chave em `Player.ts` e `play.tsx`).
- Parcial: qualidade de tipos — `bunx vitest run` 7/7, `bun run build` OK,
  `bun run lint` 0 erros, mas `bunx tsc --noEmit` falha (11 erros, ver
  Discrepâncias). O build Vite passa porque não faz typecheck
  (`build: vite build`, sem `tsc`).
- Ausente / não evidenciado: nada funcional da Fase 2 está ausente. Sway de
  arma corretamente diferido para a Fase 3 (pertence a RF-02/viewmodel).

## Qualidade do código

Pontos fortes: `src/game/**` sem imports de React (fronteira respeitada);
física pura e determinística, testável sem DOM; `Input` limpa estado ao
perder lock e descarta deltas de mouse quando destravado (sem salto de câmera
ao retomar); colisão deriva de `getValidationColliders()` (sem hardcode no
Player); SSR-safe (localStorage só em `useEffect`/helpers com try-catch);
cleanup de RAF/engine/`__obPlayer` no unmount do `GameCanvas`.

Pontos de atenção: `window.__obPlayer` (alça de debug) deixado no código de
produção em `GameCanvas.tsx:48,77` — são exatamente as linhas que quebram o
`tsc` (acesso por ponto em index signature, regra `noPropertyAccessFromIndexSignature`
citada no AGENTS.md do projeto); testes acessam membros privados (`velocity`,
`grounded`, `height`) e passam `StubInput` onde `update()` exige `Input`.

## Discrepâncias

1. Contagem de testes: o status afirma "8 testes" e "8/8 passed" em dois
   trechos; `Player.test.ts` contém 7 blocos `it` e `bunx vitest run`
   reporta `Tests 7 passed (7)`. Erro factual no status, sem impacto funcional.
2. Gate `tsc --noEmit` não mencionado no status e em falha: 2 erros em
   `GameCanvas.tsx` (`__obPlayer` por ponto) + 9 em `Player.test.ts`
   (`StubInput` incompatível com `Input`; acesso a `velocity`/`grounded`/`height`
   privados). O código executa (esbuild ignora tipos), mas viola "TypeScript
   estrito, zero `any` implícito" (PRD Anexo E).
3. Divergências de tuning vs PRD §17.1, todas justificadas no status e
   aceitas: apex do pulo ~1.5 m vs 1.1 m (caixotes reais têm 1.2 m, não 1 m
   como diz o PRD — o PRD está desatualizado nesse ponto); `ACCEL` 42 único
   vs 40/55 (comportamento verificado: para em < 0.5 m); bob por
   `rate = 1.8*hSpeed` vs 2.2/3.1 Hz fixos (presente e suave).

## Riscos para as próximas etapas

- Dívida de tipos compõe: `WeaponSystem` (Fase 3) vai operar sobre `Player`;
   corrigir o `tsc` agora evita contaminação da Fase 3.
- Alturas de cobertura do `Level.ts` (Fase 5) devem respeitar o pulo atual
   (topos ≤ ~1.4 m) ou o pulo precisa ser retunado — registrar a decisão.
- `resolveAxis` resolve um eixo por vez; aceitável para o jogador, mas
   reavaliar se a IA (Fase 4) reutilizar a mesma colisão em cantos diagonais.
- Inconsistência cosmética de faixa de sensibilidade: `Player` aceita
   0.1–5, UI expõe 0.2–3 — unificar.

## Recomendações

1. [bloqueia a conclusão] Zerar `tsc --noEmit`: acesso por colchetes em
   `__obPlayer` (ou remover a alça / protegê-la por `import.meta.env.DEV`);
   no teste, tipar o parâmetro de `Player.update` com interface mínima de
   input ou expor getters somente-leitura em vez de acessar privados.
2. [menor] Corrigir o status: 8 → 7 testes.
3. [menor] Remover ou proteger por `DEV` o `window.__obPlayer` antes da Fase 5.
4. [nota] Crouch sem verificação de teto: aceito como não-bloqueante
   (sem passagens baixas no nível v1); rechecar na Fase 5.

## Evidências consultadas

- docs/planning/PRD.md (§5 RF-01/RF-09, §17.1, Anexos B/C/E)
- docs/planning/ROADMAP.md (Fase 2, marcada [x])
- docs/planning/stages/stage-02-status.md
- src/game/core/Input.ts, src/game/player/Player.ts,
  src/game/player/Player.test.ts, src/game/world/ValidationScene.ts
  (`getValidationColliders`, `CRATE_SPECS`),
  src/components/game/GameCanvas.tsx, src/routes/play.tsx
- Gates re-executados: `bunx vitest run src/game/player/Player.test.ts`
  (7 passed), `bun run lint` (0 errors, 6 warnings pré-existentes em `ui/`),
  `bunx tsc --noEmit` (11 erros), `bun run build` (OK, sem typecheck)
