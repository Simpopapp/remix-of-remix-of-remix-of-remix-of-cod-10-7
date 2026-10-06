/**
 * Cidade destruída (Fase V3, PRD RM-03/RM-04) — composições declarativas.
 * Cada peça do kit é uma entrada com transform explícito; nada de transform
 * mágico espalhado no código do mundo. Funções helpers puras expandem specs
 * compactas em listas de placements (determinísticas, sem aleatoriedade no
 * caminho do collider).
 *
 * Colliders: derivados do manifesto (KIT_MODULES) via getRuinColliders —
 * transformação OBB→AABB conservadora (rotação em Y; tilt é ignorado no
 * collider, face de contato fica levemente maior que a peça).
 *
 * Contrato de ancoragem ( RuinedCity.ts ):
 * - "bottom": base do AABB do módulo em y (paredes, colunas, props);
 * - "top": topo do AABB em y (lajes, roof, decals — superfície no y dado).
 * A rotação é aplicada em torno do eixo vertical que passa pelo centro
 * XZ do AABB do módulo.
 */

import { KIT_MODULES, type KitGroup } from "./kitManifest";
import type { BoxCollider } from "./props";
import { heightAt } from "@/game/world/terrainField";

export interface ModulePlacement {
  g: KitGroup;
  m: string;
  x: number;
  z: number;
  /** y da âncora: base (bottom) ou topo (top) do AABB do módulo */
  y: number;
  ry?: number;
  /** inclinação de dano [rx, rz] (radianos) */
  tilt?: [number, number];
  /** deslocamento horizontal de dano */
  off?: [number, number];
  /** deslocamento vertical de dano */
  drop?: number;
  s?: number;
  /** collider AABB derivado do manifesto (padrão true) */
  solid?: boolean;
}

export interface RubblePile {
  x: number;
  z: number;
  y?: number;
  /** raio do monte */
  r: number;
  count: number;
  kind: "brick" | "concrete" | "mixed";
  /** semente determinística */
  seed: number;
}

export interface ScorchDecal {
  x: number;
  z: number;
  y?: number;
  /** rotação (chão: orientação; parede: face) */
  ry?: number;
  /** parede vertical (senão: quad deitado no chão) */
  vertical?: boolean;
  w: number;
  h: number;
}

export type CityPropKind = "car" | "barrier" | "crate" | "lamp" | "acunit";

export interface CityProp {
  kind: CityPropKind;
  x: number;
  z: number;
  ry: number;
  y?: number;
  tilt?: [number, number];
  stack?: number;
  /** postes de luz: adiciona PointLight quente no cabeçote */
  light?: boolean;
  /** luz: intensidade */
  intensity?: number;
}

// ---------------------------------------------------------------------------
// Helpers de layout (puros, determinísticos)
// ---------------------------------------------------------------------------

/** Módulos de superfície (topo ancorado). Exportado para RuinedCity. */
export function isFlatModule(m: string): boolean {
  return /^(Floor_|Roof_|Decal_|Prop_Drain|Prop_ManholeCover)/.test(m);
}

/** Piso de janela estilo tijolo (4 m, com aberturas) vs metal (2 m painéis). */
interface EdgeModule {
  g: KitGroup;
  m: string;
  w: number;
}

interface StyleSpec {
  corner: { g: KitGroup; m: string };
  /** módulos de borda, do mais "com janela" ao mais "parede cega" */
  window: EdgeModule;
  plain: EdgeModule;
  interior: { g: KitGroup; m: string };
  roof: { g: KitGroup; m: string };
  /** corners são blocos 2×2 (bloqueiam 4 m de borda) ou colunas estreitas */
  cornerBlock: boolean;
}

