# Avaliação — Stage 03

**Data:** 2026-10-05
**Veredito:** concluída
**Confiança da avaliação:** alta

## Resumo executivo
A Fase 3 está funcionalmente completa: fuzil + pistola com troca < 0,5 s, ADS com FOV animado, raycast com spread por estado, recuo via mola no Player, recarga com cancelamento na troca, muzzle flash ≤ 60 ms com luz dinâmica, tracers/sparks/decals/casings e 4 dianas com HP/headshot ×2/queda/respawn alimentando hitmarker e HUD de munição. Testes 8/8 revalidados pelo monitor; arquitetura limpa (`data/weapons.ts` puro, `src/game/weapons/**` sem React). Há desvios de tuning em relação à tabela do PRD e dois defeitos menores não bloqueantes a corrigir antes da Fase 4.

## Cobertura de requisitos
- Atendido: troca 1/2/roda com timeline 0,2 + 0,24 s (`SWITCH_OUT/IN_TIME`, `WeaponSystem.handleSwitchInput`, `Viewmodel.switchTo`) — PRD 18 item 1.
- Atendido: ADS com FOV animado (75→50 fuzil / 75→55 pistola, `adsAmount` lerp `dt*11`, `externalFovOverride`) e spread hip→ADS (`computeSpread` com lerp + movimento/ar/agachar) — item 2.
- Atendido: recuo determinístico vertical + dispersão horizontal, via `Player.kickRecoil` (mola, nunca altera yaw/pitch direto — conforme AGENTS.md) — item 3.
- Atendido: recarga R com animação, munição aplicada só no fim (`finishReload`), troca cancela recarga (`handleSwitchInput`), auto-recarga com mag vazio — item 4.
- Atendido: muzzle flash 55 ms (`FLASH_LIFE = 0.055`) + `PointLight 0xffb36b` com decaimento, tracers/impacts/casings em pools fixos — item 5.
- Atendido: hitmarker (240 ms, vermelho em headshot/kill em `play.tsx`) + dianas com HP 100, queda (`rotation.x −1.45`) e respawn 2,6 s (`Targets.ts`) — item 6.
- Parcial: RF-02 "reserva limitada, recarga em caixas espalhadas" — reserva existe, mas sem caixas de munição no nível (aceitável: fora do aceite mínimo da Fase 3, fica para Fase 5/6).
- Parcial: RF-05 "crosshair dinâmico" — HUD da Fase 3 tem crosshair estático; abertura com movimento/tiro e fechamento em ADS ficam para o HUD completo (Fase 6).

## Qualidade do código
Pontos fortes:
- Separação correta: `src/game/data/weapons.ts` puro (sem three/React); `WeaponSystem`/`Viewmodel`/`Effects`/`Targets` TS puro, sem imports de React; `src/game/**` não importa rotas — NFR-04 atendido.
- Pools fixos em `Effects.ts` (flash 4, tracer 12, spark 32, decal 24, casing 10) — zero alocação por frame em regime permanente; `dispose()` completo nos três módulos.
- Spread com distribuição triangular (`(Math.random()+Math.random()−1)`) em vez de uniforme — bom detalhe de game feel.
- `Viewmodel` anexado à câmera com `scene.add(camera)` comentado — evita o clássico viewmodel invisível.
- Fronteira SSR respeitada: `GameCanvas` lazy + `ClientOnly` em `play.tsx`; canvas/texturas só em módulos browser-only; `window.__ob*` gated por `import.meta.env.DEV`.

Pontos de atenção:
- `GameCanvas.tsx:93` chama `targets.update(delta)` e `WeaponSystem.update:150` chama `targets.update(dt)` de novo — alvos atualizados 2× por frame (queda/respawn/flash ~2× mais rápidos que as constantes `FALL_TIME/RESPAWN_DELAY`). Remover uma das chamadas.
- Sprint não cancela ADS nem recarga (`wantAds` não consulta `player.sprinting`; `tryStartReload` não checa sprint) — RF-01/RF-02 pedem "sprint cancela ADS". Fase 4 (combate móvel) vai expor isso.
- `Effects.ts:78` — `PointLight(0xffb36b, 0, 12, 2)` tem alcance 12 m; PRD 17.2 prevê raio 6 m (fuzil) / 4 m (pistola). Funcional, mas iluminar 12 m por 55 ms a cada tiro em cena noturna pode estourar o budget de luz; parametrizar por arma.

