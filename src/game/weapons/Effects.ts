import * as THREE from "three";

/**
 * Efeitos de disparo (Fase 3): muzzle flash com luz dinâmica (≤ 60 ms),
 * tracers, impactos (faíscas + decalques) e cápsulas ejetadas.
 * Tudo em pools fixos — zero alocação por frame em regime permanente.
 */

const FLASH_LIFE = 0.055;
const TRACER_LIFE = 0.07;
const SPARK_LIFE = 0.32;
const CASING_LIFE = 0.9;
const DECAL_COUNT = 24;

interface PooledMesh {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  vel?: THREE.Vector3;
  spin?: THREE.Vector3;
}

function makeFlashTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,235,1)");
  g.addColorStop(0.25, "rgba(255,190,110,0.9)");
  g.addColorStop(0.6, "rgba(255,120,40,0.35)");
  g.addColorStop(1, "rgba(255,80,20,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Effects {
  private disposables: Array<{ dispose(): void }> = [];

  private flashes: PooledMesh[] = [];
  private tracers: PooledMesh[] = [];
  private sparks: PooledMesh[] = [];
  private casings: PooledMesh[] = [];
  private decals: THREE.Mesh[] = [];
  private decalIndex = 0;

  private flashLight: THREE.PointLight;
  private flashLightLife = 0;

  private tmpV = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {
    // ---- muzzle flash (sprites aditivos) ----
    const flashTex = makeFlashTexture();
    const flashGeo = new THREE.PlaneGeometry(0.32, 0.32);
    this.disposables.push(flashTex, flashGeo);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: flashTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.disposables.push(mat);
      const mesh = new THREE.Mesh(flashGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 5;
      scene.add(mesh);
      this.flashes.push({ mesh, life: 0, maxLife: FLASH_LIFE });
    }

    // ---- luz dinâmica do flash ----
    this.flashLight = new THREE.PointLight(0xffb36b, 0, 12, 2);
    scene.add(this.flashLight);

    // ---- tracers ----
    const tracerGeo = new THREE.BoxGeometry(0.016, 0.016, 1);
    this.disposables.push(tracerGeo);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffca7a,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.disposables.push(mat);
      const mesh = new THREE.Mesh(tracerGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.tracers.push({ mesh, life: 0, maxLife: TRACER_LIFE });
    }

    // ---- faíscas de impacto ----
    const sparkGeo = new THREE.BoxGeometry(0.02, 0.02, 0.02);
    this.disposables.push(sparkGeo);
    for (let i = 0; i < 32; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffa550,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.disposables.push(mat);
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.sparks.push({
        mesh,
        life: 0,
        maxLife: SPARK_LIFE,
        vel: new THREE.Vector3(),
      });
    }

    // ---- decalques de bala ----
    const decalGeo = new THREE.CircleGeometry(0.055, 12);
    this.disposables.push(decalGeo);
    for (let i = 0; i < DECAL_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x0b0c0e,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      this.disposables.push(mat);
      const mesh = new THREE.Mesh(decalGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.decals.push(mesh);
    }

    // ---- cápsulas ejetadas ----
    const casingGeo = new THREE.BoxGeometry(0.012, 0.012, 0.032);
    const casingMat = new THREE.MeshStandardMaterial({
      color: 0xb08d3f,
      metalness: 0.8,
      roughness: 0.35,
    });
    this.disposables.push(casingGeo, casingMat);
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(casingGeo, casingMat);
      mesh.visible = false;
      scene.add(mesh);
      this.casings.push({
        mesh,
        life: 0,
        maxLife: CASING_LIFE,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
      });
    }
  }

  /** Flash do cano + luz dinâmica que ilumina o chão próximo. */
  muzzleFlash(position: THREE.Vector3, direction: THREE.Vector3): void {
    const slot = this.acquire(this.flashes);
    if (slot) {
      slot.mesh.visible = true;
      slot.mesh.position.copy(position).addScaledVector(direction, 0.06);
      slot.mesh.scale.setScalar(0.8 + Math.random() * 0.5);
      slot.mesh.rotation.z = Math.random() * Math.PI * 2;
      slot.life = FLASH_LIFE;
    }
    this.flashLight.position.copy(position);
    this.flashLight.intensity = 55;
    this.flashLightLife = FLASH_LIFE;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const slot = this.acquire(this.tracers);
    if (!slot) return;
    const dist = from.distanceTo(to);
    if (dist < 0.5) return;
    slot.mesh.visible = true;
    slot.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    slot.mesh.lookAt(to);
    slot.mesh.scale.set(1, 1, dist);
    slot.life = TRACER_LIFE;
  }

  impact(point: THREE.Vector3, normal: THREE.Vector3): void {
    // faíscas
    let spawned = 0;
    for (const s of this.sparks) {
      if (s.life > 0 || spawned >= 6) continue;
      s.mesh.visible = true;
      s.mesh.position.copy(point);
      s.vel
        ?.copy(normal)
        .multiplyScalar(1.5 + Math.random() * 2.5)
        .add(
          this.tmpV
            .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
            .multiplyScalar(2.2),
        );
      s.life = SPARK_LIFE * (0.6 + Math.random() * 0.4);
      spawned++;
    }
    // decalque
    const decal = this.decals[this.decalIndex]!;
    this.decalIndex = (this.decalIndex + 1) % DECAL_COUNT;
    decal.visible = true;
    decal.position.copy(point).addScaledVector(normal, 0.006);
    decal.lookAt(this.tmpV.copy(point).add(normal));
    decal.rotateZ(Math.random() * Math.PI * 2);
    decal.scale.setScalar(0.7 + Math.random() * 0.6);
  }

  casing(position: THREE.Vector3, rightDir: THREE.Vector3): void {
    const slot = this.casings.find((c) => c.life <= 0);
    if (!slot) return;
    slot.mesh.visible = true;
    slot.mesh.position.copy(position);
    slot.vel
      ?.copy(rightDir)
      .multiplyScalar(1.6 + Math.random() * 0.8)
      .add(
        this.tmpV.set((Math.random() - 0.5) * 0.6, 2 + Math.random(), (Math.random() - 0.5) * 0.6),
      );
    slot.spin?.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
    slot.life = CASING_LIFE;
  }

  update(dt: number): void {
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.mesh.visible = false;
      } else {
        const mat = f.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = f.life / FLASH_LIFE;
      }
    }
    if (this.flashLightLife > 0) {
      this.flashLightLife -= dt;
      this.flashLight.intensity = Math.max(0, (this.flashLightLife / FLASH_LIFE) * 55);
    }

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.visible = false;
      } else {
        const mat = t.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = (t.life / TRACER_LIFE) * 0.85;
      }
    }

    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        continue;
      }
      if (s.vel) s.vel.y -= 12 * dt;
      if (s.vel) s.mesh.position.addScaledVector(s.vel, dt);
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(1, s.life / (SPARK_LIFE * 0.5));
    }

    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.mesh.visible = false;
        continue;
      }
      if (c.vel) {
        c.vel.y -= 14 * dt;
        c.mesh.position.addScaledVector(c.vel, dt);
        if (c.mesh.position.y < 0.02 && c.vel.y < 0) {
          c.mesh.position.y = 0.02;
          c.vel.y = Math.abs(c.vel.y) * 0.35;
          c.vel.x *= 0.6;
          c.vel.z *= 0.6;
        }
      }
      if (c.spin) {
        c.mesh.rotation.x += c.spin.x * dt;
        c.mesh.rotation.y += c.spin.y * dt;
        c.mesh.rotation.z += c.spin.z * dt;
      }
    }
  }

  /** Pega um slot com life esgotado; se nenhum, recicla o mais velho. */
  private acquire(pool: PooledMesh[]): PooledMesh | null {
    let oldest = pool[0] ?? null;
    for (const slot of pool) {
      if (slot.life <= 0) return slot;
      if (oldest && slot.life < oldest.life) oldest = slot;
    }
    return oldest;
  }

  dispose(): void {
    const remove = (obj: { visible: boolean }) => {
      this.scene.remove(obj as unknown as THREE.Object3D);
    };
    for (const f of this.flashes) remove(f.mesh);
    for (const t of this.tracers) remove(t.mesh);
    for (const s of this.sparks) remove(s.mesh);
    for (const c of this.casings) remove(c.mesh);
    for (const d of this.decals) remove(d);
    this.scene.remove(this.flashLight);
    this.flashes = [];
    this.tracers = [];
    this.sparks = [];
    this.casings = [];
    this.decals = [];
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
