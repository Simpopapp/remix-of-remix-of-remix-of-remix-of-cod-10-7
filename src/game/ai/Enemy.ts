import * as THREE from "three";
import type { BoxCollider } from "@/game/world/ValidationScene";
import { AI_TUNING, enemyDamageAt, type EnemySpawnSpec } from "@/game/data/mission1";
import { detectionRate, gaussian, pointIsWalkable, segmentBlockedByBoxes } from "./aiMath";
import { heightAt, terrainBlocksLos } from "@/game/world/terrainField";
import type { Effects } from "@/game/weapons/Effects";

/** Estados da FSM (PRD RF-03): patrulha → alerta → combate → cobertura → morto. */
export type EnemyState = "patrol" | "alert" | "combat" | "cover" | "dead";

/** Contrato mínimo do jogador consumido pela IA (Player implementa estruturalmente). */
export interface CombatTarget {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly height: number;
  readonly isCrouching: boolean;
  readonly isSprinting: boolean;
  readonly alive: boolean;
}

/** Serviços que a cena fornece ao inimigo a cada frame (criado pelo Director). */
export interface EnemyContext {
  target: CombatTarget;
  /** olho do jogador (posição da câmera) */
  eye: THREE.Vector3;
  colliders: BoxCollider[];
  /** malhas do mundo para raycast de LOS/tiro */
  occluders: THREE.Mesh[];
  effects: Effects;
  onPlayerHit(damage: number, source: THREE.Vector3): void;
  onAlertOthers(source: THREE.Vector3, exceptId: number): void;
  /** Disparo inimigo (fonte = foco do cano, dist = distância até o alvo). */
  onEnemyShot?(source: THREE.Vector3, dist: number): void;
}

const MAP_LIMIT = 36;
const UP = new THREE.Vector3(0, 1, 0);
const EYE_HEIGHT = 1.55;

let sharedGeos: {
  leg: THREE.BoxGeometry;
  torso: THREE.BoxGeometry;
  vest: THREE.BoxGeometry;
  head: THREE.BoxGeometry;
  visor: THREE.BoxGeometry;
  arm: THREE.BoxGeometry;
  gun: THREE.BoxGeometry;
} | null = null;

function getSharedGeometries(): NonNullable<typeof sharedGeos> {
  if (!sharedGeos) {
    sharedGeos = {
      leg: new THREE.BoxGeometry(0.17, 0.8, 0.2),
      torso: new THREE.BoxGeometry(0.46, 0.6, 0.26),
      vest: new THREE.BoxGeometry(0.5, 0.34, 0.3),
      head: new THREE.BoxGeometry(0.22, 0.24, 0.24),
      visor: new THREE.BoxGeometry(0.18, 0.045, 0.02),
      arm: new THREE.BoxGeometry(0.12, 0.5, 0.14),
      gun: new THREE.BoxGeometry(0.07, 0.1, 0.62),
    };
  }
  return sharedGeos;
}

/**
 * Soldado inimigo (Fase 4): silhueta composta legível, FSM de combate,
 * rajadas com spread que cresce ao longo da rajada, busca de cobertura e
 * alerta em raio. TS puro — sem React. Colisão AABB própria, estilo Player.
 */
export class Enemy {
  readonly id: number;
  readonly root = new THREE.Group();
  /** Malhas raycastáveis com userData { enemyId, zone } (cabeça ×2 dano). */
  readonly hitMeshes: THREE.Mesh[] = [];

  state: EnemyState = "patrol";
  hp: number = AI_TUNING.hp;

  private inner = new THREE.Group();
  private torsoMat: THREE.MeshStandardMaterial;
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private gunMuzzle = new THREE.Object3D();

  private route: Array<[number, number]>;
  private routeIndex = 0;
  private detection = 0;
  private losVisible = false;
  private losTimer = 0;
  private lastKnown = new THREE.Vector3();
  private lostTimer = 0;
  private reaction = 0;
  private alertMemory = 0;
  private waitTimer = 0;
  private legPhase = 0;
  private movingFor = 0; // tempo restante "em movimento" (para animação)
  private crouchK = 0;
  private flash = 0;

