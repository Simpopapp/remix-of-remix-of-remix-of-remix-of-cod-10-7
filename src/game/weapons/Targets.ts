import * as THREE from "three";

/**
 * Alvos de teste da Fase 3: dianas com zona de headshot (miolo),
 * HP, queda ao destruir e respawn automático. TS puro, browser-only.
 */

const TARGET_HP = 100;
const RESPAWN_DELAY = 2.6;
const FALL_TIME = 0.55;
const RISE_TIME = 0.7;
const FALL_ANGLE = 1.45;

interface Target {
  id: number;
  root: THREE.Group;
  boardMat: THREE.MeshStandardMaterial;
  hp: number;
  state: "up" | "falling" | "down" | "rising";
  t: number;
  flash: number;
}

function makeTargetTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");
  const c = size / 2;
  ctx.fillStyle = "#ddd3bd";
  ctx.fillRect(0, 0, size, size);
  const ring = (r: number, color: string) => {
    ctx.beginPath();
    ctx.arc(c, c, r * c, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.045;
    ctx.stroke();
  };
  ring(0.82, "#8a2a20");
  ring(0.62, "#8a2a20");
  ring(0.42, "#22262b");
  ring(0.24, "#8a2a20");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function easeIn(k: number): number {
  return k * k;
}

function easeOut(k: number): number {
  return 1 - (1 - k) * (1 - k);
}

export class TargetManager {
  /** Malhas raycastáveis (tábua + miolo), com userData { targetId, zone? }. */
  readonly hitMeshes: THREE.Mesh[] = [];

  private targets: Target[] = [];
  private roots: THREE.Group[] = [];
  private disposables: Array<{ dispose(): void }> = [];

  constructor(private scene: THREE.Scene) {
    const tex = makeTargetTexture();
    const boardGeo = new THREE.CircleGeometry(0.55, 32);
    const bullGeo = new THREE.CircleGeometry(0.12, 24);
    const postGeo = new THREE.BoxGeometry(0.07, 1.1, 0.07);
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x3a3f45,
      roughness: 0.6,
      metalness: 0.6,
    });
    this.disposables.push(tex, boardGeo, bullGeo, postGeo, postMat);

    // posições viradas para a área de spawn (0, 0, 20)
    const spots: Array<[number, number]> = [
      [-3.5, -4],
      [4.5, -8],
      [-9, 3],
      [9, 5],
    ];

    spots.forEach(([x, z], i) => {
      const root = new THREE.Group();
      root.position.set(x, 0, z);
      root.lookAt(0, 0, 20);

      const post = new THREE.Mesh(postGeo, postMat);
      post.position.y = 0.55;
      root.add(post);

      const boardMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.85,
        metalness: 0,
        emissive: 0xff2020,
        emissiveIntensity: 0,
      });
      this.disposables.push(boardMat);
      const board = new THREE.Mesh(boardGeo, boardMat);
      board.position.y = 1.55;
      board.userData = { targetId: i };
      root.add(board);

      const bullMat = new THREE.MeshStandardMaterial({
        color: 0x71201a,
        roughness: 0.7,
        emissive: 0xff2020,
        emissiveIntensity: 0,
      });
      this.disposables.push(bullMat);
      const bull = new THREE.Mesh(bullGeo, bullMat);
      bull.position.set(0, 1.55, 0.004);
      bull.userData = { targetId: i, zone: "head" };
      root.add(bull);

      scene.add(root);
      this.roots.push(root);
      this.targets.push({ id: i, root, boardMat, hp: TARGET_HP, state: "up", t: 0, flash: 0 });
      this.hitMeshes.push(board, bull);
    });
  }

  /** Estado legível para depuração/testes. */
  get states(): Array<{ id: number; hp: number; state: string }> {
    return this.targets.map((t) => ({ id: t.id, hp: t.hp, state: t.state }));
  }

  /** Aplica dano; null se o alvo não está de pé. */
  applyHit(mesh: THREE.Mesh, damage: number, _headshot: boolean): { killed: boolean } | null {
    const id = mesh.userData["targetId"];
    if (typeof id !== "number") return null;
    const t = this.targets[id];
    if (!t || t.state !== "up") return null;
    t.hp -= damage;
    t.flash = 0.12;
    const killed = t.hp <= 0;
    if (killed) {
      t.state = "falling";
      t.t = 0;
    }
    return { killed };
  }

  update(dt: number): void {
    for (const t of this.targets) {
      // flash de dano
      if (t.flash > 0) {
        t.flash = Math.max(0, t.flash - dt);
        const k = t.flash / 0.12;
        t.boardMat.emissiveIntensity = k * 0.9;
      } else if (t.boardMat.emissiveIntensity !== 0) {
        t.boardMat.emissiveIntensity = 0;
      }

      if (t.state === "falling") {
        t.t += dt;
        const k = Math.min(1, t.t / FALL_TIME);
        t.root.rotation.x = -easeIn(k) * FALL_ANGLE;
        if (k >= 1) {
          t.state = "down";
          t.t = 0;
        }
      } else if (t.state === "down") {
        t.t += dt;
        if (t.t >= RESPAWN_DELAY) {
          t.state = "rising";
          t.t = 0;
        }
      } else if (t.state === "rising") {
        t.t += dt;
        const k = Math.min(1, t.t / RISE_TIME);
        t.root.rotation.x = -easeOut(1 - k) * FALL_ANGLE;
        if (k >= 1) {
          t.root.rotation.x = 0;
          t.state = "up";
          t.hp = TARGET_HP;
        }
      }
    }
  }

  dispose(): void {
    for (const root of this.roots) this.scene.remove(root);
    this.roots = [];
    this.targets = [];
    this.hitMeshes.length = 0;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
