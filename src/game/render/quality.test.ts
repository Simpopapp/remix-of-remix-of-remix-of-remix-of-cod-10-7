import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUALITY,
  normalizeQuality,
  QUALITY_ORDER,
  QUALITY_PRESETS,
  QUALITY_STORAGE_KEY,
} from "./quality";

describe("presets de qualidade (Fase V1 — RM-01)", () => {
  it("normaliza valores do storage com fallback seguro", () => {
    expect(normalizeQuality("baixo")).toBe("baixo");
    expect(normalizeQuality("ultra")).toBe("ultra");
    expect(normalizeQuality(null)).toBe(DEFAULT_QUALITY);
    expect(normalizeQuality(undefined)).toBe(DEFAULT_QUALITY);
    expect(normalizeQuality("modo_lendario")).toBe(DEFAULT_QUALITY);
    expect(normalizeQuality("")).toBe(DEFAULT_QUALITY);
  });

  it("baixo desliga SSAO e bloom; médio e acima ligam", () => {
    expect(QUALITY_PRESETS["baixo"].ssao).toBe(false);
    expect(QUALITY_PRESETS["baixo"].bloom).toBe(false);
    for (const preset of ["medio", "alto", "ultra"] as const) {
      expect(QUALITY_PRESETS[preset].ssao).toBe(true);
      expect(QUALITY_PRESETS[preset].bloom).toBe(true);
    }
  });

  it("distância de desenho nunca diminui com a qualidade", () => {
    const [, medio, alto, ultra] = QUALITY_ORDER;
    expect(QUALITY_PRESETS[medio!].drawDistance).toBeLessThanOrEqual(
      QUALITY_PRESETS[alto!].drawDistance,
    );
    expect(QUALITY_PRESETS[alto!].drawDistance).toBeLessThanOrEqual(
      QUALITY_PRESETS[ultra!].drawDistance,
    );
  });

  it("tamanho do shadow map não diminui do médio para o ultra", () => {
    expect(QUALITY_PRESETS["ultra"].shadowMapSize).toBeGreaterThanOrEqual(
      QUALITY_PRESETS["medio"].shadowMapSize,
    );
    expect(QUALITY_PRESETS["alto"].shadowMapSize).toBeGreaterThanOrEqual(
      QUALITY_PRESETS["medio"].shadowMapSize,
    );
  });

  it("teto de resolução do baixo é reduzido (performance em integradas)", () => {
    expect(QUALITY_PRESETS["baixo"].maxResolutionScale).toBeLessThan(1);
    expect(QUALITY_PRESETS["alto"].maxResolutionScale).toBe(1);
  });

  it("chave de storage é estável", () => {
    expect(QUALITY_STORAGE_KEY).toBe("ob:quality");
  });
});