const STYLES: Record<"brick" | "metal" | "trim", StyleSpec> = {
  brick: {
    corner: { g: "kit_brick", m: "Brick_Corner_Plain" },
    window: { g: "kit_brick", m: "Brick_Inset_Window", w: 4 },
    plain: { g: "kit_brick", m: "Brick_Plain_3", w: 2 },
    interior: { g: "kit_stone", m: "Floor_4x4" },
    roof: { g: "kit_stone", m: "Floor_4x4" },
    cornerBlock: true,
  },
  metal: {
    corner: { g: "kit_stone", m: "Metal_Column_Bottom" },
    window: { g: "kit_brick", m: "Metal_Window", w: 4 },
    plain: { g: "kit_brick", m: "Metal_Plain_3", w: 2 },
    interior: { g: "kit_stone", m: "Floor_4x4" },
    roof: { g: "kit_stone", m: "Floor_4x4" },
    cornerBlock: false,
  },
  trim: {
    corner: { g: "kit_trim", m: "Trim_Column_Bottom" },
    window: { g: "kit_brick", m: "Trim_Window", w: 2 },
    plain: { g: "kit_brick", m: "Trim_Plain_3", w: 2 },
    interior: { g: "kit_stone", m: "Floor_4x4" },
    roof: { g: "kit_stone", m: "Floor_4x4" },
    cornerBlock: false,
  },
};

export type Side = "N" | "E" | "S" | "W";

interface Damage {
  /** peças removidas (dano estrutural): piso + lado + índice na borda */
  skip?: Array<{ floor: number; side: Side; idx?: number }>;
  /** peças tortas/deslocadas */
  bend?: Array<{
    floor: number;
    side: Side;
    idx?: number;
    tilt?: [number, number];
    off?: [number, number];
    drop?: number;
  }>;
  /** lajes internas por nível (1 = entre piso 0 e 1): índices a remover/inclinar */
  skipSlabs?: Array<{ level: number; idx: number }>;
  slabTilt?: Array<{ level: number; idx: number; tilt: [number, number]; drop?: number }>;
  skipRoof?: number[];
  roofTilt?: Array<{ idx: number; tilt: [number, number]; drop?: number }>;
}

interface RuinSpec {
  cx: number;
  cz: number;
  w: number;
  d: number;
  floors: number;
  style: "brick" | "metal" | "trim";
  solid?: boolean;
  damage?: Damage;
}

/** Grid de lajes 4×4 cobrindo w×d; índice = col-major (x, depois z). */
function slabIndices(w: number, d: number): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  const nx = Math.round(w / 4);
  const nz = Math.round(d / 4);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) cells.push([ix, iz]);
  }
  return cells;
}

function slabIndex(w: number, ix: number, iz: number): number {
  return iz * Math.round(w / 4) + ix;
}

