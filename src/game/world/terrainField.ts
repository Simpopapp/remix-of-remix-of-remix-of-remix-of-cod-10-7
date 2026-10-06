/**
 * Campo de altura do terreno (Fase V2, PRD RM-02) — TS puro, sem THREE, sem
 * React. Fonte única de verdade para relevo: Player, IA, malha do terreno e
 * máscara de splat derivam tudo daqui.
 *
 * Composição do relevo (fora do complexo murado, que permanece plano em y = 0):
 * - vala de rebaixamento em anel ao redor do perímetro (dist 3.2 m do muro);
 * - morro com rampas de acesso ao norte (através do portão);
 * - crateras de morteiro;
 * - ondulação suave determinística (value noise com semente fixa).
 */

export const TERRAIN_SIZE = 120;
export const TERRAIN_SEG = 256;

/** Retângulo murado do complexo (spans de level1: x -34..34, z -34..26). */
const RECT = { minX: -34, maxX: 34, minZ: -34, maxZ: 26 };

/** Morro ao norte (alcance do jogador até MAP_LIMIT 38). */
const MOUND = { x: 12, z: 44, r: 14, peak: 3.2 };

/** Crateras de morteiro (fora do perímetro). */
const CRATERS: ReadonlyArray<{ x: number; z: number; r: number; depth: number }> = [
  { x: -14, z: 33, r: 5, depth: 1.2 },
  { x: 20, z: 31, r: 4.5, depth: 1.0 },
  { x: -24, z: 36, r: 5.5, depth: 1.3 },
];

/** Rampas de acesso: sobem do portão sobre a vala (perfil esculpido no terreno). */
interface RampSpec {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  /** meia-largura do corredor */
  halfW: number;
  h0: number;
  h1: number;
}
const RAMPS: readonly RampSpec[] = [
  { x1: 0, z1: 27.5, x2: 10, z2: 35.5, halfW: 1.7, h0: 0, h1: 2.2 },
  { x1: -8, z1: 27.5, x2: -13, z2: 33, halfW: 1.6, h0: 0, h1: 1.5 },
];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  return smoothstep01((x - edge0) / (edge1 - edge0));
}

/** Distância até o retângulo murado (0 dentro). */
export function distToCompound(x: number, z: number): number {
  const dx = Math.max(RECT.minX - x, x - RECT.maxX, 0);
  const dz = Math.max(RECT.minZ - z, z - RECT.maxZ, 0);
  return Math.hypot(dx, dz);
}

// ---------- value noise determinístico ----------

function hash2(ix: number, iz: number): number {
  let h = (ix * 374761393 + iz * 668265263) ^ 2166136261;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz)!;
  const b = hash2(ix + 1, iz)!;
  const c = hash2(ix, iz + 1)!;
  const d = hash2(ix + 1, iz + 1)!;
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number): number {
  return 0.65 * vnoise(x / 13, z / 13) + 0.35 * vnoise(x / 4.7 + 37, z / 4.7 + 91);
}

// ---------- relevo ----------

function reliefBase(x: number, z: number): number {
  const d0 = distToCompound(x, z);
  if (d0 <= 0) return 0;
  const mask = smoothstep(0.5, 7, d0);
  if (mask <= 0) return 0;
  const rolling = (fbm(x, z) - 0.5) * 0.7;
  // vala em anel ao redor do perímetro (fundo a ~3.2 m do muro)
  const trench = -1.9 * Math.exp(-Math.pow((d0 - 3.2) / 2.6, 2));
  let h = mask * (rolling + trench);
  // morro
  const dm = Math.hypot(x - MOUND.x, z - MOUND.z);
  if (dm < MOUND.r) h += MOUND.peak * Math.pow(1 - dm / MOUND.r, 1.7);
  // crateras (bacia + borda erguida)
  for (const c of CRATERS) {
    const dc = Math.hypot(x - c.x, z - c.z) / c.r;
    if (dc < 1.6) {
      const bowl = 1 - smoothstep(0.1, 1, dc);
      const rim = Math.exp(-Math.pow((dc - 1.05) * 3.2, 2));
      h += mask * (-c.depth * bowl + c.depth * 0.3 * rim);
    }
  }
  return h;
}

/** Altura do terreno (y do solo) em (x, z). Determinística e barata. */
export function heightAt(x: number, z: number): number {
  if (distToCompound(x, z) <= 0) return 0;
  let h = reliefBase(x, z);
  for (const r of RAMPS) {
    const vx = r.x2 - r.x1;
    const vz = r.z2 - r.z1;
    const len2 = vx * vx + vz * vz;
    const t = clamp01(((x - r.x1) * vx + (z - r.z1) * vz) / len2);
    const px = r.x1 + vx * t;
    const pz = r.z1 + vz * t;
    const w = Math.hypot(x - px, z - pz);
    const skirt = r.halfW + 1.6;
    if (w >= skirt) continue;
    const lateral = 1 - smoothstep(r.halfW, skirt, w);
    // dissolve nas pontas: entra suave após o portão e funde com o morro
    const along = smoothstep(0, 0.15, t) * (1 - smoothstep(0.85, 1, t));
    const hr = r.h0 + (r.h1 - r.h0) * smoothstep01(t);
    const fall = lateral * along;
    h = h * (1 - fall) + hr * fall;
  }
  return h;
}

/** Inclinação local (~ tangente) via diferenças finitas. */
export function slopeAt(x: number, z: number, eps = 0.9): number {
  const sx = heightAt(x + eps, z) - heightAt(x - eps, z);
  const sz = heightAt(x, z + eps) - heightAt(x, z - eps);
  return Math.hypot(sx, sz) / (2 * eps);
}

export interface SplatWeights {
  asphalt: number;
  dirt: number;
  gravel: number;
  mud: number;
}

/**
 * Pesos de splat (soma 1): asfalto no complexo + acostamento, lama nas partes
 * fundas, cascalho nas encostas, terra no restante.
 */
export function terrainWeights(x: number, z: number): SplatWeights {
  const d0 = distToCompound(x, z);
  const h = heightAt(x, z);
  const apron = 1 - smoothstep(0.4, 2.4, d0);
  const asphalt = apron;
  const mud = (1 - smoothstep(-1.2, -0.3, h)) * (1 - apron);
  const slope = slopeAt(x, z);
  const gravel = smoothstep(0.25, 0.55, slope) * (1 - Math.max(asphalt, mud));
  const dirt = Math.max(0, 1 - asphalt - mud - gravel);
  const sum = asphalt + dirt + gravel + mud;
  return {
    asphalt: asphalt / sum,
    dirt: dirt / sum,
    gravel: gravel / sum,
    mud: mud / sum,
  };
}

/**
 * LOS bloqueada pelo relevo: amostra a linha entre os olhos e compara com o
 * solo. Barata (sem raycast); complementa `segmentBlockedByBoxes` da IA.
 */
export function terrainBlocksLos(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): boolean {
  const steps = 14;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const y = ay + (by - ay) * t;
    if (heightAt(x, z) > y + 0.05) return true;
  }
  return false;
}
