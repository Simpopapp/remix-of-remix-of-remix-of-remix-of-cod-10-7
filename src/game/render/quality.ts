/**
 * Presets de qualidade gráfica (PRD v2 RM-01) — TS puro, sem three.js,
 * para ser testável por vitest e reutilizável entre Engine e UI.
 */

export type QualityPreset = "baixo" | "medio" | "alto" | "ultra";

export interface QualitySettings {
  /** Rótulo exibido no menu de pausa. */
  label: string;
  /** Sombras dinâmicas ligadas (mapa: shadowMapSize). */
  shadowMapSize: number;
  /** Oclusão ambiente (GTAO) — caro; só a partir de médio. */
  ssao: boolean;
  /** Bloom cinematográfico. */
  bloom: boolean;
  /** Teto da escala dinâmica de resolução (1 = nativo). */
  maxResolutionScale: number;
  /** Distância de desenho (camera.far). */
  drawDistance: number;
}

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  baixo: {
    label: "Baixo",
    shadowMapSize: 1024,
    ssao: false,
    bloom: false,
    maxResolutionScale: 0.75,
    drawDistance: 260,
  },
  medio: {
    label: "Médio",
    shadowMapSize: 1024,
    ssao: true,
    bloom: true,
    maxResolutionScale: 1,
    drawDistance: 380,
  },
  alto: {
    label: "Alto",
    shadowMapSize: 2048,
    ssao: true,
    bloom: true,
    maxResolutionScale: 1,
    drawDistance: 500,
  },
  ultra: {
    label: "Ultra",
    shadowMapSize: 4096,
    ssao: true,
    bloom: true,
    maxResolutionScale: 1,
    drawDistance: 620,
  },
};

export const DEFAULT_QUALITY: QualityPreset = "alto";
export const QUALITY_STORAGE_KEY = "ob:quality";

export const QUALITY_ORDER: QualityPreset[] = ["baixo", "medio", "alto", "ultra"];

/** Converte o valor bruto do storage num preset válido (fallback: default). */
export function normalizeQuality(raw: string | null | undefined): QualityPreset {
  return raw !== null && raw !== undefined && raw in QUALITY_PRESETS
    ? (raw as QualityPreset)
    : DEFAULT_QUALITY;
}
