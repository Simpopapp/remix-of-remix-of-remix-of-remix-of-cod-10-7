import { describe, expect, it } from "vitest";
import {
  distToCompound,
  heightAt,
  slopeAt,
  terrainBlocksLos,
  terrainWeights,
} from "./terrainField";

describe("terrainField — heightfield", () => {
  it("complexo murado permanece plano em y = 0", () => {
    expect(heightAt(0, 0)).toBe(0);
    expect(heightAt(20, 20)).toBe(0); // r ~28 m, dentro do retângulo
    expect(heightAt(-30, -30)).toBe(0);
    expect(heightAt(0, 25.9)).toBe(0);
    expect(distToCompound(10, 10)).toBe(0);
  });

  it("morro ao norte sobe até o alcance do jogador", () => {
    expect(heightAt(12, 44)).toBeGreaterThan(2.5); // pico ~3.2 m
    expect(heightAt(12, 38)).toBeGreaterThan(0.8); // acessível (MAP_LIMIT 38)
    expect(heightAt(-12, 44)).toBeLessThan(0.4); // longe do pico
  });

  it("vala em anel rebaixa o solo ao redor do perímetro", () => {
    expect(heightAt(-20, 29.3)).toBeLessThan(-0.5); // fundo da vala, fora das rampas
    expect(heightAt(0, 27.4)).toBeGreaterThan(-0.4); // acostamento junto ao muro
  });

  it("crateras de morteiro têm bacia funda e borda erguida", () => {
    const bowl = heightAt(-14, 33);
    expect(bowl).toBeLessThan(-0.7); // fundo da cratera
    const rim = heightAt(-9, 33); // borda externa ~5 m do centro
    expect(rim).toBeGreaterThan(bowl + 0.9);
  });

  it("rampa de acesso sobe do portão sobre a vala", () => {
    // corredor da rampa A: (0, 27.5) → (10, 35.5)
    const samples: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      samples.push(heightAt(t * 10, 27.5 + t * 8));
    }
    expect(samples[8]!).toBeGreaterThan(samples[2]! + 0.8); // ganho de altura
    // centro do corredor fica acima do terreno fora da rampa (vala)
    const midX = 5;
    const midZ = 31.5;
    const onRamp = heightAt(midX, midZ);
    const offRamp = heightAt(midX + 4, midZ);
    expect(onRamp).toBeGreaterThan(offRamp + 0.4);
  });

  it("relevo é determinístico (mesma chamada, mesmo valor)", () => {
    expect(heightAt(7, 33)).toBe(heightAt(7, 33));
    expect(slopeAt(7, 33)).toBe(slopeAt(7, 33));
  });
});

describe("terrainField — splat e LOS", () => {
  it("splat: asfalto no complexo, terra/cascalho/lama fora", () => {
    const yard = terrainWeights(0, 0);
    expect(yard.asphalt).toBeCloseTo(1, 3);
    expect(yard.dirt + yard.gravel + yard.mud).toBeCloseTo(0, 3);

    const field = terrainWeights(-20, 34);
    const sum = field.asphalt + field.dirt + field.gravel + field.mud;
    expect(sum).toBeCloseTo(1, 3);
    expect(field.asphalt).toBeLessThan(0.5);

    const crater = terrainWeights(-14, 33);
    expect(crater.mud).toBeGreaterThan(0.5); // fundo fundo = lama

    const wallSide = terrainWeights(14, 38); // encosta do morro
    expect(wallSide.gravel + wallSide.dirt).toBeGreaterThan(0.5);
  });

  it("LOS bloqueada pelo morro, livre dentro do complexo", () => {
    // atravessa a encosta do morro a 1.6 m do solo → bloqueada
    expect(terrainBlocksLos(12, 1.6, 30, 12, 1.6, 44)).toBe(true);
    // dentro do complexo plano → livre
    expect(terrainBlocksLos(0, 1.6, 10, 0, 1.6, 20)).toBe(false);
  });
});
