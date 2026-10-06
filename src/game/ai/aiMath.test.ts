import { describe, expect, it } from "vitest";
import { segmentBlockedByBoxes, detectionRate, pointIsWalkable } from "./aiMath";
import { enemyDamageAt } from "@/game/data/mission1";
import type { BoxCollider } from "@/game/world/ValidationScene";

const BOX: BoxCollider = { minX: 2, maxX: 3, minY: 0, maxY: 2, minZ: -1, maxZ: 1 };

describe("aiMath — LOS por segmento/AABB", () => {
  it("detecta bloqueio no meio do caminho", () => {
    expect(segmentBlockedByBoxes(0, 1, 0, 5, 1, 0, [BOX])).toBe(true);
  });

  it("passagem livre contorna a caixa", () => {
    expect(segmentBlockedByBoxes(0, 1, 0, 5, 1, 5, [BOX])).toBe(false);
  });

  it("segmento acima da caixa não é bloqueado", () => {
    expect(segmentBlockedByBoxes(0, 3.5, 0, 5, 3.5, 0, [BOX])).toBe(false);
  });
});

describe("aiMath — detecção (PRD §17.3)", () => {
  it("0.6/s a 10 m", () => {
    expect(detectionRate(10, false, false)).toBeCloseTo(0.6, 5);
  });

  it("agachado ×0.6", () => {
    expect(detectionRate(10, true, false)).toBeCloseTo(0.36, 5);
  });

  it("sprint ×1.4", () => {
    expect(detectionRate(10, false, true)).toBeCloseTo(0.84, 5);
  });

  it("escala por proximidade (5 m = 2× a taxa de 10 m)", () => {
    expect(detectionRate(5, false, false)).toBeCloseTo(1.2, 5);
  });
});

describe("aiMath — posicionamento", () => {
  it("ponto dentro de collider não é caminhável", () => {
    expect(pointIsWalkable(2.5, 0, 0.5, [BOX], 36)).toBe(false);
  });

  it("ponto livre é caminhável", () => {
    expect(pointIsWalkable(10, 10, 0.5, [BOX], 36)).toBe(true);
  });

  it("limites do mapa valem para a IA", () => {
    expect(pointIsWalkable(40, 0, 0.5, [BOX], 36)).toBe(false);
  });
});

describe("dano inimigo por distância (PRD §17.3)", () => {
  it("14 de perto, 8 a partir de 40 m", () => {
    expect(enemyDamageAt(1)).toBe(14);
    expect(enemyDamageAt(40)).toBe(8);
    expect(enemyDamageAt(80)).toBe(8);
    expect(enemyDamageAt(20)).toBe(11);
  });
});
