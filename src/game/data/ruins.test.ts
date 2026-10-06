import { describe, expect, it } from "vitest";
import { KIT_MODULES } from "./kitManifest";
import { KIT_PLACEMENTS, SCORCH_DECALS, getRuinColliders } from "./ruins";
import { COMPOUND_PROPS, PROP_DIMS, getPropColliders } from "./props";

/** Todos os placements referenciam módulos que existem no manifesto. */
describe("KIT_PLACEMENTS", () => {
  it("não referencia módulos ausentes no GLB/manifesto", () => {
    const missing = KIT_PLACEMENTS.filter((p) => !KIT_MODULES[p.g]?.[p.m]);
    expect(missing.map((p) => `${p.g}/${p.m}`)).toEqual([]);
  });

  it("canteiros e AC units têm módulo no kit (renderizáveis)", () => {
    expect(KIT_MODULES["kit_stone"]?.["Prop_Planter_Single"]).toBeDefined();
    expect(KIT_MODULES["kit_trim"]?.["Prop_ACUnit"]).toBeDefined();
  });
});

describe("getRuinColliders", () => {
  const colliders = getRuinColliders();

  it("gera colliders AABB finitos e positivos", () => {
    expect(colliders.length).toBeGreaterThan(100);
    for (const c of colliders) {
      expect(Number.isFinite(c.minX)).toBe(true);
      expect(Number.isFinite(c.minY)).toBe(true);
      expect(Number.isFinite(c.minZ)).toBe(true);
      expect(c.maxX).toBeGreaterThan(c.minX);
      expect(c.maxY).toBeGreaterThan(c.minY);
      expect(c.maxZ).toBeGreaterThan(c.minZ);
    }
  });

  it("fecha o perímetro do pátio (x = ±34 e z = −34)", () => {
    const near = (v: number, target: number, eps = 1.5) => Math.abs(v - target) <= eps;
    const west = colliders.some((c) => near(c.minX, -34) && c.maxY > 4);
    const east = colliders.some((c) => near(c.maxX, 34) && c.maxY > 4);
    const south = colliders.some((c) => near(c.minZ, -34) && c.maxY > 4);
    expect(west).toBe(true);
    expect(east).toBe(true);
    expect(south).toBe(true);
  });

  it("prédio A tem fachada sólida ao sul de z ≈ 46 (vista pelo portão)", () => {
    const facade = colliders.filter((c) => {
      const cz = (c.minZ + c.maxZ) / 2;
      return Math.abs(cz - 46) < 1.2 && c.maxY > 2;
    });
    expect(facade.length).toBeGreaterThan(0);
  });

  it("colliders de lajes/telhado não bloqueiam (solid: false)", () => {
    // nenhuma laje interna (y múltiplo de 3, centro do pátio dos prédios)
    const slabs = colliders.filter(
      (c) => Math.abs((c.minY + c.maxY) / 2 - 3) < 0.2 && Math.abs((c.minX + c.maxX) / 2) < 4,
    );
    expect(slabs).toEqual([]);
  });
});

describe("getPropColliders", () => {
  const colliders = getPropColliders();

  it("um collider por placement", () => {
    expect(colliders.length).toBe(COMPOUND_PROPS.length);
  });

  it("empilhamento de caixotes soma alturas (topo do stack 3)", () => {
    const d = PROP_DIMS["crate"];
    const stack3 = COMPOUND_PROPS.find((p) => p.kind === "crate" && p.stack === 3);
    expect(stack3).toBeDefined();
    const c = colliders.find(
      (cc) =>
        stack3!.x >= cc.minX &&
        stack3!.x <= cc.maxX &&
        stack3!.z >= cc.minZ &&
        stack3!.z <= cc.maxZ,
    );
    expect(c).toBeDefined();
    expect(c!.maxY).toBeCloseTo(d.sy + d.yMin + 2 * d.sy, 5);
  });

  it("cobertura baixa: carro ≤ 1.45 m e barreira ≤ 0.85 m", () => {
    const car = PROP_DIMS["car"];
    const barrier = PROP_DIMS["barrier"];
    expect(car.sy + car.yMin).toBeLessThanOrEqual(1.45);
    expect(barrier.sy + barrier.yMin).toBeLessThanOrEqual(0.85);
  });
});

describe("SCORCH_DECALS", () => {
  it("decais verticais da fachada do prédio A encostam na parede (z ≈ 45.85)", () => {
    const facadeA = SCORCH_DECALS.filter((d) => d.vertical && d.z > 44 && d.z < 47);
    expect(facadeA.length).toBe(2);
    for (const d of facadeA) expect(d.z).toBeGreaterThanOrEqual(45.5);
  });
});