/** Anel de um piso: corners + bordas com janelas (N/S) e paredes (E/W). */
function ringPlacements(spec: RuinSpec, floor: number, out: ModulePlacement[]): void {
  const st = STYLES[spec.style];
  const y = floor * 3;
  const hw = spec.w / 2;
  const hd = spec.d / 2;
  const dmg = spec.damage;
  const isSkipped = (side: Side, idx: number): boolean =>
    dmg?.skip?.some(
      (s) => s.floor === floor && s.side === side && (s.idx === undefined || s.idx === idx),
    ) ?? false;
  const bendFor = (side: Side, idx: number) =>
    dmg?.bend?.find(
      (b) => b.floor === floor && b.side === side && (b.idx === undefined || b.idx === idx),
    );

  const put = (
    side: Side,
    idx: number,
    mod: EdgeModule | { g: KitGroup; m: string },
    x: number,
    z: number,
    ry: number,
  ): void => {
    if (isSkipped(side, idx)) return;
    const bend = bendFor(side, idx);
    out.push({
      g: mod.g,
      m: mod.m,
      x,
      z,
      y,
      ry,
      ...(spec.solid !== undefined ? { solid: spec.solid } : {}),
      ...(bend
        ? {
            ...(bend.tilt ? { tilt: bend.tilt } : {}),
            ...(bend.off ? { off: bend.off } : {}),
            ...(bend.drop !== undefined ? { drop: bend.drop } : {}),
          }
        : {}),
    });
  };

  // corners
  const cornerOffsets: Array<[number, number, Side]> = [
    [-hw + 1, -hd + 1, "W"],
    [hw - 1, -hd + 1, "E"],
    [-hw + 1, hd - 1, "W"],
    [hw - 1, hd - 1, "E"],
  ];
  for (const [ox, oz, side] of cornerOffsets) {
    if (isSkipped(side, -1)) continue;
    const bend = bendFor(side, -1);
    out.push({
      g: st.corner.g,
      m: st.corner.m,
      x: spec.cx + ox,
      z: spec.cz + oz,
      y,
      ...(spec.solid !== undefined ? { solid: spec.solid } : {}),
      ...(bend
        ? {
            ...(bend.tilt ? { tilt: bend.tilt } : {}),
            ...(bend.off ? { off: bend.off } : {}),
            ...(bend.drop !== undefined ? { drop: bend.drop } : {}),
          }
        : {}),
    });
  }

  const free = (span: number): number => (st.cornerBlock ? span - 4 : span - 1.2);
  const isWindowSide = (side: Side, floor: number): boolean =>
    (side === "N" || side === "S") && floor > 0;

  // bordas N/S: ao longo de x
  for (const side of ["N", "S"] as const) {
    const z = spec.cz + (side === "N" ? hd - 1 : -(hd - 1));
    const span = free(spec.w);
    if (isWindowSide(side, floor)) {
      const mod = st.window;
      const n = Math.max(1, Math.round(span / mod.w));
      for (let i = 0; i < n; i++) {
        const x = spec.cx + (i - (n - 1) / 2) * mod.w;
        put(side, i, mod, x, z, 0);
      }
    } else {
      const mod = st.plain;
      const n = Math.max(1, Math.round(span / mod.w));
      for (let i = 0; i < n; i++) {
        const x = spec.cx + (i - (n - 1) / 2) * mod.w;
        put(side, i, mod, x, z, 0);
      }
    }
  }
  // bordas E/W: ao longo de z
  for (const side of ["E", "W"] as const) {
    const x = spec.cx + (side === "E" ? hw - 1 : -(hw - 1));
    const span = free(spec.d);
    const mod = st.plain;
    const n = Math.max(1, Math.round(span / mod.w));
    for (let i = 0; i < n; i++) {
      const z = spec.cz + (i - (n - 1) / 2) * mod.w;
      put(side, i, mod, x, z, Math.PI / 2);
    }
  }
}

/** Lajes internas (níveis 1..floors−1) + telhado. */
function slabPlacements(spec: RuinSpec, out: ModulePlacement[]): void {
  const st = STYLES[spec.style];
  const dmg = spec.damage;
  for (let level = 1; level < spec.floors; level++) {
    const y = level * 3;
    for (const [ix, iz] of slabIndices(spec.w, spec.d)) {
      const idx = slabIndex(spec.w, ix, iz);
      const skip = dmg?.skipSlabs?.some((s) => s.level === level && s.idx === idx) ?? false;
      const bend = dmg?.slabTilt?.find((s) => s.level === level && s.idx === idx);
      if (skip) continue;
      out.push({
        g: st.interior.g,
        m: st.interior.m,
        x: spec.cx - spec.w / 2 + 2 + ix * 4,
        z: spec.cz - spec.d / 2 + 2 + iz * 4,
        y,
        solid: false,
        ...(bend
          ? { tilt: bend.tilt, ...(bend.drop !== undefined ? { drop: bend.drop } : {}) }
          : {}),
      });
    }
  }
  const ry = spec.floors * 3 + 0.35;
  for (const [ix, iz] of slabIndices(spec.w, spec.d)) {
    const idx = slabIndex(spec.w, ix, iz);
    const skip = dmg?.skipRoof?.includes(idx) ?? false;
    const bend = dmg?.roofTilt?.find((s) => s.idx === idx);
    if (skip) continue;
    out.push({
      g: st.roof.g,
      m: st.roof.m,
      x: spec.cx - spec.w / 2 + 2 + ix * 4,
      z: spec.cz - spec.d / 2 + 2 + iz * 4,
      y: ry,
      solid: false,
      ...(bend ? { tilt: bend.tilt, ...(bend.drop !== undefined ? { drop: bend.drop } : {}) } : {}),
    });
  }
}

