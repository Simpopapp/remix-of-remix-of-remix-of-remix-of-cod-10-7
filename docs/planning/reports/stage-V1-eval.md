# Avaliação — Stage V1

**Data:** 2026-10-05
**Veredito:** concluída
**Confiança da avaliação:** alta

## Resumo executivo
A Fase V1 (pipeline de assets + iluminação física, PRD v2 §8) está materialmente entregue no código: AssetLoader com cache/P0-P1/progresso, HDRI via PMREM aplicado no nível, composer com GTAO→Bloom→Output→LUT→SMAA→grade, presets Baixo–Ultra persistidos e expostos na pausa, chão PBR fotográfico e pipeline `scripts/assets/` com budgets dentro do teto (4,04 MB / 120 MB; primeiro frame 3,02 MB / 40 MB). As lacunas restantes (KTX2/Meshopt, shadow-camera seguidora, fila ainda sem consumidor glTF) são esperadas para V3–V5 e não invalidam o aceite da V1.

## Cobertura de requisitos
- Atendido: AssetLoader `loadTexture`/`pbrMaterial` com cache, `loadGLB` com Draco local (`/draco/`) e progresso por bytes, `runAssetQueue` com progresso agregado ponderado e semântica P0 (rejeita) / P1 (warn + omite) — PRD §4.4 (`src/game/assets/AssetLoader.ts`).
- Atendido: HDRI + PMREM (`applyEnvironment` com `PMREMGenerator.fromEquirectangular`, `scene.environmentIntensity`, dispose) e uso real no nível (`src/game/world/Level.ts:149`).
- Atendido: LUT "teal & orange militar" (`public/luts/military_teal_orange.png` 32³) + decodificador para Data3DTexture (`src/game/render/lut.ts`) consumido por `LUTPass intensity 0.85` com fallback neutro + warn.
- Atendido: GTAO, SMAA, bloom chaveáveis no composer, ordem Render → GTAO → Bloom → Output → LUT → SMAA → grade (`src/game/core/Engine.ts:155-197`); `applyQuality` liga/desliga GTAO e bloom, ajusta `camera.far` e shadow map por traverse (`Engine.ts:214-248`).
- Atendido: presets Baixo/Médio/Alto/Ultra (shadow map, SSAO, bloom, teto de resolução, draw distance), TS puro e testado (6 testes), persistidos em `ob:quality`, aplicados às luzes do nível e expostos na UI de pausa (`Gauge`) via `GameApi.setQuality/getQuality` (`src/game/render/quality.ts`, `src/routes/play.tsx:670-698`, `src/components/game/GameCanvas.tsx:351-352`).
- Atendido: pipeline de assets (`scripts/assets/manifest.json` + `build-assets.ts`: existência, créditos D-02, budgets D-01 → `report.json` com 4,04 MB total / 3,02 MB primeiro frame, confirmado no disco).
- Atendido: chão com PBR fotográfico (`pbrMaterial("asphalt", 60)` + `groundGeo.setAttribute("uv1", …)` para AO, `src/game/world/Level.ts:140-150`) e `CREDITS.md` com asphalt/HDRI/Draco/LUT.
- Parcial: decoders locais — só Draco (`/draco/` com 3 ficheiros). PRD §4.4/§7 pedem também `KTX2Loader` + `MeshoptDecoder` servidos de `public/basis/`; nem o loader nem a pasta existem. Sem impacto imediato (nenhum asset KTX2 no manifesto), mas vira débito antes da V3.
- Parcial: "loading real por bytes" — `runAssetQueue` existe e está correta, mas nenhum consumidor a chama ainda (sem glTF em cena; PBR/HDRI carregam via `TextureLoader`/`RGBELoader` sem progresso agregado). Aceitável para V1, deve ser ligado na V3 quando os primeiros glBs entrarem na fila.
- Ausente / não evidenciado: shadow-camera seguidora com texel snapping (decisão D-04, RM-01). Nenhum código de follow da shadow camera foi encontrado; presumivelmente sombra estática herdada da v1. Não bloqueia V1, mas é pré-requisito de performance/qualidade para V2–V3 e deve entrar no plano da V2 ou V7.

## Qualidade do código
Pontos fortes:
- Separação correta: `quality.ts` puro e testável; `lut.ts`/`AssetLoader.ts` browser-only chamados só a partir de `Engine`/`Level` (client-only), sem `window` em module scope de rota; `play.tsx` lê localStorage em `useEffect`/handlers.
- Tratamento de erros sensato: falha de glB limpa o cache (retry possível); P1 vira warn; LUT indisponível vira grading neutro sem bloquear o jogo; `normalizeQuality` com fallback seguro.
- Cleanup presente: `disposeEnv` + `disposeTextureCache` nos disposables do nível; `Engine.dispose` liberta LUT; `dracoLoader.dispose` em `disposeGlbCache`.
Pontos de atenção:
- `applyEnvironment` dispara `RGBELoader().load` sem expor progresso/erro ao loading screen (falha silenciosa de HDRI = cena sem IBL, sem sinal na UI). Recomendo callback de erro opcional antes da V3.
- `groundMat.color.set(0x9aa0a6)` multiplica o albedo fotográfico por cinza — retinta a textura CC0 e pode lavar o PBR; calibrar ou remover na V2 com comparativo antes/depois.
- `loadLut3D` usa `document.createElement("canvas")` sem guarda SSR; hoje só corre dentro do Engine (client), mas uma importação futura em contexto SSR quebra — documentar "browser-only" ou mover para dentro do Engine.