  private burstLeft = 0;
  private burstIndex = 0;
  private shotCooldown = 0;
  private burstPause = 0;
  private strafeDir = 1;
  private strafeTimer = 0;

  private coverPoint: THREE.Vector3 | null = null;
  private coverPhase: "move" | "hold" | "pop" = "move";
  private coverTimer = 0;

  private deadT = 0;
  private raycaster = new THREE.Raycaster();
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();
  private tmpSphere = new THREE.Sphere();

  constructor(scene: THREE.Scene, spawn: EnemySpawnSpec) {
    this.id = spawn.id;
    this.route = spawn.route.map(([x, z]) => [x, z] as [number, number]);
    const geo = getSharedGeometries();

    // materiais por instância (flash de dano individual)
    const uniformMat = new THREE.MeshStandardMaterial({ color: 0x39413f, roughness: 0.85 });
    this.torsoMat = new THREE.MeshStandardMaterial({ color: 0x4a524c, roughness: 0.8 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x333a3a, roughness: 0.7 });
    const gunMat = new THREE.MeshStandardMaterial({
      color: 0x1c1f22,
      roughness: 0.5,
      metalness: 0.6,
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x330505,
      emissive: 0xff2222,
      emissiveIntensity: 1.4,
    });

    const add = (
      g: THREE.BufferGeometry,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
      zone: "head" | "body",
      shadow = true,
    ): THREE.Mesh => {
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, y, z);
      m.castShadow = shadow;
      m.userData = { enemyId: this.id, zone };
      this.inner.add(m);
      this.hitMeshes.push(m);
      return m;
    };

    // modelo virado para +z (frente do inimigo); pés em y = 0 do inner
    add(geo.torso, this.torsoMat, 0, 1.12, 0, "body");
    add(geo.vest, this.torsoMat, 0, 1.2, 0.01, "body");
    add(geo.head, headMat, 0, 1.58, 0, "head");
    add(geo.visor, visorMat, 0, 1.6, 0.125, "head", false);
    add(geo.arm, uniformMat, -0.3, 1.1, 0.05, "body");
    add(geo.arm, uniformMat, 0.3, 1.1, 0.05, "body");
    this.legL = add(geo.leg, uniformMat, -0.12, 0.4, 0, "body");
    this.legR = add(geo.leg, uniformMat, 0.12, 0.4, 0, "body");
    const gun = add(geo.gun, gunMat, 0.14, 1.28, 0.3, "body", false);
    void gun;
    this.gunMuzzle.position.set(0.14, 1.28, 0.64);
    this.inner.add(this.gunMuzzle);