function ruinBuilding(spec: RuinSpec): ModulePlacement[] {
  const out: ModulePlacement[] = [];
  for (let f = 0; f < spec.floors; f++) ringPlacements(spec, f, out);
  slabPlacements(spec, out);
  return out;
}

// ---------------------------------------------------------------------------
// Composições da cidade (norte, através do portão — jogador alcança até z 38)
// ---------------------------------------------------------------------------

/**
 * A — prédio de tijolo, 3 pisos, parcialmente desabado (referência visual
 * alinhada ao portão). Freada leste do piso superior caída, laje exposta.
 */
const BUILDING_A: RuinSpec = {
  cx: 0,
  cz: 49,
  w: 8,
  d: 8,
  floors: 3,
  style: "brick",
  damage: {
    skip: [
      { floor: 2, side: "E", idx: 0 },
      { floor: 2, side: "W", idx: 1 },
    ],
    bend: [
      { floor: 2, side: "N", idx: 0, tilt: [0.12, 0.06], off: [0.3, 0.25], drop: 0.2 },
      { floor: 2, side: "S", idx: 0, tilt: [-0.08, 0.1], off: [-0.2, 0.15], drop: 0.3 },
      { floor: 2, side: "E", idx: -1, tilt: [0.0, -0.18], off: [0.5, 0.4], drop: 0.1 },
      { floor: 1, side: "E", idx: 0, tilt: [0.05, 0.04], off: [0.15, 0.1] },
    ],
    skipSlabs: [{ level: 2, idx: 2 }],
    slabTilt: [{ level: 2, idx: 3, tilt: [0.07, -0.05], drop: 0.25 }],
    skipRoof: [1, 2],
    roofTilt: [{ idx: 0, tilt: [0.09, 0.04], drop: 0.15 }],
  },
};

/** B — prédio metálico, 2 pisos, fachada sul desabada. */
const BUILDING_B: RuinSpec = {
  cx: 20,
  cz: 49,
  w: 8,
  d: 8,
  floors: 2,
  style: "metal",
  damage: {
    skip: [
      { floor: 1, side: "S", idx: 0 },
      { floor: 1, side: "S", idx: -1 },
    ],
    bend: [{ floor: 1, side: "E", idx: 0, tilt: [0.1, 0.0], off: [0.25, 0.2], drop: 0.15 }],
    skipRoof: [2, 3],
    roofTilt: [{ idx: 0, tilt: [0.08, 0], drop: 0.2 }],
  },
};

/** C — casa de tijolo, 2 pisos, lado oeste aberto. */
const BUILDING_C: RuinSpec = {
  cx: -26,
  cz: 49,
  w: 8,
  d: 8,
  floors: 2,
  style: "brick",
  damage: {
    skip: [
      { floor: 1, side: "W", idx: 0 },
      { floor: 1, side: "W", idx: 1 },
    ],
    bend: [{ floor: 1, side: "N", idx: 0, tilt: [0.0, 0.14], off: [0.3, 0.2], drop: 0.1 }],
    skipSlabs: [{ level: 1, idx: 1 }],
    slabTilt: [{ level: 1, idx: 2, tilt: [-0.06, 0.08], drop: 0.2 }],
    skipRoof: [0],
    roofTilt: [{ idx: 3, tilt: [0.05, -0.09], drop: 0.25 }],
  },
};

