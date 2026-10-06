# Stage V1 — Pipeline de assets e iluminação física
Status: concluída (ver monitor: docs/planning/reports/stage-V1-eval.md)
Date: 2026-10-05

## Entregue
- AssetLoader completo: texturas PBR + HDRI com cache; `loadGLB` com Draco local (`public/draco/`) e progresso por bytes; `runAssetQueue` com progresso agregado ponderado e semântica P0/P1 (PRD §4.4).
- LUT "teal & orange militar" gerado (`public/luts/military_teal_orange.png`, 32³) + decodificador `src/game/render/lut.ts` → Data3DTexture → LUTPass.
- Engine: GTAO, SMAA, LUT integrados ao composer (ordem Render → GTAO → Bloom → Output → LUT → SMAA → grade); bloom/SSAO chaveáveis.
- Presets de qualidade Baixo/Médio/Alto/Ultra (`src/game/render/quality.ts`, puro + 6 testes): shadow map, SSAO, bloom, teto de resolução, draw distance; persistidos em `ob:quality`; aplicados às luzes do nível e expostos na UI de pausa (`Gauge`), com API `setQuality/getQuality` no GameApi.
- Pipeline de assets: `scripts/assets/manifest.json` + `build-assets.ts` (existência, créditos D-02, budgets D-01) → `report.json`. Total 4,04 MB / 120 MB; primeiro frame 3,02 MB / 40 MB.
- CREDITS.md atualizado (asphalt, HDRI, Draco Apache-2.0, LUT próprio).

## Gates
- build: OK (typecheck limpo)
- vitest: 28/28
- assets script: exit 0
- lint: OK — `bun run lint` (eslint .) concluiu sem erros (2026-10-05)
- Playwright /play: OK — 0 erros de consola; screenshots antes/depois em
  `/tmp/browser/v1-gate/screenshots/`; briefing "Operação Blackout" renderiza com
  cena noturna (luzes de fundo visíveis) atrás do overlay

## Próximo
- Submeter à avaliação do monitor (report stage-V1-eval) e iniciar Fase V2.
