# Avaliação — Stage V2

**Data:** 2026-10-05
**Veredito:** parcial
**Confiança da avaliação:** alta

## Resumo executivo
A Fase V2 (terreno com relevo, PRD v2 RM-02) está materialmente implementada no código: heightfield puro e determinístico com vala/morro/crateras/rampas, malha 120×120 m / 256² com splat PBR de 4 camadas fotográficas, Player com chão via `heightAt` e IA com LOS por relevo — tudo coerente com o aceite da fase. O veredito é parcial (não bloqueada) exclusivamente porque dois gates obrigatórios do PRD v2 §10 estão pendentes e declarados como tal: lint (trava >600 s) e Playwright `/play` com screenshots do relevo e console limpo.

## Cobertura de requisitos
- Atendido: `src/game/world/terrainField.ts` puro (sem THREE/React) — `heightAt`/`slopeAt`/`terrainWeights`/`terrainBlocksLos`/`distToCompound`; vala em anel (fundo −1,9 m a ~3,2 m do muro), morro norte (pico 3,2 m em (12,44)), 3 crateras (bacia + borda), 2 rampas esculpidas desde o portão, complexo murado plano em y=0 — PRD v2 RM-02.
- Atendido: `src/game/world/Terrain.ts` browser-only — malha 120×120 m / 256×256 com alturas de `heightAt` (física e visual na mesma fonte), splat de 4 camadas PBR fotográficas (asfalto/terra/cascalho/lama Poly Haven CC0) via máscara RGBA 256² + `onBeforeCompile` (albedo + roughness por camada), `receiveShadow` — RM-02.
- Atendido: Player com chão = `heightAt(x,z)` (`Player.ts:258-263`) + 2 testes novos (sobe rampa com ganho >0,6 m e assentamento exato; assenta no fundo da cratera <−0,5 m) — RM-02 "testes para rampas".
- Atendido: IA projeta y no terreno (spawn `Enemy.ts:171`, `moveToward` `:602`, cobertura `:503`) e LOS com occlusão por relevo antes do raycast (`losBlocked` `:312`) — RM-02 "IA não flutua / LOS considera terreno".
- Atendido: `Level.ts:139-151` — plano antigo substituído pelo terreno, underlay 600×600 a −4,4 m sem tingimento, tint `0x9aa0a6` removido (recomendação nº 5 do eval V1 atendida).
- Atendido: assets/pipeline — dirt/gravel/brown_mud (Poly Haven CC0, 1k) + `report.json` 12,69 MB / 120 MB (primeiro frame 3,02 / 40 MB) + `CREDITS.md` com as 3 novas entradas, confirmado no disco.
- Parcial: testes — 8 em `terrainField.test.ts` (plano interno, morro, vala, crateras, rampa, determinismo, splat, LOS) + 2 no Player; total 38/38 declarado pelo builder, consistente com o código, mas não re-executado pelo monitor neste turno.
- Ausente / não evidenciado: lint 0 errors e Playwright `/play` (relevo visível em screenshot, 0 erros de console) — gates PRD v2 §10 pendentes, declarados no status. Sem eles o aceite "jogador sobe rampas sem tremer" e "inclinações visíveis em screenshot" não tem prova visual.

## Qualidade do código
Pontos fortes:
- Separação correta: `terrainField.ts` TS puro e testável; `Terrain.ts` browser-only consumido só pelo `Level` (client-only); sem `window` em module scope; value-noise determinístico com semente fixa (reprodutível).
- Integração física coerente: Player, malha e IA derivam da mesma função `heightAt` — elimina a classe de bug "visual ≠ colisão".
- Tratamento de bordas sensato: complexo murado retorna 0 exato (gameplay v1 intacto); rampas com dissolve nas pontas (`along`) e fusão lateral (`fall`), evitando degraus.
- Normal maps / AO por camada explicitamente adiados para V7 no status — decisão de budget honesta, não omissão silenciosa.
Pontos de atenção:
- `Terrain.ts:74-77` — `vertexShader.replace` é no-op (substitui o include por ele mesmo); inócuo, mas deve ser removido ou receber `vUv` próprio antes da V3.
- `Terrain.ts:92` — `vTerrRough` declarado mas só atribuído em `map_fragment`; se algum dia `USE_MAP` for falso o valor fica indefinido — hoje `MeshStandardMaterial` sem `map` ainda inclui o chunk, então funciona, mas é frágil; inicializar com `float vTerrRough = 1.0;`.
- Colliders de barreiras/tambores/pilares em `Level.ts:46-76` usam `minY: 0` fixo; fora do complexo o solo chega a −1,9 m (vala) — qualquer prop futuro fora do muro flutua/enterra. Hoje todos os props estão dentro do complexo, então sem impacto; registrar convenção "colliders fora do muro referenciam `heightAt`" antes da V3.
- `terrainWeights` chama `slopeAt` (4× `heightAt` com fbm) por texel — 256²×~6 avaliações só no build da máscara em CPU; aceitável uma vez por load, mas não chamar por frame.