## Discrepâncias
- `docs/planning/stages/stage-V1-status.md` tem cabeçalho stale: linha 2 diz "Status: parcial (gates de lint e Playwright pendentes)", mas a seção Gates do mesmo ficheiro (linhas 13-20, datada 2026-10-05) declara lint OK e Playwright OK com 0 erros e screenshots em `/tmp/browser/v1-gate/screenshots/`. O corpo está consistente com o código; o cabeçalho não foi atualizado.
- `.opencode/roadmap-proj.md` (linha 9) ainda marca V1 com "PENDENTE: lint (travou >600 s) + Playwright" — contradiz o status atualizado e a mensagem de handoff ("Gates fechados"). Roadmap precisa de sync (marcar V1 fechada) sem reescrever escopo.
- Contagem de testes: status/roadmap citam "vitest 28/28" (era 22/22 na v1) — os +6 são os de `quality.test.ts`, conferido no disco. Sem divergência real.

## Riscos para as próximas etapas
1. V3 sem KTX2/Meshopt: quando os primeiros glTF chegarem, o pipeline só terá Draco — risco de peso/tempo de decode acima do budget. Resolver antes de importar heróis (V3).
2. `runAssetQueue` ainda sem wiring na tela de loading: se V3 adicionar glBs sem ligar a fila ao `onProgress`, o "progresso real por bytes" regride para spinner. Ligar na GameCanvas junto ao primeiro asset P0.
3. Shadow-camera seguidora pendente (D-04): com terreno com relevo (V2) e cidade (V3), sombras estáticas vão vazar/serrar. Definir dono (V2 ou V7) já.
4. `groundMat.color` tingindo o albedo: estabelece precedente de "recolorir PBR" que pode contaminar o kit modular da V3 — fixar convenção (albedo intacto, variação via roughness/tint por instância).
5. Métrica de fps: headless ~3 fps não valida NFR-01; presets Ultra (shadow 4096, far 620) sem medição em desktop real podem estourar em integradas. Registrar medição desktop como pendência explícita da V7 (já previsto no PRD).

## Recomendações
1. Corrigir o cabeçalho do `stage-V1-status.md` para `Status: completed` e sincronizar `.opencode/roadmap-proj.md` linha 9 (V1 fechada, gates OK) — 5 minutos, evita confusão nas próximas avaliações.
2. Antes da V3: adicionar `KTX2Loader` + `MeshoptDecoder` ao `AssetLoader` com decoders em `public/basis/` e estender `build-assets.ts` (prioridade média).
3. Na V2/V3: ligar `runAssetQueue` ao `onProgress` da GameCanvas e expor erro de HDRI/P0 na tela de erro com retry (PRD §4.4); sem isso o aceite "loading real" da V1 não se sustenta quando houver glBs.
4. Decidir e registrar onde entra a shadow-camera seguidora (sugestão: V2 junto ao `heightAt`, pois mexe no mesmo ciclo de câmera/luz).
5. Remover ou justificar `groundMat.color.set(0x9aa0a6)` com screenshot comparativo no início da V2.

## Evidências consultadas
- docs/planning/stages/stage-V1-status.md
- .opencode/prd-project1.md (§4, §8 Fase V1, §10-11)
- .opencode/roadmap-proj.md (Fase V1)
- docs/planning/PRD.md, docs/planning/ROADMAP.md (contexto v1, sem conflito de escopo)
- src/game/assets/AssetLoader.ts (169 linhas)
- src/game/render/lut.ts, src/game/render/quality.ts + quality.test.ts (6 testes)
- src/game/core/Engine.ts (composer, setQuality/applyQuality)
- src/game/world/Level.ts:138-150 (piso PBR + applyEnvironment)
- src/routes/play.tsx:670-698 (UI de qualidade), src/components/game/GameCanvas.tsx:347-353 (GameApi)
- scripts/assets/manifest.json, scripts/assets/build-assets.ts, scripts/assets/report.json (4,04 MB / 3,02 MB)
- public/game-assets/CREDITS.md; disco: public/luts/military_teal_orange.png, public/draco/*, public/game-assets/textures/asphalt/*, public/game-assets/hdri/night_1k.hdr
- Gates declarados pelo builder (build OK, vitest 28/28, assets exit 0, lint OK, Playwright /play 0 erros + screenshots antes/depois) — verificação estática confirma consistência; execução Playwright não re-executada pelo monitor neste turno.