## Discrepâncias
Status × código (código é a referência):
1. Status §Entregue diz `GameCanvas.tsx — props onHit/onWeaponState/hitMeshes/targets/weapons`; o código real (`GameCanvas.tsx:24-30`) expõe só `onProgress/onLockChange/onReady/onHit/onWeaponState` — `hitMeshes` é local, `targets/weapons` são internos. Deriva documental menor, sem impacto funcional.
2. Tuning diverge da tabela PRD 17.2 (valores do PRD são iniciais, então não é falha — mas precisa reconciliação antes do balanceamento da Fase 4): pistola `damage 34` (PRD 18), `reserveAmmo 60` (PRD 48), `reloadTime 1.5` (PRD 1.6); fuzil `rpm 720` (PRD 9,5/s ≈ 570), pistola `rpm 420` (PRD 6,5/s ≈ 390); spreads em rad convertidos ficam mais apertados que os graus do PRD (hip 0,022 rad ≈ 1,26° vs 1,8°; pistola 0,016 ≈ 0,92° vs 2,2°). Com dano 34, a pistola mata diana de 100 HP com 3 tiros no corpo — o aceite da Fase 4 ("corpo em 4, headshot em 2") foi escrito para dano ~26; decidir o tuning canônico antes de implementar `Enemy`.
3. Roadmap Fase 3 já marcado `[x]` incluindo "Gates: … + screenshot com tracer/flash visível" — screenshots citados vivem em `/tmp/browser/` (efêmero, não versionado). Sem evidência persistida no repo; aceito pela confirmação Playwright no status, mas o checklist do PRD §21 ("evidência visual anexada ao status") não foi cumprido à letra.

## Riscos para as próximas etapas
- Balanceamento Fase 4: com os números atuais, TTK de pistola ≠ TTK de fuzil no padrão "4 corpo / 2 cabeça". Congelar a tabela de tuning (ou declarar override intencional) antes de `Enemy.ts`, senão o aceite da Fase 4 já nasce furado.
- Double-update de `Targets`/`Enemy`: o padrão `GameCanvas.update + WeaponSystem.update` duplicado vai se repetir com inimigos se copiado — corrigir o padrão agora.
- ADS durante sprint e recarga durante sprint precisam de regra explícita antes da IA atirar de volta (senão o jogador ADS-spray em sprint sem penalidade total).
- Caixas de munição e crosshair dinâmico continuam em aberto para Fase 5/6 — registrar no roadmap para não caírem no vão.

## Recomendações
1. Remover `targets.update(delta)` de `GameCanvas.tsx:93` (manter só o de `WeaponSystem`) — 1 linha, antes da Fase 4.
2. Registrar decisão de tuning: ou alinhar `weapons.ts` à tabela PRD 17.2, ou declarar os novos valores como override canônico e ajustar o aceite da Fase 4 de acordo.
3. Bloquear ADS durante sprint (`wantAds &&= !player.sprinting`) e decidir se sprint cancela recarga — 2 linhas + teste.
4. Parametrizar alcance/intensidade da muzzle light por arma (6 m / 4 m do PRD) em vez de 12 m fixo.
5. Corrigir a linha de props do `GameCanvas` no `stage-03-status.md` para refletir a interface real.

## Evidências consultadas
- docs/planning/PRD.md (§5 RF-02/RF-05, §10 Fase 3, §17.2 tuning, §18 aceite Fase 3, §21 checklist)
- docs/planning/ROADMAP.md (Fase 3, checkboxes)
- docs/planning/stages/stage-03-status.md
- src/game/data/weapons.ts
- src/game/weapons/WeaponSystem.ts (troca, ADS, spread, recuo, recarga, raycast)
- src/game/weapons/Viewmodel.ts (poses hip/ads, sway/bob, troca, recarga, kick)
- src/game/weapons/Effects.ts (FLASH_LIFE 0.055, pools, PointLight)
- src/game/weapons/Targets.ts (HP 100, head zone, queda/respawn)
- src/game/player/Player.ts (BASE_FOV, kickRecoil, externalFovOverride)
- src/components/game/GameCanvas.tsx (update duplo, DEV hooks)
- src/routes/play.tsx (hitmarker 240 ms, munição, overlays)
- Gates revalidados: `bunx vitest run` 8/8 passed (2 files); `ls src/game/weapons/ src/game/data/` confirma artefatos
