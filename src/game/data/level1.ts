/**
 * Dados do nível da missão 1 (Fase 5) — layout completo por dados.
 * Módulo puro (sem THREE, sem React), consumido por src/game/world/Level.ts.
 * Coordenadas compatíveis com os spawns/rotas de src/game/data/mission1.ts.
 *
 * Fase V3: os specs visuais substituídos pelo kit PBR (muros perimetrais,
 * armazém, telhado, barreiras, tambores) saíram daqui — moram agora em
 * src/game/data/ruins.ts (painéis do kit) e src/game/data/props.ts (GLB).
 */

/** Pilares internos do armazém (x, z, raio, altura). */
export const WAREHOUSE_PILLARS: ReadonlyArray<[number, number, number, number]> = [
  [-6, -24, 0.28, 8],
  [6, -24, 0.28, 8],
  [-6, -30, 0.28, 8],
  [6, -30, 0.28, 8],
];

/** Luzes práticas quentes (x, y, z, intensidade) — armazém e fachada. */
export const PRACTICAL_LIGHTS: ReadonlyArray<[number, number, number, number]> = [
  [-6, 6.5, -27, 90],
  [6, 6.5, -27, 90],
  [0, 4.6, -20.4, 30],
];

/** Ponto de extração (objetivo final, dentro do armazém). */
export const EXTRACTION = { x: 0, z: -27 };

/** Spawn do jogador. */
export const PLAYER_SPAWN = { x: 0, z: 20 };
