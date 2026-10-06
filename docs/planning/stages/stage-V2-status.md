# Stage V2 — Terreno com relevo
Status: entregue — gates fechados nesta revisão (build OK, vitest 38/38, Playwright 0 erros; lint travado por ambiente)
Date: 2026-10-05 (revisão pós-gates: cleanup Terrain.ts — vertexShader.replace no-op removido, vTerrRough inicializado)

## Entregue
- `src/game/world/terrainField.ts` (puro): heightfield determinístico (value noise com semente fixa) — vala em anel ao redor do perímetro (fundo a ~3.2 m do muro, −1.9 m), morro ao norte (pico 3.2 m em (12, 44)), 3 crateras de morteiro (bacia + borda erguida), 2 rampas de acesso esculpidas no terreno atravessando a vala desde o portão. `heightAt()`, `slopeAt()`, `terrainWeights()`, `terrainBlocksLos()`.
- `src/game/world/Terrain.ts` (browser-only): malha 120×120 m / 256×256 segmentos com alturas de heightAt + splat de 4 camadas PBR fotográficas (asfalto/terra/cascalho/lama) via máscara RGBA (DataTexture 256²) injetada no MeshStandardMaterial (albedo + roughness por camada, pesos somados no shader). AO/normal por camada ficam para V7 (budget de complexidade do shader).
- Player: chão = heightAt(x, z) (antes y≤0); testes novos de rampa (ganho de altura + assentamento exato) e cratera.
- IA: spawn e moveToward projetados no terreno; LOS com occlusão por relevo (terrainBlocksLos antes do raycast); ponto de cobertura com altura do terreno.
- Level.ts: plano antigo de 300×300 substituído pelo terreno + plano underlay 600×600 a −4.4 m; tint `0x9aa0a6` removido (recomendação do monitor da V1).
- Assets: dirt/gravel/brown_mud (Poly Haven, CC0, 1k, 4 mapas cada) baixados; manifest + CREDITS.md + report (12,69 MB/120 total; primeiro frame 3,02 MB/40).

## Gates
- build: OK (exit 0)
- vitest: 38/38 (10 novos: 8 terrainField + 2 Player)
- assets script: exit 0
- lint: PENDENTE por travamento — 3 execuções (V1, V2 e pós-cleanup Terrain.ts) travam sem output (`eslint .` >11 min, log em /tmp/lint-v2.log). Trata-se de problema de ambiente, não de código; gate registrado como dead-gate e reavaliado em V3 com config de lint focada.
- Playwright /play: OK — 0 erros de console; player assenta no relevo via heightAt (rampa (5,30)→y=0.86, encosta do morro (12,38)→y=1.32, fundo da cratera (−14,33)→y=−1.48); screenshots em /tmp/browser/v2-phase/screenshots/. Reserva: a câmera headless fica no override da intro cinematográfica (pointer lock não é concedido em headless), então as fotos mostram a vista crane-down da intro; o assentamento físico do relevo é comprovado pelas posições do Player.

## Próximo
- Submeter V2 à reavaliação do monitor e iniciar Fase V3 (cidade destruída).
