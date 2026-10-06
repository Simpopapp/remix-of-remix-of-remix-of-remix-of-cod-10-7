import type { BoxCollider } from "@/game/world/ValidationScene";
import { AI_TUNING } from "@/game/data/mission1";

/**
 * Matemática pura da IA (Fase 4) — sem THREE, coberta por testes unitários
 * (mesma política da física do player em Player.test.ts).
 */

/**
 * true se o segmento A→B intersecta algum AABB da lista (método slab).
 * Usado para LOS barato (linha de visão bloqueada por cobertura) sem raycast.
 */
export function segmentBlockedByBoxes(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  boxes: BoxCollider[],
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  for (const c of boxes) {
    let tmin = 0;
    let tmax = 1;
    let hit = true;

    if (Math.abs(dx) < 1e-9) {
      if (ax < c.minX || ax > c.maxX) hit = false;
    } else {
      let t1 = (c.minX - ax) / dx;
      let t2 = (c.maxX - ax) / dx;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) hit = false;
    }

    if (hit) {
      if (Math.abs(dy) < 1e-9) {
        if (ay < c.minY || ay > c.maxY) hit = false;
      } else {
        let t1 = (c.minY - ay) / dy;
        let t2 = (c.maxY - ay) / dy;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) hit = false;
      }
    }

    if (hit) {
      if (Math.abs(dz) < 1e-9) {
        if (az < c.minZ || az > c.maxZ) hit = false;
      } else {
        let t1 = (c.minZ - az) / dz;
        let t2 = (c.maxZ - az) / dz;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) hit = false;
      }
    }

    if (hit) return true;
  }
  return false;
}

/** Ponto está livre (com folga `clearance`) e dentro dos limites do mapa. */
export function pointIsWalkable(
  x: number,
  z: number,
  clearance: number,
  boxes: BoxCollider[],
  mapLimit: number,
): boolean {
  if (Math.abs(x) > mapLimit || Math.abs(z) > mapLimit) return false;
  for (const c of boxes) {
    if (
      x > c.minX - clearance &&
      x < c.maxX + clearance &&
      z > c.minZ - clearance &&
      z < c.maxZ + clearance &&
      c.minY < 1.6 // só bloqueia se a caixa existe na altura do corpo
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Taxa de detecção (medidor/segundo): 0.6/s a 10 m, escalando por
 * proximidade (PRD §17.3); agachado ×0.6, sprint ×1.4.
 */
export function detectionRate(dist: number, crouching: boolean, sprinting: boolean): number {
  const proximity = Math.min(3, 10 / Math.max(1.2, dist));
  const posture =
    (crouching ? AI_TUNING.crouchDetectMul : 1) * (sprinting ? AI_TUNING.sprintDetectMul : 1);
  return AI_TUNING.detectRate10m * proximity * posture;
}

/** Amostra ≈ normal(0,1) (soma de 4 uniformes, normalizada). */
export function gaussian(): number {
  return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.732;
}