## Discrepâncias
- Nenhuma divergência material entre status e código: medidas (vala −1,9 m / 3,2 m, morro (12,44) pico 3,2, 2 rampas, 256²/120 m, 12,69 MB, 38 testes) conferem no disco. O status é honesto ao marcar lint e Playwright como PENDENTES.
- Detalhe menor: status diz "morro ao norte (alcance do jogador até MAP_LIMIT 38)" — o pico (12,44) está além do limite 38, mas o teste cobre que a encosta acessível (12,38) >0,8 m; não é divergência, só leitura cuidadosa para V3 (pico decorativo, encosta jogável).

## Riscos para as próximas etapas
1. Sem screenshot do relevo, a V3 (kit modular sobre o terreno) ancora-se em geometria nunca vista — risco de rampas/morro colidirem com peças do kit. Fechar o Playwright visual antes de posicionar o kit.
2. Lint travando >600 s em duas fases seguidas (V1 e V2) sugere problema de ambiente/config, não do código — se não resolvido, vira gate morto para V3–V7.
3. Shadow-camera estática (débito herdado do eval V1, D-04) piora com relevo: sombras a 2048 sobre 120 m + valas/morro vão serrar/vazar. Definir dono (sugestão mantida: V7 com medição desktop, ou V3 junto ao kit).
4. `runAssetQueue` continua sem consumidor glTF e `applyEnvironment` sem erro visível (débitos V1 nº 2–3) — intactos nesta fase, mas a V3 os torna críticos.

## Recomendações
1. Fechar os dois gates pendentes antes da V3: `bun run lint` com timeout maior ou `--quiet`/diagnóstico do travamento + Playwright `/play` (screenshots do morro/rampa/cratera + 0 erros de console em `/tmp/browser/v2-phase/`).
2. Limpeza de 5 minutos em `Terrain.ts`: remover o `vertexShader.replace` no-op e inicializar `vTerrRough = 1.0`.
3. Na V3: declarar colliders de peças do kit com base em `heightAt` quando fora do retângulo murado; adicionar auditoria `scene.traverse` (zero BoxGeometry visível) já prevendo o terreno como malha permitida.
4. Registrar medição de fps em desktop real como pendência explícita da V7 (headless não mede; NFR-01).

## Evidências consultadas
- docs/planning/stages/stage-V2-status.md
- .opencode/prd-project1.md (§5 RM-02, §8 Fase V2, §10 Gates)
- .opencode/roadmap-proj.md (Fase V2)
- docs/planning/PRD.md, docs/planning/ROADMAP.md (contexto v1, sem conflito)
- docs/planning/reports/stage-V1-eval.md (recomendações nº 4–5 verificadas)
- src/game/world/terrainField.ts (198 linhas) + terrainField.test.ts (8 testes)
- src/game/world/Terrain.ts (123 linhas)
- src/game/world/Level.ts:139-151 (terreno + underlay)
- src/game/player/Player.ts:257-263 + Player.test.ts:139-161 (2 testes V2)
- src/game/ai/Enemy.ts:171, 305-317 (LOS), 490-507 (cobertura), 590-612 (moveToward)
- scripts/assets/report.json (12,69 MB / 3,02 MB), public/game-assets/CREDITS.md, public/game-assets/textures/{dirt,gravel,brown_mud,asphalt}
- Gates declarados pelo builder (build OK, vitest 38/38, assets OK; lint + Playwright pendentes) — verificação estática confirma consistência; build/vitest/lint/Playwright não re-executados pelo monitor neste turno.