/** D — loja de acabamento trim, 1 piso, telhado parcial. */
const BUILDING_D: RuinSpec = {
  cx: 28,
  cz: 47,
  w: 8,
  d: 6,
  floors: 1,
  style: "trim",
  damage: {
    skip: [{ floor: 0, side: "E", idx: 1 }],
    skipRoof: [1],
    roofTilt: [{ idx: 2, tilt: [0.1, 0], drop: 0.18 }],
  },
};

/** Cascos inteiros (skyline, visual apenas — não entráveis, sem collider). */
const SHELLS: ReadonlyArray<{
  g: KitGroup;
  m: string;
  x: number;
  z: number;
  ry: number;
  s?: number;
}> = [
  { g: "kit_brick", m: "Building_Small_1", x: -24, z: 56, ry: 0.15 },
  { g: "kit_brick", m: "Building_Medium_2001", x: 30, z: 56, ry: -0.2 },
  { g: "kit_brick", m: "Building_Large_2", x: -44, z: 42, ry: 0.6 },
  { g: "kit_brick", m: "Building_Medium_2001", x: -46, z: 4, ry: Math.PI / 2 },
  { g: "kit_brick", m: "Building_Small_1", x: 46, z: -12, ry: -Math.PI / 2 },
  { g: "kit_brick", m: "Building_Large_2", x: 46, z: 22, ry: -1.1 },
  { g: "kit_brick", m: "Building_Small_1", x: -48, z: -22, ry: 0.3 },
  { g: "kit_brick", m: "Building_Small_1", x: 0, z: -48, ry: Math.PI },
  { g: "kit_brick", m: "Building_Medium_2001", x: -30, z: -46, ry: 2.9 },
  { g: "kit_brick", m: "Building_Small_1", x: 26, z: -47, ry: 3.35 },
];

// ---------------------------------------------------------------------------
// Pátio murado: muros perimetrais e armazém em painéis metálicos do kit
// ---------------------------------------------------------------------------

/** Painéis 2×3 (Metal_Plain_3) ao longo de x ou z, n = round(span/2). */
function panelRun(
  axis: "x" | "z",
  center: number,
  span: number,
  fixed: number,
  y: number,
  opts?: { skipIdx?: number[]; tiltIdx?: Record<number, [number, number]> },
): ModulePlacement[] {
  const out: ModulePlacement[] = [];
  const n = Math.max(1, Math.round(span / 2));
  const step = 2;
  for (let i = 0; i < n; i++) {
    if (opts?.skipIdx?.includes(i)) continue;
    const t = center - (n * step) / 2 + step / 2 + i * step;
    const x = axis === "x" ? t : fixed;
    const z = axis === "x" ? fixed : t;
    const bend = opts?.tiltIdx?.[i];
    out.push({
      g: "kit_brick",
      m: "Metal_Plain_3",
      x,
      z,
      y,
      ry: axis === "x" ? 0 : Math.PI / 2,
      ...(bend ? { tilt: bend } : {}),
    });
  }
  return out;
}

/** Muro perimetral (Metal_Plain_3, 2 bandas de 3 m — visual 6 m) por dados. */
function compoundWalls(): ModulePlacement[] {
  const out: ModulePlacement[] = [];
  for (const wall of [
    { x: -18.5, z: 26, w: 31, d: 0.6 },
    { x: 18.5, z: 26, w: 31, d: 0.6 },
    { x: 0, z: -34, w: 68, d: 0.6 },
    { x: -34, z: -4, w: 0.6, d: 60.6 },
    { x: 34, z: -4, w: 0.6, d: 60.6 },
  ]) {
    const alongX = wall.w > wall.d;
    const span = alongX ? wall.w : wall.d;
    // recuo de 1.1 m nas pontas evita sobreposição nos cantos (z-fight)
    for (const y of [0, 3]) {
      out.push(
        ...panelRun(
          alongX ? "x" : "z",
          alongX ? wall.x : wall.z,
          span - 2.2,
          alongX ? wall.z : wall.x,
          y,
        ),
      );
    }
  }
  return out;
}

