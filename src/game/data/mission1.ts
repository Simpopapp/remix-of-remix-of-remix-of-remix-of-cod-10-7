/**
 * Dados da missão 1 (Fase 4) — spawns de inimigos e tuning da IA.
 * Módulo puro (sem THREE, sem React), consumido por src/game/ai/**.
 * Valores derivados do PRD §17.3 (tabela de tuning de inimigos).
 */

export interface EnemySpawnSpec {
  id: number;
  x: number;
  z: number;
  /** direção inicial (rad; 0 = olhando para +z) */
  facing: number;
  /** rota de patrulha (waypoints x, z) */
  route: Array<[number, number]>;
}

/**
 * 8 sentinelas do pátio (gate da Fase 4: fps ≥ 50 com 8 inimigos).
 * Spawns fora dos colliders dos contêineres/caixotes; rotas em área livre.
 */
export const MISSION1_ENEMIES: readonly EnemySpawnSpec[] = [
  {
    id: 0,
    x: -7.5,
    z: 7,
    facing: Math.PI,
    route: [
      [-7.5, 7],
      [-4, 4],
      [-8, 1],
    ],
  },
  {
    id: 1,
    x: 7,
    z: -2.5,
    facing: Math.PI * 0.5,
    route: [
      [7, -2.5],
      [3, -1],
      [8, -9],
    ],
  },
  {
    id: 2,
    x: 8,
    z: 15,
    facing: Math.PI,
    route: [
      [8, 15],
      [4, 13],
      [11, 14],
    ],
  },
  {
    id: 3,
    x: -14,
    z: -12,
    facing: 0.4,
    route: [
      [-14, -12],
      [-10, -14],
      [-18, -14],
    ],
  },
  {
    id: 4,
    x: 16,
    z: -12,
    facing: Math.PI * 0.75,
    route: [
      [16, -12],
      [16, -8],
      [12, -11],
    ],
  },
  {
    id: 5,
    x: 0,
    z: -13,
    facing: Math.PI,
    route: [
      [0, -13],
      [4, -12],
      [-4, -12],
    ],
  },
  {
    id: 6,
    x: -5,
    z: -6,
    facing: 2.2,
    route: [
      [-5, -6],
      [-2, -3],
      [-7, -4],
    ],
  },
  {
    id: 7,
    x: 14,
    z: 4,
    facing: Math.PI * 0.9,
    route: [
      [14, 4],
      [11, 2],
      [15, 8],
    ],
  },
];

export const AI_TUNING = {
  hp: 100,
  // detecção
  visionRange: 40,
  visionHalfAngleDeg: 35, // cone total de 70°
  detectRate10m: 0.6, // medidor 0→1 preenche em ~1.7 s a 10 m
  crouchDetectMul: 0.6,
  sprintDetectMul: 1.4,
  detectionDecay: 0.5,
  losInterval: 0.22, // raycast de LOS ~4.5 Hz por inimigo
  alertRadius: 25,
  reactionMin: 0.35,
  reactionMax: 0.6,
  combatMemory: 8, // s sem visível antes de voltar a patrulhar
  // movimento
  patrolSpeed: 1.6,
  combatSpeed: 3.4,
  patrolWaitMin: 1,
  patrolWaitMax: 2.2,
  // combate
  burstMin: 3,
  burstMax: 6,
  burstRps: 9, // tiros por segundo dentro da rajada
  burstSpreadGrowth: 1.12, // +12% por tiro da rajada
  burstPauseMin: 0.8,
  burstPauseMax: 1.6,
  sigmaAngle: 0.028, // desvio angular base (≈55% de acerto a 15 m)
  movingTargetMul: 1.6, // alvo se deslocando (> 2 m/s)
  crouchTargetMul: 0.85,
  damageClose: 14,
  damageFar: 8,
  damageFalloffDist: 40,
  // cobertura
  coverChance: 0.55,
  coverSampleCount: 12,
  coverSampleRadiusMin: 2.5,
  coverSampleRadiusMax: 5.5,
  coverPointHeight: 0.9,
  coverHoldMin: 0.7,
  coverHoldMax: 1.4,
  // corpo
  enemyRadius: 0.4,
  enemyHeight: 1.8,
  playerCapsuleRadius: 0.45,
} as const;

// =====================================================================
// Fase 6 — Missão completa: objetivos A–E, waves de contra-ataque e rádio
// (PRD §RF-04). Módulo puro: consumido por src/game/mission/**.
// =====================================================================

export type ObjectiveId = "A" | "B" | "C" | "D" | "E";

export interface ObjectiveSpec {
  id: ObjectiveId;
  /** Título curto no HUD. */
  title: string;
  /** Linha de detalhe (ex.: contador). */
  detail: string;
  /** Waypoint no mundo (marcador HUD); null = sem marcador. */
  waypoint: { x: number; z: number } | null;
}

