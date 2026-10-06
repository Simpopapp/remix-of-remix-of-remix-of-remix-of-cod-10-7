import * as THREE from "three";
import type { BoxCollider } from "@/game/world/ValidationScene";
import { heightAt } from "@/game/world/terrainField";

/** Contrato mínimo de input consumido pelo Player (Input implementa estruturalmente). */
export interface PlayerInput {
  readonly locked: boolean;
  readonly forward: boolean;
  readonly back: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly sprint: boolean;
  readonly crouch: boolean;
  consumeMouse(): { dx: number; dy: number };
  consumeJump(): boolean;
}

/**
 * Player FPS COD-like: câmera, movimento com spring/atrito, sprint com FOV kick,
 * agachar, pulo + gravidade, colisão AABB e head bob. Isolado de React.
 */

const WALK_SPEED = 4.5;
const SPRINT_SPEED = 7;
const CROUCH_SPEED = 2.4;
const ACCEL = 42;
const AIR_ACCEL = 12;
const GRAVITY = 20;
const JUMP_VELOCITY = 7.8; // apex ~1.5 m: permite montar caixotes (1.2 m)

const STAND_HEIGHT = 1.7;
const CROUCH_HEIGHT = 1.05;
const RADIUS = 0.35;
const EYE_OFFSET = -0.12;

const MAP_LIMIT = 38;
export const BASE_FOV = 75;
const SPRINT_FOV = 83;
const MAX_PITCH = Math.PI / 2 - 0.03;
const MOUSE_BASE_SENS = 0.0022;
const SENSITIVITY_KEY = "ob:sensitivity";

const EPS = 0.001;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Move `current` em direção a `target` no máximo `amount` por chamada. */
function approach(current: number, target: number, amount: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= amount) return target;
  return current + Math.sign(diff) * amount;
}

export class Player {
  readonly position = new THREE.Vector3(0, 0, 20);

  /** Estado legível por HUD/IA/testes: velocidade mundial e contato com o chão. */
  velocity = new THREE.Vector3();
  grounded = true;
  private yaw = 0; // 0 = olhando para -z
  private pitch = 0;
  private crouching = false;
  /** Altura atual da câmera/corpo (pública para HUD e testes). */
  height = STAND_HEIGHT;
  private sprinting = false;

  // ---------- vitalidade (Fase 4): regeneração estilo COD ----------
  private hp = 100;
  private sinceDamage = 999;

  /** Delta bruto do mouse do último frame (para sway do viewmodel). */
  lastLook = { x: 0, y: 0 };
  /** Override de FOV (ADS) — null devolve o controle ao Player. */
  externalFovOverride: number | null = null;

