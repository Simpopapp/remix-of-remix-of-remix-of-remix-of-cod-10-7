import * as THREE from "three";
import type { Director } from "@/game/ai/Director";
import {
  ATTACK_WAVES,
  HACK_DURATION,
  HACK_INTERRUPT_RADIUS,
  HACK_POINT,
  HACK_RADIUS,
  OBJECTIVES,
  RADIO_LINES,
  REACH_RADIUS,
  WAVE_DELAY,
  type ObjectiveId,
} from "@/game/data/mission1";

/**
 * Máquina de objetivos da missão (Fase 6 — PRD §RF-04):
 * A avanço → B sentinelas → C hack (segurar E) → D waves de contra-ataque →
 * E extração. Checkpoint = último objetivo concluído (reinício retoma nele).
 * TS puro, sem React.
 */

export interface ObjectiveSnapshot {
  index: number;
  id: ObjectiveId;
  title: string;
  detail: string;
  /** Progresso do hack 0–1 (0 fora do hack). */
  hackProgress: number;
  /** Waves restantes no objetivo D (0 fora dele). */
  wavesRemaining: number;
  /** Waypoint do objetivo (coordenadas do mundo) ou null. */
  waypoint: { x: number; z: number } | null;
}

export interface ObjectivesCallbacks {
  /** Objetivo avançou para `index` (checkpoint). */
  onAdvance?: (index: number, id: ObjectiveId) => void;
  /** Linha de rádio para exibir como subtítulo. */
  onRadio?: (text: string) => void;
  /** Gatilho de slow-motion (último abate de um objetivo). */
  onSlowmo?: () => void;
  /** Missão concluída (objetivo E). */
  onComplete?: () => void;
}

function dist2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class Objectives {
  /** Índice do objetivo atual em OBJECTIVES. */
  private index: number;
  private hackProgress = 0;
  private wave = 0;
  private waveSpawned = false;
  private waveDelay = 0;
  private hackActive = false;
  private done = false;

  constructor(
    private director: Director,
    private callbacks: ObjectivesCallbacks,
    startIndex = 0,
  ) {
    this.index = Math.min(Math.max(0, startIndex), OBJECTIVES.length - 1);
  }

  update(dt: number, playerPos: THREE.Vector3, holdingE: boolean): void {
    if (this.done) return;
    switch (OBJECTIVES[this.index]?.id) {
      case "A": {
        const gate = OBJECTIVES[0]?.waypoint;
        if (gate && dist2D(playerPos, gate) < REACH_RADIUS) this.advance();
        break;
      }
      case "B":
        if (this.director.aliveCount() === 0) {
          this.callbacks.onSlowmo?.();
          this.advance();
        }
        break;
      case "C":
        this.updateHack(dt, playerPos, holdingE);
        break;
      case "D":
        this.updateWaves(dt);
        break;
      case "E": {
        const extract = OBJECTIVES[4]?.waypoint;
        if (extract && dist2D(playerPos, extract) < REACH_RADIUS) this.complete();
        break;
      }
      default:
        break;
    }
  }

  private updateHack(dt: number, playerPos: THREE.Vector3, holdingE: boolean): void {
    const inRange = dist2D(playerPos, HACK_POINT) < HACK_RADIUS;
    if (!inRange || !holdingE) {
      this.hackActive = false;
      this.hackProgress = Math.max(0, this.hackProgress - dt * 0.5);
      return;
    }
    // proximidade de inimigos reinicia o progresso (não falha a missão — PRD)
    const near = this.director
      .enemyPositions()
      .some((p) => dist2D(p, playerPos) < HACK_INTERRUPT_RADIUS);
    if (near) {
      this.hackActive = false;
      this.hackProgress = 0;
      return;
    }
    this.hackActive = true;
    this.hackProgress += dt / HACK_DURATION;
    if (this.hackProgress >= 1) {
      this.hackProgress = 0;
      this.advance();
    }
  }

  private updateWaves(dt: number): void {
    if (!this.waveSpawned) {
      this.spawnCurrentWave(dt);
      return;
    }
    if (this.director.aliveCount() > 0) return;
    // wave limpa
    this.callbacks.onSlowmo?.();
    this.wave += 1;
    this.waveSpawned = false;
    if (this.wave >= ATTACK_WAVES.length) {
      this.advance();
      return;
    }
    // pausa entre waves com dread (áudio silencia em musicLevel)
    this.waveDelay = WAVE_DELAY;
  }

  private spawnCurrentWave(dt: number): void {
    if (this.waveDelay > 0) {
      this.waveDelay -= dt;
      return;
    }
    const specs = ATTACK_WAVES[this.wave];
    if (specs) this.director.spawnWave(specs);
    this.waveSpawned = true;
  }

  private advance(): void {
    const next = this.index + 1;
    const spec = OBJECTIVES[next];
    if (!spec) return;
    this.index = next;
    this.hackActive = false;
    this.callbacks.onAdvance?.(next, spec.id);
    this.callbacks.onRadio?.(RADIO_LINES[spec.id]);
  }

  private complete(): void {
    this.done = true;
    this.callbacks.onComplete?.();
  }

  get snapshot(): ObjectiveSnapshot {
    const spec = OBJECTIVES[this.index] ?? OBJECTIVES[0]!;
    return {
      index: this.index,
      id: spec.id,
      title: spec.title,
      detail: spec.detail,
      hackProgress: this.hackActive ? Math.min(1, this.hackProgress) : 0,
      wavesRemaining: this.index === 3 ? ATTACK_WAVES.length - this.wave : 0,
      waypoint: spec.waypoint,
    };
  }
}
