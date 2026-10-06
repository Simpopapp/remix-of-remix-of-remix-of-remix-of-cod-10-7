# Stage V3 — Cidade destruída (kit modular PBR)
Status: em progresso
Date: 2026-10-06

## Concluído nesta passada
- Assets: kit Quaternius (5 GLB agrupados, 29.9 MB) em `public/game-assets/kit/`
  (kit_brick externo via lovable-assets → `src/assets/kit_brick.asset.json`, 13.8 MB
  acima do limite de commit); 4 props Poly Haven 1k (11.1 MB) em `public/game-assets/props/`.
- `scripts/assets/manifest.json` + `public/game-assets/CREDITS.md` + `build-assets.ts`
  (suporte a assetJson): 51.7 MB / 120 MB total, primeiro frame 3.02 MB / 40 MB ✓.
- `src/game/data/kitManifest.ts`: AABB por módulo gerado dos GLB (fonte única).
- `src/game/data/ruins.ts`: composições declarativas (4 prédios destruídos por
  anéis/lajes com damage plan — skip/tilt/off/drop; 10 cascos inteiros como
  skyline; rua; muros perimetrais + armazém em painéis Metal_Plain_3; telhado
  do armazém em lajes com furos; cabine da torre em painéis; rubble piles,
  decals de fuligem, vergalhões) + `getRuinColliders()` (OBB→AABB do manifesto).
- `src/game/data/props.ts`: substituições do pátio (carros caídos, barreiras PBR,
  pilhas de caixote militar, canteiros; barris cortados por D-03) +
  `getPropColliders()` (colliders coerentes com os novos volumes).
- `src/game/world/RuinedCity.ts`: carga async (loadGLB + cache), instancing por
  módulo (InstancedMesh), entulho determinístico (mulberry32), decals, props,
  luzes dos postes; dispose seguro antes de ready.
- tsconfig: resolveJsonModule para o ponteiro do asset.

## Pendente (próxima passada)
- Integrar em `Level.ts`: remover malhas procedurais (contêineres, caixotes,
  barris, muros, telhado, barreiras, cabine do farol) e chamar createRuinedCity;
  `getLevelColliders()` passa a somar getPropColliders + getRuinColliders.
- Corrigir decal vertical da fachada do prédio A (z 45.85) e conferir ancoragem
  dos props GLB (carro yMin −0.30; caixote −0.10).
- Testes: unit para getPropColliders/getRuinColliders + vitest completo.
- Gates: build + `bunx eslint src scripts` + Playwright /play (0 erros de console,
  4 screenshots em /tmp/browser/v3-phase/) + auditoria traverse (zero BoxGeometry
  de cenário) + reporte ao project monitor.

## Atualização 2026-10-06 (sessão atual)
- [x] Level.ts integrado a createRuinedCity; colliders derivados de dados (props+ruínas+pilares); geometria procedural substituída removida
- [x] Correções em ruins.ts (módulos metal/trim apontavam grupos errados → kit_brick; decals Building A em z=45.85)
- [x] RuinedCity.ts: planters (kit_stone) e AC units (kit_trim) agora posicionados a partir dos módulos reais do kit
- [x] Novo teste src/game/data/ruins.test.ts — vitest 48/48; build OK; eslint src scripts 0 erros (6 warnings pré-existentes em ui/*)
- [x] Playwright /play: pointer lock OK via botão, 0 erros de console; cidade carregada (471 malhas, 470 com texturas PBR); screenshots em /tmp/browser/v3-phase/
- [ ] BLOQUEIO: malhas kit carregadas e visíveis na cena, mas prédios destruídos não aparecem no enquadramento nos pontos testados (vista do spawn e do centro da cidade) — investigar iluminação noturna dos materiais do kit / culling / posicionamento antes do gate "screenshots da cidade"
