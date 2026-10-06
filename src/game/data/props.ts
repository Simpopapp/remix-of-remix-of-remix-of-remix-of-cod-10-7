/**
 * Props PBR do pátio (Fase V3, PRD RM-04) — substituições por dados.
 * Contêineres/caixotes/barris/tambores procedurais saem; entram modelos
 * glTF reais (Poly Haven CC0) posicionados por dados. D-03: sem modelo
 * realista → corte (barris saem; contêineres viram cobertura baixa de
 * carros caídos/canteiros/pilhas de caixote militar).
 *
 * Colliders derivados dos AABB nominais de cada modelo — nenhum collider
 * hardcoded fora daqui (contrato getLevelColliders/getValidationColliders).
 */

export interface BoxCollider {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export type PropKind = "car" | "barrier" | "crate" | "planter";

export interface PropPlacement {
  kind: PropKind;
  x: number;
  z: number;
  /** rotação em Y (radianos) */
  ry: number;
  /** altura da base (padrão 0; pátio é plano em y=0) */
  y?: number;
  /** inclinação [rx, rz] para destroços assentados tortos */
  tilt?: [number, number];
  /** caixote: quantidade na pilha (1–3) */
  stack?: number;
}

/** Dimensões nominais dos GLB (bounding box mensurada dos modelos). */
export const PROP_DIMS: Record<PropKind, { sx: number; sy: number; sz: number; yMin: number }> = {
  // covered_car: 1.78 × 1.71 × 4.38, origem y −0.30
  car: { sx: 1.78, sy: 1.71, sz: 4.38, yMin: -0.3 },
  // concrete_road_barrier: 1.54 × 0.83 × 0.63
  barrier: { sx: 1.54, sy: 0.83, sz: 0.63, yMin: -0.01 },
  // old_military_crate: 0.93 × 0.36 × 0.69, origem y −0.10
  crate: { sx: 0.93, sy: 0.36, sz: 0.69, yMin: -0.1 },
  // Prop_Planter_Single (kit_stone): 2.00 × 0.60 × 2.00
  planter: { sx: 2.0, sy: 0.6, sz: 2.0, yMin: 0 },
};

/**
 * Substituições no pátio (fontes: CONTAINER_SPECS/BARREL_SPECS de
 * ValidationScene e CRATE_SPECS/BARRIER_SPECS de level1):
 * - contêineres (7) → 2 carros caídos + 2 canteiros + 2 pilhas-muro de caixotes
 *   + o contêiner empilhado sai (corte);
 * - caixotes de madeira (11) → pilhas de caixote militar (2–3 níveis);
 * - tambores (8) → cortados (D-03);
 * - barreiras Jersey (7) → barreira de concreto PBR (menor: 1.54 × 0.83).
 */
export const COMPOUND_PROPS: readonly PropPlacement[] = [
  // contêiner (−10, 4, rot 0.15) → carro caído alinhado ao eixo x
  { kind: "car", x: -10, z: 4, ry: 0.15 + Math.PI / 2 },
  // contêiner (−10.5, 4.6, rot 0.12, empilhado) → cortado
  // contêiner (9, −6, rot −0.3) → pilha-muro de caixotes
  { kind: "crate", x: 8.3, z: -6.2, ry: -0.3, stack: 3 },
  { kind: "crate", x: 9.3, z: -5.8, ry: -0.3, stack: 2 },
  { kind: "crate", x: 8.6, z: -5.1, ry: -0.3 + 0.25, stack: 2 },
  // contêiner (8, 12, rot 0.05) → canteiros (cobertura baixa)
  { kind: "planter", x: 7, z: 12, ry: 0.05 },
  { kind: "planter", x: 9.05, z: 11.9, ry: 0.05 + 0.1 },
  // contêiner (−16, −10, rot 1.1) → pilha-muro de caixotes
  { kind: "crate", x: -16.4, z: -10.3, ry: 1.1, stack: 3 },
  { kind: "crate", x: -15.6, z: -9.7, ry: 1.1, stack: 2 },
  // contêiner (14, −14, rot 0.6) → canteiro duplo
  { kind: "planter", x: 14, z: -14, ry: 0.6 },
  { kind: "planter", x: 15.3, z: -13.2, ry: 0.6 + 0.15 },
  // contêiner (0, −16, rot 0) → carro caído
  { kind: "car", x: 0.2, z: -16, ry: Math.PI / 2 + 0.08 },
  // caixotes de madeira (CRATE_SPECS) → pilhas de caixote militar
  { kind: "crate", x: 5, z: 2, ry: 0.2, stack: 2 },
  { kind: "crate", x: 5.4, z: 3.1, ry: -0.15, stack: 2 },
  { kind: "crate", x: -6, z: -8, ry: 0.4, stack: 2 },
  { kind: "crate", x: -6.2, z: -6.8, ry: -0.3, stack: 3 },
  { kind: "crate", x: 12, z: 6, ry: 0.1, stack: 2 },
  { kind: "crate", x: 12.1, z: 7.2, ry: 0.5, stack: 3 },
  { kind: "crate", x: -13, z: 8, ry: -0.2, stack: 2 },
  { kind: "crate", x: 2, z: -10, ry: 0.3, stack: 2 },
  { kind: "crate", x: 3.1, z: -9.8, ry: -0.1, stack: 3 },
  // barris (BARREL_SPECS) → cortados (D-03)
  // barreiras Jersey (BARRIER_SPECS, level1) → barreira de concreto PBR
  { kind: "barrier", x: -4, z: 8, ry: 0 },
  { kind: "barrier", x: 4.5, z: 5, ry: Math.PI / 2 },
  { kind: "barrier", x: 10, z: -3, ry: 0 },
  { kind: "barrier", x: -11, z: -2, ry: Math.PI / 2 },
  { kind: "barrier", x: 0, z: -6, ry: 0 },
  { kind: "barrier", x: -15, z: 6, ry: 0 },
  { kind: "barrier", x: 14, z: 8, ry: Math.PI / 2 },
];

/**
 * Colliders AABB conservadores por placement. Colliders antigos de
 * contêineres/caixotes saem: cobertura baixa (carro 1.4 m, caixote ≤ 1.1 m,
 * canteiro 0.6 m, barreira 0.83 m) abre linhas de tiro — IA reage via dados.
 */
export function getPropColliders(): BoxCollider[] {
  const colliders: BoxCollider[] = [];
  for (const p of COMPOUND_PROPS) {
    const d = PROP_DIMS[p.kind];
    const c = Math.abs(Math.cos(p.ry));
    const s = Math.abs(Math.sin(p.ry));
    // base ancorada no chão (yMin do GLB compensado no load): topo do modelo
    const top = d.sy + d.yMin + Math.max(0, (p.stack ?? 1) - 1) * d.sy;
    const ex = c * (d.sx / 2) + s * (d.sz / 2);
    const ez = s * (d.sx / 2) + c * (d.sz / 2);
    colliders.push({
      minX: p.x - ex,
      maxX: p.x + ex,
      minY: 0,
      maxY: top,
      minZ: p.z - ez,
      maxZ: p.z + ez,
    });
  }
  return colliders;
}
