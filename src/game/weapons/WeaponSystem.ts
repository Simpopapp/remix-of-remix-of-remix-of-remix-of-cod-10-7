import * as THREE from "three";
import { BASE_FOV, type Player, type PlayerInput } from "@/game/player/Player";
import {
  SWITCH_IN_TIME,
  SWITCH_OUT_TIME,
  WEAPONS,
  WEAPON_ORDER,
  type WeaponId,
  type WeaponSpec,
} from "@/game/data/weapons";
import type { TargetManager } from "./Targets";
import { Effects } from "./Effects";
import { Viewmodel } from "./Viewmodel";

/** Input estendido com gatilhos de arma (Input implementa estruturalmente). */
export interface WeaponInput extends PlayerInput {
  readonly primary: boolean;
  readonly ads: boolean;
  consumePressed(code: string): boolean;
  consumeWheel(): number;
}

export interface WeaponStateSnapshot {
  id: WeaponId;
  name: string;
  mag: number;
  reserve: number;
  reloading: boolean;
}

export interface WeaponHitInfo {
  headshot: boolean;
  killed: boolean;
}

/** Provedor de alvos inimigos (Director implementa estruturalmente). */
export interface EnemyHitProvider {
  readonly hitMeshes: THREE.Mesh[];
  isAlive(id: number): boolean;
  applyHit(mesh: THREE.Mesh, damage: number, headshot: boolean): { killed: boolean } | null;
}

export interface WeaponSystemCallbacks {
  onHit?: (info: WeaponHitInfo) => void;
  onStateChange?: (snapshot: WeaponStateSnapshot) => void;
  /** Disparo efetuado (para áudio). */
  onShot?: (weapon: WeaponId) => void;
  /** Fim/início de recarga (para áudio). */
  onReload?: (phase: "start" | "end", weapon: WeaponId) => void;
}

interface Switching {
  t: number;
  next: WeaponId;
  applied: boolean;
}

const WALK_SPEED_REF = 4.5;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Sistema de armas (Fase 3): troca 1/2/roda, ADS com FOV animado, disparo por
 * raycast com spread por estado, recuo com recovery, cadência, munição/recarga
 * (R) e efeitos (flash/tracer/impacto/cápsula). TS puro, sem React.
 */
export class WeaponSystem {
  /** Último disparo para depuração/testes (só leitura externa). */
  debugLastShot: {
    origin: number[];
    dir: number[];
    hitCount: number;
    hitKind: string;
  } | null = null;

  private current: WeaponId = "rifle";
  private mags: Record<WeaponId, { mag: number; reserve: number }>;
  private cooldown = 0;
  private reloading: { t: number } | null = null;
  private switching: Switching | null = null;
  private adsAmount = 0;
  private stateDirty = true;
  private raycaster = new THREE.Raycaster();
  private tmpMuzzle = new THREE.Vector3();
  private hitList: THREE.Mesh[];
  private viewmodel: Viewmodel;
  private effects: Effects;
  private enemies: EnemyHitProvider | null;

