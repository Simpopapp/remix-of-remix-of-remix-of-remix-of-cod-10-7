import * as THREE from "three";
import type { BoxCollider } from "@/game/world/ValidationScene";
import { MISSION1_ENEMIES, type EnemySpawnSpec } from "@/game/data/mission1";
import { Enemy, type EnemyContext } from "./Enemy";
import { Effects } from "@/game/weapons/Effects";
import type { Player } from "@/game/player/Player";

export interface DirectorCallbacks {
  onPlayerDamage?: (angle: number, amount: number) => void;
  /** Morte do jogador; source = origem do tiro letal (killcam — Fase 6). */
  onPlayerDeath?: (source: THREE.Vector3) => void;
  /** Disparo de um inimigo (distância até o alvo, para áudio posicional simples). */
  onEnemyShot?: (dist: number) => void;
  /** Inimigo abatido pelo jogador (kill feed + estatísticas — Fase 6). */
  onEnemyKilled?: (info: { id: number; headshot: boolean }) => void;
}

/**
 * Director v0 (Fase 4): spawna a população da missão por dados
 * (src/game/data/mission1.ts), propaga alertas em raio e roteia o dano
 * ao jogador (direção para a HUD + morte). Também é o provedor de alvos
 * inimigos para o WeaponSystem (interface EnemyHitProvider).
 */
export class Director {
  /** Malhas raycastáveis dos inimigos (consumidas pelo WeaponSystem). */
  readonly hitMeshes: THREE.Mesh[] = [];

  private enemies: Enemy[] = [];
  /** Próximo id de spawn (waves) — invariante id == índice em applyHit. */
  private nextId = MISSION1_ENEMIES.length;
  private effects: Effects;
  private ctx: EnemyContext;
  private scene: THREE.Scene;
  private callbacks: DirectorCallbacks;

  constructor(
    scene: THREE.Scene,
    private player: Player,
    colliders: BoxCollider[],
    occluders: THREE.Mesh[],
    callbacks: DirectorCallbacks,
  ) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.effects = new Effects(scene);
    for (const spawn of MISSION1_ENEMIES) {
      const enemy = new Enemy(scene, spawn);
      this.enemies.push(enemy);
      this.hitMeshes.push(...enemy.hitMeshes);
    }
    this.ctx = {
      target: player,
      eye: new THREE.Vector3(),
      colliders,
      occluders,
      effects: this.effects,
      onPlayerHit: (damage, source) => this.handlePlayerHit(damage, source),
      onAlertOthers: (source, exceptId) => this.alertOthers(source, exceptId),
      ...(this.callbacks.onEnemyShot
        ? {
            onEnemyShot: (_source: THREE.Vector3, dist: number) =>
              this.callbacks.onEnemyShot!(dist),
          }
        : {}),
    };
  }

  /** Camada de música pela ameaça atual: calmo / tensão / intenso (PRD RF-07). */
  musicLevel(): "calm" | "tension" | "intense" {
    let level: "calm" | "tension" | "intense" = "calm";
    for (const e of this.enemies) {
      if (e.state === "combat" || e.state === "cover") return "intense";
      if (e.state === "alert") level = "tension";
    }
    return level;
  }

  /** Estados legíveis para depuração/testes. */
  get states(): Array<{ id: number; state: string; hp: number }> {
    return this.enemies.map((e) => ({ id: e.id, state: e.state, hp: e.hp }));
  }

  update(dt: number): void {
    // olho do jogador (câmera = pés + altura - offset)
    this.ctx.eye.set(
      this.player.position.x,
      this.player.position.y + this.player.height - 0.12,
      this.player.position.z,
    );
    for (const e of this.enemies) e.update(dt, this.ctx);
    this.effects.update(dt);
  }

  isAlive(id: number): boolean {
    return this.enemies[id]?.isAlive() ?? false;
  }

  /** Nº de inimigos vivos (objetivo B / waves — Fase 6). */
  aliveCount(): number {
    return this.enemies.reduce((n, e) => n + (e.isAlive() ? 1 : 0), 0);
  }

  /** Posições dos inimigos vivos (ex.: interrupção do hack — Fase 6). */
  enemyPositions(): THREE.Vector3[] {
    return this.enemies.filter((e) => e.isAlive()).map((e) => e.position);
  }

  /**
   * Spawna uma wave de contra-ataque (Fase 6). Os ids são reatribuídos
   * sequencialmente para manter o invariante id == índice em applyHit.
   */
  spawnWave(specs: readonly EnemySpawnSpec[]): void {
    for (const spec of specs) {
      const spawn = { ...spec, id: this.nextId++ };
      const enemy = new Enemy(this.scene, spawn);
      this.enemies.push(enemy);
      this.hitMeshes.push(...enemy.hitMeshes);
    }
  }

  /** Hit do jogador em um inimigo (roteado pelo WeaponSystem). */
  applyHit(mesh: THREE.Mesh, damage: number, headshot: boolean): { killed: boolean } | null {
    const id = mesh.userData["enemyId"];
    if (typeof id !== "number") return null;
    const enemy = this.enemies[id];
    if (!enemy || !enemy.isAlive()) return null;
    // ser atingido revela a posição do atirador
    if (enemy.state === "patrol") enemy.receiveAlert(this.player.position);
    else enemy.refreshLastKnown(this.player.position);
    const result = enemy.applyHit(damage);
    if (result?.killed) this.callbacks.onEnemyKilled?.({ id: enemy.id, headshot });
    return result;
  }

  private handlePlayerHit(damage: number, source: THREE.Vector3): void {
    if (!this.player.alive) return;
    // ângulo da fonte de dano relativo à mira (0 = à frente, positivo = à direita)
    const yaw = this.player.aim.yaw;
    const relX = source.x - this.player.position.x;
    const relZ = source.z - this.player.position.z;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const angle = Math.atan2(relX * rx + relZ * rz, relX * fx + relZ * fz);
    const died = this.player.takeDamage(damage);
    this.callbacks.onPlayerDamage?.(angle, damage);
    if (died) this.callbacks.onPlayerDeath?.(source);
  }

  /** Alerta em raio (PRD: ~25 m) ao primeiro inimigo que detecta. */
  private alertOthers(source: THREE.Vector3, exceptId: number): void {
    for (const e of this.enemies) {
      if (e.id === exceptId || e.state !== "patrol") continue;
      const d = e.position.distanceTo(source);
      if (d <= 25) e.receiveAlert(source);
    }
  }

  dispose(): void {
    this.effects.dispose();
    for (const e of this.enemies) e.dispose(this.scene);
    this.enemies = [];
    this.hitMeshes.length = 0;
  }
}