    this.root.add(this.inner);
    this.root.position.set(spawn.x, heightAt(spawn.x, spawn.z), spawn.z);
    this.root.rotation.y = spawn.facing;
    scene.add(this.root);
  }

  isAlive(): boolean {
    return this.hp > 0;
  }

  /** Posição dos pés no mundo. */
  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** Alerta de companheiro (raio ~25 m, PRD RF-03): vai investigar a posição. */
  receiveAlert(source: THREE.Vector3): void {
    if (this.state !== "patrol") return;
    this.state = "alert";
    this.lastKnown.copy(source);
    this.reaction =
      AI_TUNING.reactionMin + Math.random() * (AI_TUNING.reactionMax - AI_TUNING.reactionMin);
  }

  /** Saber a posição do atirador (levou dano / avistou de novo em combate). */
  refreshLastKnown(source: THREE.Vector3): void {
    this.lastKnown.copy(source);
    this.lostTimer = 0;
  }

  /** Aplica dano; null se já morto. */
  applyHit(damage: number): { killed: boolean } | null {
    if (this.hp <= 0) return null;
    this.hp -= damage;
    this.flash = 0.14;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = "dead";
      this.deadT = 0;
      this.burstLeft = 0;
      return { killed: true };
    }
    return { killed: false };
  }

  update(dt: number, ctx: EnemyContext): void {
    if (this.state === "dead") {
      this.updateDeath(dt);
      return;
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      this.torsoMat.emissive.setRGB(1, 0.19, 0.12);
      this.torsoMat.emissiveIntensity = (this.flash / 0.14) * 0.9;
      if (this.flash === 0) this.torsoMat.emissiveIntensity = 0;
    }
    this.updateDetection(dt, ctx);
    switch (this.state) {
      case "patrol":
        this.updatePatrol(dt, ctx);
        break;
      case "alert":
        this.updateAlert(dt, ctx);
        break;
      case "combat":
        this.updateCombat(dt, ctx);
        break;
      case "cover":
        this.updateCover(dt, ctx);
        break;
    }
    this.movingFor = Math.max(0, this.movingFor - dt);
    this.animate(dt);
  }

  // ---------- percepção ----------

  private updateDetection(dt: number, ctx: EnemyContext): void {
    const eye = this.tmpA.set(
      this.root.position.x,
      this.root.position.y + EYE_HEIGHT,
      this.root.position.z,
    );
    const toPlayer = this.tmpB.subVectors(ctx.eye, eye);
    const dist = toPlayer.length();

    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = AI_TUNING.losInterval;
      if (dist > AI_TUNING.visionRange || !ctx.target.alive) {
        this.losVisible = false;
      } else {
        // cone de visão (70° total) em torno da direção do corpo
        const fwdX = Math.sin(this.root.rotation.y);
        const fwdZ = Math.cos(this.root.rotation.y);
        const nx = toPlayer.x / dist;
        const nz = toPlayer.z / dist;
        const inCone =
          nx * fwdX + nz * fwdZ > Math.cos((AI_TUNING.visionHalfAngleDeg * Math.PI) / 180);
        this.losVisible = inCone && !this.losBlocked(eye, ctx.eye, dist, ctx.occluders);
      }
    }

    if (this.state === "combat" || this.state === "cover") {
      // memória posicional; visão atualiza a última posição conhecida
      if (this.losVisible && ctx.target.alive) {
        this.refreshLastKnown(ctx.target.position);
      } else {
        this.lostTimer += dt;
        if (this.lostTimer > AI_TUNING.combatMemory) {
          this.state = "patrol";
          this.detection = 0;
          this.coverPoint = null;
        }
      }
      return;
    }

    if (this.losVisible && ctx.target.alive) {
      this.detection = Math.min(
        1,
        this.detection + detectionRate(dist, ctx.target.isCrouching, ctx.target.isSprinting) * dt,
      );
      if (this.detection >= 1) {
        this.lastKnown.copy(ctx.target.position);
        this.reaction =
          AI_TUNING.reactionMin + Math.random() * (AI_TUNING.reactionMax - AI_TUNING.reactionMin);
        this.state = "alert";
        ctx.onAlertOthers(this.lastKnown, this.id);
      }
    } else {
      this.detection = Math.max(0, this.detection - AI_TUNING.detectionDecay * dt);
    }
  }

  private losBlocked(
    from: THREE.Vector3,
    to: THREE.Vector3,
    dist: number,
    occluders: THREE.Mesh[],
  ): boolean {
    // relevo primeiro: barato e independente de malhas
    if (terrainBlocksLos(from.x, from.y, from.z, to.x, to.y, to.z)) return true;
    this.tmpDir.copy(to).sub(from).normalize();
    this.raycaster.set(from, this.tmpDir);
    this.raycaster.far = Math.max(0.1, dist - 0.3);
    return this.raycaster.intersectObjects(occluders, false).length > 0;
  }

  // ---------- FSM ----------

  private updatePatrol(dt: number, ctx: EnemyContext): void {
    if (this.waitTimer > 0) {
      this.waitTimer -= dt;
      return;
    }
    const wp = this.route[this.routeIndex];
    if (!wp) return;
    const arrived = this.moveToward(wp[0], wp[1], AI_TUNING.patrolSpeed, dt, ctx.colliders);
    if (arrived) {
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
      this.waitTimer =
        AI_TUNING.patrolWaitMin +
        Math.random() * (AI_TUNING.patrolWaitMax - AI_TUNING.patrolWaitMin);
    }
  }

  private updateAlert(dt: number, ctx: EnemyContext): void {
    if (!ctx.target.alive) {
      this.state = "patrol";
      return;
    }
    this.reaction -= dt;
    const arrived = this.moveToward(
      this.lastKnown.x,
      this.lastKnown.z,
      AI_TUNING.combatSpeed,
      dt,
      ctx.colliders,
    );
    if (this.reaction <= 0 && (arrived || this.losVisible)) {
      this.state = "combat";
      this.burstPause = 0.1;
      return;
    }
    if (arrived) {
      this.alertMemory += dt;
      if (this.alertMemory > 3) {
        this.state = "patrol";
        this.alertMemory = 0;
        this.detection = 0;
      }
    }
  }

  private updateCombat(dt: number, ctx: EnemyContext): void {
    if (!ctx.target.alive) return;

    // encara o jogador (ou a última posição conhecida)
    const lookX = this.losVisible ? ctx.eye.x : this.lastKnown.x;
    const lookZ = this.losVisible ? ctx.eye.z : this.lastKnown.z;
    const wantYaw = Math.atan2(lookX - this.root.position.x, lookZ - this.root.position.z);
    this.root.rotation.y += shortestAngle(this.root.rotation.y, wantYaw) * Math.min(1, dt * 7);

    if (this.burstLeft > 0) {
      this.shotCooldown -= dt;
      if (this.shotCooldown <= 0) {
        this.fireShot(ctx);
        this.burstLeft -= 1;
        this.burstIndex += 1;
        this.shotCooldown = 1 / AI_TUNING.burstRps;
        if (this.burstLeft === 0) {
          this.burstPause =
            AI_TUNING.burstPauseMin +
            Math.random() * (AI_TUNING.burstPauseMax - AI_TUNING.burstPauseMin);
        }
      }
      return;
    }

    this.burstPause -= dt;
    if (this.burstPause > 0) {
      // reposicionamento entre rajadas: strafe lateral
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 1.1 + Math.random();
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      const rx = Math.cos(this.root.rotation.y) * this.strafeDir;
      const rz = -Math.sin(this.root.rotation.y) * this.strafeDir;
      this.moveToward(
        this.root.position.x + rx * 3,
        this.root.position.z + rz * 3,
        AI_TUNING.combatSpeed * 0.55,
        dt,
        ctx.colliders,
      );
      return;
    }

    // decide: buscar cobertura ou abrir nova rajada
    if (Math.random() < AI_TUNING.coverChance && !this.coverPoint) {
      const point = this.findCover(ctx);
      if (point) {
        this.coverPoint = point;
        this.coverPhase = "move";
        this.state = "cover";
        return;
      }
    }
    this.burstLeft =
      AI_TUNING.burstMin +
      Math.floor(Math.random() * (AI_TUNING.burstMax - AI_TUNING.burstMin + 1));
    this.burstIndex = 0;
    this.shotCooldown = 0;
  }

  private updateCover(dt: number, ctx: EnemyContext): void {
    if (!this.coverPoint || !ctx.target.alive) {
      this.coverPoint = null;
      this.state = "combat";
      return;
    }
    if (this.coverPhase === "move") {
      const arrived = this.moveToward(
        this.coverPoint.x,
        this.coverPoint.z,
        AI_TUNING.combatSpeed,
        dt,
        ctx.colliders,
      );
      if (arrived) {
        this.coverPhase = "hold";
        this.coverTimer =
          AI_TUNING.coverHoldMin +
          Math.random() * (AI_TUNING.coverHoldMax - AI_TUNING.coverHoldMin);
      }
      return;
    }
    if (this.coverPhase === "hold") {
      this.coverTimer -= dt;
      if (this.coverTimer <= 0) {
        this.coverPhase = "pop";
        this.burstLeft = 3;
        this.burstIndex = 0;
        this.shotCooldown = 0;
      }
      return;
    }
    // pop: levanta e dispara uma rajada parado
    if (this.burstLeft > 0) {
      this.shotCooldown -= dt;
      if (this.shotCooldown <= 0) {
        this.fireShot(ctx);
        this.burstLeft -= 1;
        this.burstIndex += 1;
        this.shotCooldown = 1 / AI_TUNING.burstRps;
      }
    } else {
      this.coverPoint = null;
      this.coverPhase = "move";
      this.state = "combat";
      this.burstPause =
        AI_TUNING.burstPauseMin +
        Math.random() * (AI_TUNING.burstPauseMax - AI_TUNING.burstPauseMin);
    }
  }

  /** Ponto de cobertura: a ≤ 6 m, LOS do jogador bloqueado e posição livre. */
  private findCover(ctx: EnemyContext): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < AI_TUNING.coverSampleCount; i++) {
      const a = (i / AI_TUNING.coverSampleCount) * Math.PI * 2 + Math.random() * 0.5;
      const r =
        AI_TUNING.coverSampleRadiusMin +
        Math.random() * (AI_TUNING.coverSampleRadiusMax - AI_TUNING.coverSampleRadiusMin);
      const x = this.root.position.x + Math.cos(a) * r;
      const z = this.root.position.z + Math.sin(a) * r;
      if (!pointIsWalkable(x, z, 0.6, ctx.colliders, MAP_LIMIT)) continue;
      const blocked = segmentBlockedByBoxes(
        ctx.eye.x,
        ctx.eye.y,
        ctx.eye.z,
        x,
        AI_TUNING.coverPointHeight,
        z,
        ctx.colliders,
      );
      if (!blocked) continue;
      const d = (x - this.root.position.x) ** 2 + (z - this.root.position.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = new THREE.Vector3(x, heightAt(x, z), z);
      }
    }
    return best;
  }

  // ---------- tiro ----------

  private fireShot(ctx: EnemyContext): void {
    const muzzle = this.gunMuzzle.getWorldPosition(this.tmpA);
    const aim = this.tmpB.copy(this.losVisible ? ctx.eye : this.lastKnown);
    aim.y -= 0.15;
    const dist = aim.distanceTo(muzzle);
    if (dist < 0.5) return;
    const dir = this.tmpDir.copy(aim).sub(muzzle).normalize();

    // spread: base × crescimento por tiro da rajada × movimento/postura do alvo
    let sigma = AI_TUNING.sigmaAngle * Math.pow(AI_TUNING.burstSpreadGrowth, this.burstIndex);
    if (Math.hypot(ctx.target.velocity.x, ctx.target.velocity.z) > 2) {
      sigma *= AI_TUNING.movingTargetMul;
    }
    if (ctx.target.isCrouching) sigma *= AI_TUNING.crouchTargetMul;

    const right = new THREE.Vector3().crossVectors(dir, UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    dir
      .addScaledVector(right, gaussian() * sigma)
      .addScaledVector(up, gaussian() * sigma)
      .normalize();

    // parede mais próxima no caminho
    this.raycaster.set(muzzle, dir);
    this.raycaster.far = 80;
    const wallHits = this.raycaster.intersectObjects(ctx.occluders, false);
    const wallDist = wallHits[0]?.distance ?? Infinity;

    // cápsula do jogador (3 esferas)
    const playerDist = this.rayPlayerDistance(muzzle, dir, ctx);

    let end: THREE.Vector3;
    if (ctx.target.alive && playerDist < wallDist) {
      end = muzzle.clone().addScaledVector(dir, playerDist);
      ctx.onPlayerHit(enemyDamageAt(playerDist), muzzle);
    } else if (wallHits[0] && wallHits[0].point) {
      end = wallHits[0].point.clone();
      const n = wallHits[0].face
        ? wallHits[0].face.normal.clone().transformDirection(wallHits[0].object.matrixWorld)
        : dir.clone().negate();
      ctx.effects.impact(end, n);
    } else {
      end = muzzle.clone().addScaledVector(dir, 60);
    }
    ctx.effects.tracer(muzzle, end);
    ctx.effects.muzzleFlash(muzzle, dir);
    ctx.onEnemyShot?.(muzzle, dist);
  }

  /** Distância do raio até a cápsula do jogador; Infinity se erra. */
  private rayPlayerDistance(origin: THREE.Vector3, dir: THREE.Vector3, ctx: EnemyContext): number {
    if (!ctx.target.alive) return Infinity;
    const ray = new THREE.Ray(origin, dir);
    const p = ctx.target.position;
    const h = ctx.target.height;
    let best = Infinity;
    for (const yo of [0.3, h / 2, h - 0.3]) {
      this.tmpSphere.center.set(p.x, p.y + yo, p.z);
      this.tmpSphere.radius = AI_TUNING.playerCapsuleRadius;
      const hit = ray.intersectSphere(this.tmpSphere, this.tmpB);
      if (hit) {
        const d = origin.distanceTo(hit);
        if (d < best) best = d;
      }
    }
    return best;
  }

  // ---------- movimento / animação / morte ----------

  /** Move em direção a (x, z); true se chegou (< 0.45 m). Colisão AABB eixo a eixo. */
  private moveToward(
    x: number,
    z: number,
    speed: number,
    dt: number,
    colliders: BoxCollider[],
  ): boolean {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.45) return true;
    const step = Math.min(speed * dt, dist);
    const nx = dx / dist;
    const nz = dz / dist;

    const pos = this.root.position;
    pos.x = THREE.MathUtils.clamp(pos.x + nx * step, -MAP_LIMIT, MAP_LIMIT);
    this.resolveAxis(0, nx, colliders);
    pos.z = THREE.MathUtils.clamp(pos.z + nz * step, -MAP_LIMIT, MAP_LIMIT);
    this.resolveAxis(2, nz, colliders);
    pos.y = heightAt(pos.x, pos.z);

    // fora de combate, encara a direção do movimento
    if (this.state === "patrol" || this.state === "alert") {
      this.root.rotation.y +=
        shortestAngle(this.root.rotation.y, Math.atan2(nx, nz)) * Math.min(1, dt * 6);
    }
    this.legPhase += speed * dt * 2.4;
    this.movingFor = 0.15;
    return false;
  }

  private resolveAxis(axis: 0 | 2, delta: number, colliders: BoxCollider[]): void {
    if (delta === 0) return;
    const pos = this.root.position;
    const r = AI_TUNING.enemyRadius;
    for (const c of colliders) {
      if (c.minY > pos.y + AI_TUNING.enemyHeight || c.maxY < pos.y + 0.2) continue;
      const overlapXZ =
        pos.x + r > c.minX && pos.x - r < c.maxX && pos.z + r > c.minZ && pos.z - r < c.maxZ;
      if (!overlapXZ) continue;
      if (axis === 0) {
        pos.x = delta > 0 ? c.minX - r - 0.01 : c.maxX + r + 0.01;
      } else {
        pos.z = delta > 0 ? c.minZ - r - 0.01 : c.maxZ + r + 0.01;
      }
    }
  }

  private animate(dt: number): void {
    // agachar durante a espera na cobertura
    const wantCrouch = this.state === "cover" && this.coverPhase === "hold" ? 1 : 0;
    this.crouchK += (wantCrouch - this.crouchK) * Math.min(1, dt * 8);
    this.inner.scale.y = 1 - this.crouchK * 0.28;

    const swinging = this.movingFor > 0;
    const amp = swinging ? 0.55 : 0;
    this.legL.rotation.x = Math.sin(this.legPhase) * amp;
    this.legR.rotation.x = -Math.sin(this.legPhase) * amp;
  }

  private updateDeath(dt: number): void {
    this.deadT += dt;
    const k = Math.min(1, this.deadT / 0.5);
    // queda de costas (rotaciona em torno dos pés)
    this.inner.rotation.x = -(k * k) * 1.5;
    this.inner.position.y = Math.sin(k * Math.PI) * 0.1;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    this.hitMeshes.length = 0;
    this.torsoMat.dispose();
  }
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