  constructor(
    private camera: THREE.PerspectiveCamera,
    scene: THREE.Scene,
    private player: Player,
    private input: WeaponInput,
    private targets: TargetManager,
    worldMeshes: THREE.Mesh[],
    private callbacks: WeaponSystemCallbacks,
    enemies?: EnemyHitProvider,
  ) {
    this.mags = {
      rifle: { mag: WEAPONS.rifle.magSize, reserve: WEAPONS.rifle.reserveAmmo },
      pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserveAmmo },
    };
    this.enemies = enemies ?? null;
    this.hitList = [...targets.hitMeshes, ...worldMeshes, ...(enemies?.hitMeshes ?? [])];
    this.viewmodel = new Viewmodel(camera, scene);
    this.effects = new Effects(scene);
  }

  update(dt: number): void {
    const input = this.input;
    const active = input.locked;

    if (active) this.handleSwitchInput();

    // ADS: mira anima o FOV; bloqueada durante a troca
    const wantAds = active && input.ads && this.switching === null;
    this.adsAmount += ((wantAds ? 1 : 0) - this.adsAmount) * Math.min(1, dt * 11);
    if (this.adsAmount < 0.003) this.adsAmount = 0;
    const spec = WEAPONS[this.current];
    this.player.externalFovOverride =
      this.adsAmount > 0 ? BASE_FOV + (spec.adsFov - BASE_FOV) * this.adsAmount : null;

    // timeline da troca (bloqueia tiro/recarga até o fim da subida)
    if (this.switching) {
      this.switching.t += dt;
      if (!this.switching.applied && this.switching.t >= SWITCH_OUT_TIME) {
        this.current = this.switching.next;
        this.switching.applied = true;
        this.stateDirty = true;
      }
      if (this.switching.t >= SWITCH_OUT_TIME + SWITCH_IN_TIME) this.switching = null;
    }

    // recarga
    if (this.reloading) {
      this.reloading.t += dt;
      if (this.reloading.t >= WEAPONS[this.current].reloadTime) this.finishReload();
    }

    // disparo
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (active && this.switching === null && this.reloading === null) {
      const s = WEAPONS[this.current];
      const wantFire = s.auto ? input.primary : input.consumePressed("Mouse0");
      if (wantFire && this.cooldown <= 0) {
        if (this.mags[this.current].mag > 0) this.fire();
        else this.tryStartReload();
      }
    }

    if (active && input.consumePressed("KeyR")) this.tryStartReload();

    // animações e efeitos
    const hSpeed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    this.viewmodel.update(
      dt,
      Math.min(1, hSpeed / 7),
      this.player.grounded,
      this.player.lastLook.x,
      this.player.lastLook.y,
      this.adsAmount,
    );
    this.effects.update(dt);
    this.targets.update(dt);
    this.emitState();
  }

  dispose(): void {
    this.viewmodel.dispose();
    this.effects.dispose();
  }

  // ---------- troca ----------

  private handleSwitchInput(): void {
    let want: WeaponId | null = null;
    if (this.input.consumePressed("Digit1")) want = "rifle";
    else if (this.input.consumePressed("Digit2")) want = "pistol";
    else {
      const w = this.input.consumeWheel();
      if (w !== 0) {
        const idx = WEAPON_ORDER.indexOf(this.current);
        const next = (idx + (w > 0 ? 1 : -1) + WEAPON_ORDER.length) % WEAPON_ORDER.length;
        want = WEAPON_ORDER[next] ?? null;
      }
    }
    if (!want || want === this.current || this.switching) return;
    // trocar cancela a recarga (requisito do PRD)
    if (this.reloading) {
      this.reloading = null;
      this.viewmodel.cancelReload();
    }
    this.switching = { t: 0, next: want, applied: false };
    this.viewmodel.switchTo(want);
    this.stateDirty = true;
  }

  // ---------- recarga ----------

  private tryStartReload(): void {
    if (this.reloading || this.switching) return;
    const spec = WEAPONS[this.current];
    const ammo = this.mags[this.current];
    if (ammo.mag >= spec.magSize || ammo.reserve <= 0) return;
    this.reloading = { t: 0 };
    this.viewmodel.startReload(spec.reloadTime);
    this.callbacks.onReload?.("start", this.current);
    this.stateDirty = true;
  }

  private finishReload(): void {
    const spec = WEAPONS[this.current];
    const ammo = this.mags[this.current];
    const take = Math.min(spec.magSize - ammo.mag, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
    this.reloading = null;
    this.callbacks.onReload?.("end", this.current);
    this.stateDirty = true;
  }

  // ---------- disparo ----------

  private fire(): void {
    const spec = WEAPONS[this.current];
    const ammo = this.mags[this.current];
    ammo.mag -= 1;
    this.cooldown = 60 / spec.rpm;
    this.stateDirty = true;

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(dir, UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    const spread = this.computeSpread(spec);
    dir
      .addScaledVector(right, (Math.random() + Math.random() - 1) * spread)
      .addScaledVector(up, (Math.random() + Math.random() - 1) * spread)
      .normalize();

    this.player.kickRecoil(spec.recoilPitch, (Math.random() - 0.5) * 2 * spec.recoilYaw);

    this.raycaster.set(origin, dir);
    this.raycaster.far = 250;
    const hits = this.raycaster.intersectObjects(this.hitList, false);
    // cadáveres (inimigos mortos) não bloqueiam a bala
    let hit = hits[0];
    if (this.enemies) {
      for (const h of hits) {
        const eid = h.object.userData["enemyId"];
        if (typeof eid === "number" && !this.enemies.isAlive(eid)) continue;
        hit = h;
        break;
      }
    }
    const muzzle = this.viewmodel.getMuzzleWorld(this.tmpMuzzle);
    const end = hit ? hit.point.clone() : origin.clone().addScaledVector(dir, 120);
    if (muzzle.distanceTo(end) > 0.8) this.effects.tracer(muzzle, end);

    if (hit) {
      const ud = hit.object.userData;
      const enemyId = ud["enemyId"];
      if (typeof enemyId === "number" && this.enemies) {
        const headshot = ud["zone"] === "head";
        const damage = spec.damage * (headshot ? spec.headshotMultiplier : 1);
        const result = this.enemies.applyHit(hit.object as THREE.Mesh, damage, headshot);
        if (result) this.callbacks.onHit?.({ headshot, killed: result.killed });
      } else if (typeof ud["targetId"] === "number") {
        const headshot = ud["zone"] === "head";
        const damage = spec.damage * (headshot ? spec.headshotMultiplier : 1);
        const result = this.targets.applyHit(hit.object as THREE.Mesh, damage, headshot);
        if (result) this.callbacks.onHit?.({ headshot, killed: result.killed });
      } else {
        const normal = hit.face
          ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
          : dir.clone().negate();
        this.effects.impact(hit.point, normal);
      }
    }
    this.debugLastShot = {
      origin: origin.toArray(),
      dir: dir.toArray(),
      hitCount: hits.length,
      hitKind:
        hit === undefined
          ? "none"
          : typeof hit.object.userData["enemyId"] === "number"
            ? `enemy:${String(hit.object.userData["enemyId"])}`
            : typeof hit.object.userData["targetId"] === "number"
              ? `target:${String(hit.object.userData["targetId"])}`
              : `world:${String(hit.object.type)}`,
    };

    this.effects.muzzleFlash(muzzle, dir);
    this.effects.casing(muzzle, right);
    this.viewmodel.fire();
    this.callbacks.onShot?.(this.current);

    if (ammo.mag === 0) this.tryStartReload();
  }

  private computeSpread(spec: WeaponSpec): number {
    const hSpeed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    let s = THREE.MathUtils.lerp(spec.spreadHip, spec.spreadAds, this.adsAmount);
    s *= 1 + (hSpeed / WALK_SPEED_REF) * spec.moveSpread;
    if (!this.player.grounded) s += spec.spreadHip * spec.airSpread;
    if (this.player.isCrouching) s *= 0.7;
    return s;
  }

  private emitState(): void {
    if (!this.stateDirty) return;
    this.stateDirty = false;
    const spec = WEAPONS[this.current];
    const ammo = this.mags[this.current];
    this.callbacks.onStateChange?.({
      id: spec.id,
      name: spec.name,
      mag: ammo.mag,
      reserve: ammo.reserve,
      reloading: this.reloading !== null,
    });
  }
}
