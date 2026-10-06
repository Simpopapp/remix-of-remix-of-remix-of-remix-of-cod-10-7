import * as THREE from "three";
import { MISSION_SUBTITLE, MISSION_TITLE } from "@/game/data/mission1";

/**
 * Cinematografia (Fase 6 — PRD §RF-06): intro crane-down, killcam na morte.
 * A câmera roteirizada roda DEPOIS do update do Player (engine.cameraMotion),
 * sobrescrevendo a câmera de jogo; letterbox/título/subtítulos são overlays
 * React na shell. TS puro, sem React.
 */

/** Duração da intro cinematográfica (s). */
export const INTRO_DURATION = 6;
/** Duração da killcam antes do overlay de morte (s). */
export const KILLCAM_DURATION = 2;

/** ease in-out suave (smoothstep). */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Intro: sobrevoo aéreo do complexo (crane) descendo até o jogador.
 * update() devolve false enquanto a cinemática estiver ativa.
 */
export class IntroCamera {
  private t = 0;

  private fromPos = new THREE.Vector3(0, 26, 44);
  private toPos = new THREE.Vector3();
  private fromLook = new THREE.Vector3(0, 2, 0);
  private toLook = new THREE.Vector3();

  /** Reinicia a intro ancorada no jogador. */
  begin(playerEye: THREE.Vector3): void {
    this.t = 0;
    // termina 1.2 m atrás e acima do olho do jogador, olhando à frente
    this.toPos.set(playerEye.x, playerEye.y + 1.2, playerEye.z + 4);
    this.toLook.copy(playerEye);
    this.toLook.z -= 6;
  }

  /** true quando a intro terminou. */
  get finished(): boolean {
    return this.t >= INTRO_DURATION;
  }

  /** Avança e aplica a pose na câmera. */
  update(dt: number, camera: THREE.PerspectiveCamera): boolean {
    this.t = Math.min(INTRO_DURATION, this.t + dt);
    const e = smooth(this.t / INTRO_DURATION);
    camera.position.lerpVectors(this.fromPos, this.toPos, e);
    camera.lookAt(
      this.fromLook.x + (this.toLook.x - this.fromLook.x) * e,
      this.fromLook.y + (this.toLook.y - this.fromLook.y) * e,
      this.fromLook.z + (this.toLook.z - this.fromLook.z) * e,
    );
    return this.finished;
  }

  /** Título de missão estilo COD para o overlay da intro. */
  get title(): string {
    return MISSION_TITLE;
  }

  get subtitle(): string {
    return MISSION_SUBTITLE;
  }
}

/**
 * Killcam simplificada (PRD: replay dos últimos 2 s visto da posição do tiro):
 * câmera na origem do tiro letal olhando para o corpo do jogador.
 */
export class Killcam {
  private t = 0;

  constructor(
    private from: THREE.Vector3,
    private target: THREE.Vector3,
  ) {}

  get finished(): boolean {
    return this.t >= KILLCAM_DURATION;
  }

  update(dt: number, camera: THREE.PerspectiveCamera): boolean {
    this.t = Math.min(KILLCAM_DURATION, this.t + dt);
    // aproxima lentamente da posição do atirador
    const e = smooth(this.t / KILLCAM_DURATION);
    const pos = this.from.clone().lerp(this.target, 0.12 * e);
    camera.position.copy(pos);
    camera.lookAt(this.target);
    return this.finished;
  }
}