/** Armazém do objetivo C em painéis metálicos + dano na fachada leste. */
function warehousePanels(): ModulePlacement[] {
  const out: ModulePlacement[] = [];
  // fachada z = −21: segmentos laterais (x −13..−3 e 3..13), 2 bandas
  for (const y of [0, 3]) {
    out.push(...panelRun("x", -8, 10, -21, y));
    // banda superior da fachada leste: 1 painel em falta (buraco) + 1 torto
    out.push(
      ...panelRun("x", 8, 10, -21, y, {
        skipIdx: y === 3 ? [2] : [],
        tiltIdx: y === 3 ? { 3: [0.06, 0.04] } : {},
      }),
    );
  }
  // verga do portão (x −3..3, y 6..8): 2 fileiras de painéis de 1 m
  for (const y of [6, 7]) {
    for (const x of [-2, 0, 2]) {
      out.push({ g: "kit_brick", m: "Metal_Plain_1", x, z: -21, y });
    }
  }
  // fundo z = −33 (26 m): 2 bandas
  for (const y of [0, 3]) out.push(...panelRun("x", 0, 26, -33, y));
  // laterais x = ±13 (12 m): 2 bandas
  for (const side of [-13, 13] as const) {
    for (const y of [0, 3]) out.push(...panelRun("z", -27, 12, side, y));
  }
  return out;
}

/** Telhado do armazém: lajes de concreto com furos e lajes tortas. */
function warehouseRoof(): ModulePlacement[] {
  const out: ModulePlacement[] = [];
  const cells = slabIndices(28, 12);
  const skip = new Set([slabIndex(28, 0, 0), slabIndex(28, 4, 2)]);
  const tiltAt = new Map<number, [number, number]>([
    [slabIndex(28, 1, 0), [0.05, 0.08]],
    [slabIndex(28, 5, 1), [-0.04, 0.06]],
  ]);
  for (const [ix, iz] of cells) {
    const idx = slabIndex(28, ix, iz);
    if (skip.has(idx)) continue;
    out.push({
      g: "kit_stone",
      m: "Floor_4x4",
      x: -14 + 2 + ix * 4,
      z: -33 + 2 + iz * 4,
      y: 8.3,
      solid: false,
      ...(tiltAt.has(idx) ? { tilt: tiltAt.get(idx)! } : {}),
    });
  }
  return out;
}

