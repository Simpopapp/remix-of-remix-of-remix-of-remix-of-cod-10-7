# V3 — Ruined City (destroyed city) with PBR modular kit

## Decision: assets
- **Kit:** Quaternius Downtown City MegaKit (CC0, `License_Standard.txt`), converted to 5 grouped GLBs with 2k textures, `Brick/MetalConcrete/Concrete/Trim/Street/RoofSlate` sets — destroyed buildings composed from brick columns, walls, windows, cornices, floors; streets/sidewalks as ground; roofs. Work dir: `/tmp/kitwork/{g}.glb` (kit_brick, kit_stone, kit_trim, kit_street, kit_roof).
- **Props:** Poly Haven CC0 (destroyed-scene feel): `covered_car`, `concrete_road_barrier`, `street_lamp_01`, `old_military_crate` — single GLBs at `/tmp/glb/*.glb` (35 MB at 2k; downscale to 1k if budget requires).
- Destruction detail: expose floor slabs, tilt/offset stacked modules, rubble piles from wall debris, damage staging per composition.

## Pipeline
1. Copy GLBs into `public/game-assets/` under kit/props folders (renamed stable names); update `scripts/assets/build-assets.ts` manifest (credits: Quaternius CC0 + Poly Haven CC0) respecting 120 MB total budget (current 12.69 MB + ~59 MB kit + props ≤ 12 MB at 1k).
2. Wire **async** loading (browser-only): do not alter `GameCanvas.tsx` sync `buildLevel` flow; loader pulls GLBs after spawn.
3. New `src/game/data/ruins.ts` — declarative list of ruined compositions (module refs, transforms, debris piles, damage).
4. New `src/game/world/RuinedCity.ts` — async place kit meshes, spawn colliders via existing API, integrate into `Level.ts` after sync build.
5. Auditable BoxGeometry replacements for visible boxes flagged in V2 audit.

## Gates
- `bunx eslint src scripts` → 0 errors (scoped; never `bun run lint`).
- Playwright `/play`: 0 console errors, screenshots in `/tmp/browser/v3-phase/`, write `docs/planning/reports/stage-V3-eval.md` and `stage-V3-status.md` then submit to monitor.