  private bobPhase = 0;
  private bobX = 0;
  private bobY = 0;
  private recoilP = 0;
  private recoilY = 0;
  private recoilPv = 0;
  private recoilYv = 0;
  private landDip = 0;
  private landDipVel = 0;
  private sensitivity: number;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private colliders: BoxCollider[],
  ) {
    this.sensitivity = readStoredSensitivity();
    this.camera.rotation.order = "YXZ";
    this.syncCamera(0);
  }

  setSensitivity(value: number): void {
    this.sensitivity = clamp(value, 0.1, 5);
  }

  get isSprinting(): boolean {
    return this.sprinting;
  }

  get isCrouching(): boolean {
    return this.crouching;
  }

  /** Vida atual (0–100) — leitura para HUD/testes. */
  get health(): number {
    return this.hp;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /**
   * Aplica dano; true se o jogador morreu. Regeneração estilo COD:
   * após 4 s sem dano, recupera 35 HP/s (ver updateCameraFeel).
   */
  takeDamage(amount: number): boolean {
    if (this.hp <= 0) return true;
    this.hp = Math.max(0, this.hp - amount);
    this.sinceDamage = 0;
    return this.hp <= 0;
  }

  /** Mira atual (radianos) — leitura para HUD/testes. */
  get aim(): { yaw: number; pitch: number } {
    return { yaw: this.yaw, pitch: this.pitch };
  }

  /** Aponta a mira para um ponto do mundo (uso em testes/depuração). */
  lookAtPoint(point: { x: number; y: number; z: number }): void {
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    const dy = point.y - (this.position.y + this.height + EYE_OFFSET);
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -MAX_PITCH, MAX_PITCH);
  }

  /** Impulso de recuo; a mola devolve a mira ao ponto original (estilo COD). */
  kickRecoil(pitch: number, yaw: number): void {
    this.recoilPv += pitch * 18;
    this.recoilYv += yaw * 18;
  }

  update(dt: number, input: PlayerInput | null): void {
    if (!this.alive) {
      // morto: congela o controle, mantém a câmera e não regenera
      this.sinceDamage += dt;
      this.syncCamera(dt);
      return;
    }
    this.updateLook(dt, input);
    this.updateMove(dt, input);
    this.updateCollisionAndGravity(dt, input);
    this.updateCameraFeel(dt, input);
    this.syncCamera(dt);
  }

  // ---------- mouse look ----------
  private updateLook(dt: number, input: PlayerInput | null): void {
    if (!input) return;
    const { dx, dy } = input.consumeMouse();
    if (!input.locked) return;
    this.yaw -= dx * MOUSE_BASE_SENS * this.sensitivity;
    this.pitch = clamp(this.pitch - dy * MOUSE_BASE_SENS * this.sensitivity, -MAX_PITCH, MAX_PITCH);
    this.lastLook.x = dx;
    this.lastLook.y = dy;
    void dt;
  }

  // ---------- intenção de movimento ----------
  private updateMove(dt: number, input: PlayerInput | null): void {
    const active = input?.locked ?? false;
    const moveF = active && input!.forward ? 1 : 0;
    const moveB = active && input!.back ? 1 : 0;
    const moveL = active && input!.left ? 1 : 0;
    const moveR = active && input!.right ? 1 : 0;

    const f = moveF - moveB;
    const r = moveR - moveL;

    this.crouching = active && input!.crouch;
    this.sprinting = active && input!.sprint && f > 0 && !this.crouching;

    // transição suave de altura (agachar/levantar)
    const targetHeight = this.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
    this.height += (targetHeight - this.height) * Math.min(1, dt * 10);

    let dirX = 0;
    let dirZ = 0;
    if (f !== 0 || r !== 0) {
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // forward = (-sin, -cos), right = (cos, -sin) no espaço horizontal
      dirX = -sin * f + cos * r;
      dirZ = -cos * f - sin * r;
      const len = Math.hypot(dirX, dirZ);
      dirX /= len;
      dirZ /= len;
    }

    const speed = this.crouching ? CROUCH_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED;
    const accel = this.grounded ? ACCEL : AIR_ACCEL;
    this.velocity.x = approach(this.velocity.x, dirX * speed, accel * dt);
    this.velocity.z = approach(this.velocity.z, dirZ * speed, accel * dt);

    if (active && input!.consumeJump() && this.grounded) {
      this.velocity.y = JUMP_VELOCITY;
      this.grounded = false;
    }
  }

  // ---------- gravidade + colisão AABB eixo a eixo ----------
  private updateCollisionAndGravity(dt: number, input: PlayerInput | null): void {
    const wasGrounded = this.grounded;
    this.velocity.y = Math.max(this.velocity.y - GRAVITY * dt, -30);

    const pos = this.position;
    pos.x = clamp(pos.x + this.velocity.x * dt, -MAP_LIMIT, MAP_LIMIT);
    this.resolveAxis(0, this.velocity.x);
    pos.z = clamp(pos.z + this.velocity.z * dt, -MAP_LIMIT, MAP_LIMIT);
    this.resolveAxis(2, this.velocity.z);

    // velocidade de queda no momento do impacto (para o dip de aterrissagem)
    const fallSpeed = Math.max(-this.velocity.y, 0);
    this.grounded = false;
    const prevFeet = pos.y;
    pos.y += this.velocity.y * dt;

    const feet = pos.y;
    const head = pos.y + this.height;
    for (const c of this.colliders) {
      const overlapXZ =
        pos.x + RADIUS > c.minX &&
        pos.x - RADIUS < c.maxX &&
        pos.z + RADIUS > c.minZ &&
        pos.z - RADIUS < c.maxZ;
      if (!overlapXZ) continue;
      if (feet < c.maxY && head > c.minY) {
        if (this.velocity.y <= 0) {
          pos.y = c.maxY;
          this.velocity.y = 0;
          this.grounded = true;
        } else if (prevFeet + this.height <= c.minY + 0.01) {
          // bateu a cabeça por baixo
          pos.y = c.minY - this.height - EPS;
          this.velocity.y = 0;
        }
      }
    }

    // chão vem do heightfield do terreno (plano no complexo, relevo fora)
    const ground = heightAt(pos.x, pos.z);
    if (pos.y <= ground) {
      pos.y = ground;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.grounded = true;
    }

    if (!wasGrounded && this.grounded) {
      this.landDipVel -= clamp(fallSpeed * 0.05, 0.04, 0.4);
    }
    void input;
  }

  /** Resolve penetração no eixo `axis` (0 = x, 2 = z) contra os colliders. */
  private resolveAxis(axis: 0 | 2, delta: number): void {
    if (delta === 0) return;
    const pos = this.position;
    for (const c of this.colliders) {
      const feet = pos.y;
      const head = pos.y + this.height;
      if (head <= c.minY || feet >= c.maxY) continue;
      const overlapXZ =
        pos.x + RADIUS > c.minX &&
        pos.x - RADIUS < c.maxX &&
        pos.z + RADIUS > c.minZ &&
        pos.z - RADIUS < c.maxZ;
      if (!overlapXZ) continue;

      if (axis === 0) {
        pos.x = delta > 0 ? c.minX - RADIUS - EPS : c.maxX + RADIUS + EPS;
        this.velocity.x = 0;
      } else {
        pos.z = delta > 0 ? c.minZ - RADIUS - EPS : c.maxZ + RADIUS + EPS;
        this.velocity.z = 0;
      }
    }
  }

  // ---------- game feel: bob, aterrissagem, FOV ----------
  private updateCameraFeel(dt: number, input: PlayerInput | null): void {
    // regeneração estilo COD: 4 s sem dano → 35 HP/s (PRD §17.4)
    this.sinceDamage += dt;
    if (this.sinceDamage > 4 && this.hp < 100) {
      this.hp = Math.min(100, this.hp + 35 * dt);
    }

    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const moving = this.grounded && hSpeed > 0.6;

    const targetAmp = !moving ? 0 : this.crouching ? 0.012 : this.sprinting ? 0.05 : 0.03;
    const rate = moving ? 1.8 * hSpeed : 0;
    if (moving) this.bobPhase += rate * dt;

    // suaviza amplitude para evitar pops ao parar/sair
    this.bobX += (Math.cos(this.bobPhase) * targetAmp * 1.4 - this.bobX) * Math.min(1, dt * 10);
    this.bobY += (Math.sin(this.bobPhase * 2) * targetAmp - this.bobY) * Math.min(1, dt * 10);

    // molas de aterrissagem e recuo — subpassos fixos para estabilidade
    // mesmo com frames longos (dt até 0.1)
    this.stepSprings(dt);

    // decai o delta de look consumido pelo sway do viewmodel
    const decay = Math.exp(-dt * 9);
    this.lastLook.x *= decay;
    this.lastLook.y *= decay;

    // FOV: ADS sobrescreve o kick do sprint
    const targetFov = this.externalFovOverride ?? (this.sprinting ? SPRINT_FOV : BASE_FOV);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 9);
    void input;
  }

  /**
   * Integra as molas (recuo e aterrissagem) em subpassos de no máximo 1/120 s:
   * Euler explícito direto com dt grande (preview lento, dt até 0.1) divergia
   * e lançava a câmera para fora da mira.
   */
  private stepSprings(dt: number): void {
    const h = 1 / 120;
    let t = dt;
    while (t > 0) {
      const step = Math.min(h, t);
      t -= step;
      // aterrissagem
      this.landDipVel += (-this.landDip * 180 - this.landDipVel * 14) * step;
      this.landDip += this.landDipVel * step;
      // recuo (retorna a mira ao ponto original)
      this.recoilPv += (-this.recoilP * 260 - this.recoilPv * 22) * step;
      this.recoilYv += (-this.recoilY * 260 - this.recoilYv * 22) * step;
      this.recoilP += this.recoilPv * step;
      this.recoilY += this.recoilYv * step;
    }
  }

  private syncCamera(dt: number): void {
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const eyeY = this.position.y + this.height + EYE_OFFSET + this.bobY + this.landDip;
    this.camera.position.set(
      this.position.x + cos * this.bobX,
      eyeY,
      this.position.z - sin * this.bobX,
    );
    this.camera.rotation.set(this.pitch + this.recoilP, this.yaw + this.recoilY, 0);
    if (dt > 0) this.camera.updateProjectionMatrix();
  }
}

export function readStoredSensitivity(): number {
  try {
    const raw = window.localStorage.getItem(SENSITIVITY_KEY);
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) && v >= 0.1 && v <= 5 ? v : 1;
  } catch {
    return 1;
  }
}

export function writeStoredSensitivity(value: number): void {
  try {
    window.localStorage.setItem(SENSITIVITY_KEY, String(value));
  } catch {
    // storage indisponível — sensibilidade só não persiste
  }
}