/** Cabine da torre de vigia em painéis (substitui a caixa procedural). */
function towerCabin(): ModulePlacement[] {
  const out: ModulePlacement[] = [];
  const cx = 22;
  const cz = -10;
  for (const y of [10, 11]) {
    out.push({ g: "kit_brick", m: "Metal_Plain_1", x: cx - 1, z: cz - 1, y });
    out.push({ g: "kit_brick", m: "Metal_Plain_1", x: cx + 1, z: cz - 1, y });
    out.push({ g: "kit_brick", m: "Metal_Plain_1", x: cx - 1, z: cz + 1, y });
    out.push({ g: "kit_brick", m: "Metal_Plain_1", x: cx + 1, z: cz + 1, y });
    out.push({ g: "kit_brick", m: "Metal_Plain_1", x: cx - 1, z: cz, y, ry: Math.PI / 2 });
    out.push({ g: "kit_brick", m: "Metal_Plain_1", x: cx + 1, z: cz, y, ry: Math.PI / 2 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rua, props urbanos, entulho e decals
// ---------------------------------------------------------------------------

/** Rua destruída ao norte (a peça Street_2Lane inclui calçadas). */
function cityStreet(): ModulePlacement[] {
  const out: ModulePlacement[] = [];
  for (const x of [-21, -9, 3, 15]) {
    out.push({
      g: "kit_stone",
      m: "Street_2Lane",
      x,
      z: 41,
      y: heightAt(x, 41) + 0.02,
      ry: Math.PI / 2,
      solid: false,
    });
  }
  return out;
}

export const CITY_PROPS: readonly CityProp[] = [
  // carros destruídos na rua (fora do alcance do jogador: visual)
  { kind: "car", x: -15, z: 40.2, ry: 0.35, tilt: [0.04, -0.06] },
  { kind: "car", x: 8, z: 41.6, ry: 1.85, tilt: [0.05, -0.08] },
  { kind: "car", x: -26.5, z: 41.8, ry: 2.9 },
  // postes de luz (cabeçote com luz quente)
  { kind: "lamp", x: -24, z: 44.6, ry: 0, light: true, intensity: 55 },
  { kind: "lamp", x: -8, z: 44.6, ry: 0, light: true, intensity: 40 },
  { kind: "lamp", x: 8, z: 44.6, ry: 0, light: true, intensity: 45 },
  { kind: "lamp", x: 22, z: 44.6, ry: 0, light: true, intensity: 35 },
  // barreiras e caixotes ao longo da rua
  { kind: "barrier", x: -18, z: 43.4, ry: 0.2 },
  { kind: "barrier", x: 0, z: 43.6, ry: -0.1 },
  { kind: "barrier", x: 16, z: 43.5, ry: 0.3 },
  { kind: "crate", x: -4.5, z: 45.8, ry: 0.4, stack: 2 },
  { kind: "crate", x: -4.9, z: 46.6, ry: -0.2, stack: 3 },
  { kind: "crate", x: 24.5, z: 45.2, ry: 0.7, stack: 2 },
  // AC units nos cascos (visível acima dos muros)
  { kind: "acunit", x: -24.5, z: 54.2, y: heightAt(-24.5, 54.2) + 17.0, ry: 0.15 },
  { kind: "acunit", x: 29.5, z: 54.6, y: heightAt(29.5, 54.6) + 24.8, ry: -0.4 },
];

export const RUBBLE_PILES: readonly RubblePile[] = [
  // rua destruída
  { x: -21, z: 41, r: 2.4, count: 44, kind: "mixed", seed: 11 },
  { x: -9, z: 40.5, r: 2.0, count: 36, kind: "brick", seed: 22 },
  { x: 3, z: 41.5, r: 2.2, count: 40, kind: "concrete", seed: 33 },
  { x: 15, z: 41, r: 2.4, count: 44, kind: "mixed", seed: 44 },
  // bases dos prédios destruídos
  { x: 0, z: 45.6, r: 2.6, count: 52, kind: "brick", seed: 55 },
  { x: 20, z: 45.4, r: 2.2, count: 44, kind: "concrete", seed: 66 },
  { x: -26, z: 45.6, r: 2.4, count: 48, kind: "brick", seed: 77 },
  { x: 28, z: 44.2, r: 1.8, count: 34, kind: "mixed", seed: 88 },
  // armazém danificado (pátio) — fachada norte
  { x: 0, z: -20.4, r: 2.2, count: 40, kind: "mixed", seed: 91 },
  { x: 12, z: -20.6, r: 2.0, count: 36, kind: "concrete", seed: 92 },
  { x: -11, z: -20.8, r: 1.8, count: 30, kind: "mixed", seed: 93 },
];

export const SCORCH_DECALS: readonly ScorchDecal[] = [
  // crateras de morteiro (marcas de queimado)
  { x: -14, z: 33, w: 6, h: 6, ry: 0.4 },
  { x: 20, z: 31, w: 5, h: 5, ry: 1.1 },
  { x: -24, z: 36, w: 6.4, h: 6.4, ry: 2.2 },
  { x: 0, z: 41, w: 5, h: 5, ry: 0.8 },
  { x: 12, z: 44, w: 4.5, h: 4.5, ry: 1.7 },
  // fachada do armazém (paredes verticais)
  { x: -6, z: -20.86, y: 2.6, ry: 0, vertical: true, w: 2.6, h: 3.2 },
  { x: 4, z: -20.86, y: 3.4, ry: 0, vertical: true, w: 3.2, h: 3.8 },
  { x: 9.5, z: -20.86, y: 1.9, ry: 0, vertical: true, w: 2.2, h: 2.8 },
  { x: 11, z: -20.86, y: 5, ry: 0, vertical: true, w: 3, h: 3.4 },
  // fachada sul do prédio A (visto pelo portão) — a face frontal do anel
  // sul fica em z ≈ 46; decal a 45.85 encosta na parede sem z-fight
  { x: -1.5, z: 45.85, y: 2.2, ry: Math.PI, vertical: true, w: 2.4, h: 2.8 },
  { x: 1.5, z: 45.85, y: 4.8, ry: Math.PI, vertical: true, w: 2.8, h: 3.4 },
];

/** Vergalhões expostos nas lajes quebradas (cilindros instanciados, TS puro: dados aqui). */
export const REBAR: ReadonlyArray<[number, number, number, number]> = [
  // x, y, z, comprimento
  [2.2, 3.05, 47.3, 0.8],
  [2.4, 3.02, 50.2, 0.6],
  [-2.1, 6.05, 47.2, 0.7],
  [-2.3, 6.02, 50.4, 0.9],
  [21.9, 3.05, 46.2, 0.7],
  [-26.2, 3.05, 50.1, 0.6],
  [9.4, 8.32, -30.5, 0.8],
  [13.2, 8.32, -31.8, 0.7],
];

// ---------------------------------------------------------------------------
// Montagem final
// ---------------------------------------------------------------------------

function allPlacements(): ModulePlacement[] {
  return [
    ...ruinBuilding(BUILDING_A),
    ...ruinBuilding(BUILDING_B),
    ...ruinBuilding(BUILDING_C),
    ...ruinBuilding(BUILDING_D),
    ...compoundWalls(),
    ...warehousePanels(),
    ...warehouseRoof(),
    ...towerCabin(),
    ...cityStreet(),
    ...SHELLS.map((s) => ({
      g: s.g,
      m: s.m,
      x: s.x,
      z: s.z,
      y: heightAt(s.x, s.z) - 0.15,
      ry: s.ry,
      solid: false,
      ...(s.s ? { s: s.s } : {}),
    })),
  ];
}

/** Todos os placements do kit (cidade + pátio). Data-driven, sem THREE. */
export const KIT_PLACEMENTS: readonly ModulePlacement[] = allPlacements();

/**
 * Colliders derivados do manifesto: OBB (ry) → AABB conservador por peça
 * marcada como sólida. Rotação em torno do eixo vertical no centro XZ do
 * AABB; tilt ignorado (contato levemente maior que a peça — conservador).
 */
export function getRuinColliders(): BoxCollider[] {
  const out: BoxCollider[] = [];
  for (const p of KIT_PLACEMENTS) {
    if (p.solid === false) continue;
    const a = KIT_MODULES[p.g]?.[p.m];
    if (!a) continue;
    const s = p.s ?? 1;
    const ry = p.ry ?? 0;
    const c = Math.abs(Math.cos(ry));
    const sn = Math.abs(Math.sin(ry));
    const hx = ((a.max[0] - a.min[0]) / 2) * s;
    const hy = ((a.max[1] - a.min[1]) / 2) * s;
    const hz = ((a.max[2] - a.min[2]) / 2) * s;
    const ex = c * hx + sn * hz;
    const ez = sn * hx + c * hz;
    const [ox, oz] = p.off ?? [0, 0];
    const cyBottom = isFlatModule(p.m) ? p.y - hy : p.y + hy;
    out.push({
      minX: p.x + ox - ex,
      maxX: p.x + ox + ex,
      minY: cyBottom - hy + (p.drop ?? 0),
      maxY: cyBottom + hy + (p.drop ?? 0),
      minZ: p.z + oz - ez,
      maxZ: p.z + oz + ez,
    });
  }
  return out;
}