/** Portão norte do muro externo (objetivo A). */
export const GATE_POINT = { x: 0, z: 24 };
/** Terminal de hack dentro do armazém (objetivo C). */
export const HACK_POINT = { x: 0, z: -26.5 };
/** Duração do hack segurando E (s). */
export const HACK_DURATION = 4;
/** Raio de interação do terminal (m). */
export const HACK_RADIUS = 5;
/** Inimigos num raio maior que este valor reiniciam o progresso do hack. */
export const HACK_INTERRUPT_RADIUS = 8;
/** Raio de conclusão de um objetivo de posição (m). */
export const REACH_RADIUS = 3.5;

export const OBJECTIVES: readonly ObjectiveSpec[] = [
  {
    id: "A",
    title: "Avançar até o muro externo",
    detail: "Siga o waypoint até o portão norte",
    waypoint: GATE_POINT,
  },
  {
    id: "B",
    title: "Eliminar os sentinelas do pátio",
    detail: "8 hostis no pátio central",
    waypoint: null,
  },
  {
    id: "C",
    title: "Hackear o terminal do armazém",
    detail: "Segure E no terminal — 4 s",
    waypoint: HACK_POINT,
  },
  {
    id: "D",
    title: "Sobreviver ao contra-ataque",
    detail: "3 ondas até a extração ficar pronta",
    waypoint: null,
  },
  {
    id: "E",
    title: "Alcançar a extração",
    detail: "Ponto de extração no interior do armazém",
    waypoint: { x: 0, z: -27 },
  },
];

/** Waves de contra-ataque (objetivo D): spawn no pátio sul, avançando ao armazém. */
export const ATTACK_WAVES: readonly EnemySpawnSpec[][] = [
  [
    {
      id: 0,
      x: -8,
      z: -16,
      facing: 0,
      route: [
        [-8, -16],
        [-4, -10],
      ],
    },
    {
      id: 1,
      x: 8,
      z: -16,
      facing: 0,
      route: [
        [8, -16],
        [4, -10],
      ],
    },
    {
      id: 2,
      x: 0,
      z: -18,
      facing: 0,
      route: [
        [0, -18],
        [0, -12],
      ],
    },
  ],
  [
    {
      id: 0,
      x: -14,
      z: -10,
      facing: 0,
      route: [
        [-14, -10],
        [-10, -4],
      ],
    },
    {
      id: 1,
      x: 14,
      z: -10,
      facing: 0,
      route: [
        [14, -10],
        [10, -4],
      ],
    },
    {
      id: 2,
      x: -4,
      z: -14,
      facing: 0,
      route: [
        [-4, -14],
        [-2, -8],
      ],
    },
    {
      id: 3,
      x: 4,
      z: -14,
      facing: 0,
      route: [
        [4, -14],
        [2, -8],
      ],
    },
  ],
  [
    {
      id: 0,
      x: -16,
      z: -6,
      facing: 0,
      route: [
        [-16, -6],
        [-12, 0],
      ],
    },
    {
      id: 1,
      x: 16,
      z: -6,
      facing: 0,
      route: [
        [16, -6],
        [12, 0],
      ],
    },
    {
      id: 2,
      x: 0,
      z: -20,
      facing: 0,
      route: [
        [0, -20],
        [0, -14],
      ],
    },
    {
      id: 3,
      x: -8,
      z: -12,
      facing: 0,
      route: [
        [-8, -12],
        [-6, -6],
      ],
    },
    {
      id: 4,
      x: 8,
      z: -12,
      facing: 0,
      route: [
        [8, -12],
        [6, -6],
      ],
    },
  ],
];

/** Pausa entre waves (s). */
export const WAVE_DELAY = 2.5;

/** Rádio do comandante (subtítulos typewriter) por transição de objetivo. */
export const RADIO_LINES: Record<ObjectiveId, string> = {
  A: "Base — Equipa Alpha, avancem até o muro externo. Fiquem nas sombras.",
  B: "Base — Sentinelas no pátio. Eliminem todos, silêncio não será permanente.",
  C: "Base — Terminal no armazém. Hackeem e sir fm. Segurem a posição.",
  D: "Alpha — O hack foi detectado! Contra-ataque a caminho, aguentem!",
  E: "Base — Extração pronta no armazém. Movem-se!",
};

/** Título cinematográfico da intro (estilo COD). */
export const MISSION_TITLE = "OPERAÇÃO: BLACKOUT";
export const MISSION_SUBTITLE = "02:47 — Zona Industrial Norte";

/** Dano da bala inimiga ao jogador por distância (PRD: 8–14). */
export function enemyDamageAt(distance: number): number {
  const t = Math.min(1, Math.max(0, distance) / AI_TUNING.damageFalloffDist);
  return Math.round(AI_TUNING.damageClose - (AI_TUNING.damageClose - AI_TUNING.damageFar) * t);
}
