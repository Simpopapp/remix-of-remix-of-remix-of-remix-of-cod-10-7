import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { loadGLB } from "@/game/assets/AssetLoader";
import kitBrickAsset from "@/assets/kit_brick.asset.json";
import { KIT_MODULES, type KitGroup } from "@/game/data/kitManifest";
import {
  CITY_PROPS,
  KIT_PLACEMENTS,
  REBAR,
  RUBBLE_PILES,
  SCORCH_DECALS,
  isFlatModule,
  type ModulePlacement,
} from "@/game/data/ruins";
import { COMPOUND_PROPS, PROP_DIMS, type PropKind } from "@/game/data/props";
import { heightAt } from "@/game/world/terrainField";

/**
 * Cidade destruída (Fase V3) — colocação assíncrona do kit modular PBR.
 * Construída APÓS o build síncrono (Level.ts): os GLB entram por loadGLB
 * (fila do AssetLoader, cache) e as peças são instanciadas por módulo
 * (InstancedMesh por módulo do kit). Colliders já foram publicados por
 * getLevelColliders() de forma síncrona via getRuinColliders()/getPropColliders()
 * — a chegada da malha nunca muda a física.
 *
 * Todo o módulo é browser-only: nenhum acesso a window/document fora do
 * ciclo de vida do componente.
 */

const KIT_URLS: Record<KitGroup, string> = {
  kit_brick: kitBrickAsset.url,
  kit_trim: "/game-assets/kit/kit_trim.glb",
  kit_stone: "/game-assets/kit/kit_stone.glb",
  kit_street: "/game-assets/kit/kit_street.glb",
  kit_roof: "/game-assets/kit/kit_roof.glb",
};

const PROP_URLS: Record<"car" | "barrier" | "lamp" | "crate", string> = {
  car: "/game-assets/props/covered_car.glb",
  barrier: "/game-assets/props/concrete_road_barrier.glb",
  lamp: "/game-assets/props/street_lamp_01.glb",
  crate: "/game-assets/props/old_military_crate.glb",
};

interface ModuleTemplate {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

const RNG_MULT = 0x6d2b79f5;
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Textura de queimado (radial, com granulação) para decals de fuligem. */
function makeScorchTexture(size = 256): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.05,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, "rgba(8, 6, 4, 0.92)");
  grad.addColorStop(0.45, "rgba(16, 12, 8, 0.6)");
  grad.addColorStop(0.8, "rgba(20, 16, 10, 0.2)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // fuligem granulada
  const rng = mulberry32(1234);
  for (let i = 0; i < 900; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * size * 0.48;
    ctx.fillStyle = `rgba(10, 8, 6, ${0.05 + rng() * 0.12})`;
    ctx.fillRect(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface RuinedCity {
  ready: Promise<void>;
  dispose(): void;
}

/**
 * Constrói a cidade destruída sobre a cena já montada. As malhas chegam
 * de forma assíncrona; colliders/física ficam inalterados (publicados no
 * build síncrono). Dispose é seguro antes mesmo de ready concluir.
 */
export function createRuinedCity(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  hitMeshes?: THREE.Mesh[],
  disposables?: Array<{ dispose(): void }>,
): RuinedCity {
  const group = new THREE.Group();
  group.name = "ruined_city";
  void renderer;

  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const propProtos = new Map<string, THREE.Object3D>();
  let disposed = false;
  let lampMaterial: THREE.MeshStandardMaterial | null = null;

  const place = (mesh: THREE.Object3D): void => {
    mesh.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).castShadow = true;
        (o as THREE.Mesh).receiveShadow = true;
        hitMeshes?.push(o as THREE.Mesh);
      }
    });
    group.add(mesh);
  };

  // ---------- módulos do kit: instancing por módulo ----------
  const buildKit = (): void => {
    const instancer = new Map<string, { template: ModuleTemplate; matrices: THREE.Matrix4[] }>();
    const m4 = new THREE.Matrix4();
    for (const p of KIT_PLACEMENTS) {
      const a = KIT_MODULES[p.g]?.[p.m];
      const parts = templates.get(`${p.g}/${p.m}`);
      if (!a || !parts) {
        console.warn(`[ruins] módulo ausente no GLB: ${p.g}/${p.m}`);
        continue;
      }
      const s = p.s ?? 1;
      const cx = (a.min[0] + a.max[0]) / 2;
      const cz = (a.min[2] + a.max[2]) / 2;
      const ay = isFlatModule(p.m) ? a.max[1] : a.min[1];
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(p.tilt?.[0] ?? 0, p.ry ?? 0, p.tilt?.[1] ?? 0, "YXZ"),
      );
      // world = T(P+off+drop) · T(anchor) · R · S · T(−anchor)
      m4.identity();
      m4.multiply(
        new THREE.Matrix4().makeTranslation(
          p.x + (p.off?.[0] ?? 0),
          p.y + (p.drop ?? 0),
          p.z + (p.off?.[1] ?? 0),
        ),
      );
      m4.multiply(new THREE.Matrix4().makeTranslation(cx, ay, cz));
      m4.multiply(new THREE.Matrix4().compose(new THREE.Vector3(), q, new THREE.Vector3(s, s, s)));
      m4.multiply(new THREE.Matrix4().makeTranslation(-cx, -ay, -cz));
      parts.forEach((template, pi) => {
        const key = `${p.g}/${p.m}#${pi}`;
        const entry = instancer.get(key) ?? { template, matrices: [] };
        entry.matrices.push(m4.clone());
        instancer.set(key, entry);
      });
    }

    for (const [key, { template, matrices }] of instancer) {
      const inst = new THREE.InstancedMesh(template.geometry, template.material, matrices.length);
      for (let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i]!);
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      hitMeshes?.push(inst);
      group.add(inst);
    }
  };

  // ---------- entulho instanciado (montes determinísticos) ----------
  const buildRubble = (): void => {
    const modulesByKind: Record<"brick" | "concrete" | "mixed", string[]> = {
      brick: ["kit_brick/Brick_Plain_1", "kit_brick/Brick_BottomTrim", "kit_brick/Brick_HalfTrim"],
      concrete: ["kit_stone/Floor_Inset", "kit_stone/Cornice_Metal_Center", "kit_stone/Floor_2x2"],
      mixed: [
        "kit_brick/Brick_Plain_1",
        "kit_stone/Floor_Inset",
        "kit_stone/Cornice_Metal_Center",
        "kit_brick/Brick_HalfTrim",
      ],
    };
    for (const pile of RUBBLE_PILES) {
      const mods = modulesByKind[pile.kind];
      const rng = mulberry32(pile.seed);
      const perMod = Math.floor(pile.count / mods.length);
      for (const key of mods) {
        const parts = templates.get(key);
        if (!parts) continue;
        const matrices: THREE.Matrix4[] = [];
        for (let i = 0; i < perMod; i++) {
          const a = rng() * Math.PI * 2;
          const r = Math.sqrt(rng()) * pile.r;
          const x = pile.x + Math.cos(a) * r;
          const z = pile.z + Math.sin(a) * r;
          const y = (pile.y ?? heightAt(x, z)) + rng() * 0.12;
          const s = 0.16 + rng() * 0.34;
          const q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5, "YXZ"),
          );
          const m = new THREE.Matrix4().compose(
            new THREE.Vector3(x, y, z),
            q,
            new THREE.Vector3(s, s, s),
          );
          matrices.push(m);
        }
        for (const template of parts) {
          const inst = new THREE.InstancedMesh(
            template.geometry,
            template.material,
            matrices.length,
          );
          for (let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i]!);
          inst.instanceMatrix.needsUpdate = true;
          inst.castShadow = true;
          inst.receiveShadow = true;
          hitMeshes?.push(inst);
          group.add(inst);
        }
      }
    }
  };

  // ---------- decals de fuligem ----------
  const buildDecals = (): void => {
    const scorchTex = makeScorchTexture();
    textures.push(scorchTex);
    const mat = new THREE.MeshStandardMaterial({
      map: scorchTex,
      transparent: true,
      depthWrite: false,
      roughness: 1,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    mats.push(mat);
    const geo = new THREE.PlaneGeometry(1, 1);
    geos.push(geo);
    for (const d of SCORCH_DECALS) {
      const mesh = new THREE.Mesh(geo, mat);
      const y = d.vertical ? (d.y ?? 1.5) : heightAt(d.x, d.z) + 0.03;
      mesh.position.set(d.x, y, d.z);
      mesh.rotation.order = "YXZ";
      if (d.vertical) {
        mesh.rotation.y = d.ry ?? 0;
        mesh.scale.set(d.w, d.h, 1);
      } else {
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.y = d.ry ?? 0;
        mesh.scale.set(d.w, d.h, 1);
      }
      mesh.renderOrder = 1;
      group.add(mesh);
    }
    // vergalhões expostos nas lajes quebradas
    const rebarGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.8, 5);
    const rebarMat = new THREE.MeshStandardMaterial({
      color: 0x5a4632,
      roughness: 0.6,
      metalness: 0.7,
    });
    geos.push(rebarGeo);
    mats.push(rebarMat);
    const rebar = new THREE.InstancedMesh(rebarGeo, rebarMat, REBAR.length);
    const rng = mulberry32(777);
    for (let i = 0; i < REBAR.length; i++) {
      const [x, y, z, len] = REBAR[i]!;
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler((rng() - 0.5) * 0.8, rng() * Math.PI, (rng() - 0.5) * 0.8, "YXZ"),
      );
      rebar.setMatrixAt(
        i,
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, z),
          q,
          new THREE.Vector3(1, len / 0.8, 1),
        ),
      );
    }
    rebar.instanceMatrix.needsUpdate = true;
    rebar.castShadow = true;
    group.add(rebar);
  };

  // ---------- props GLB (pátio + cidade) + módulos-prop do kit ----------
  const buildProps = (): void => {
    // módulos-prop do kit (planter, AC unit): mesh único ancorado pela base
    const placeKitProp = (key: string, x: number, z: number, y: number, ry: number): void => {
      const parts = templates.get(key);
      if (!parts) {
        console.warn(`[ruins] módulo-prop ausente no GLB: ${key}`);
        return;
      }
      const holder = new THREE.Group();
      for (const { geometry, material } of parts) {
        holder.add(new THREE.Mesh(geometry, material));
      }
      holder.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(holder);
      const cx = (bb.min.x + bb.max.x) / 2;
      const cz = (bb.min.z + bb.max.z) / 2;
      const ay = bb.min.y;
      holder.applyMatrix4(
        new THREE.Matrix4()
          .makeTranslation(x, y, z)
          .multiply(new THREE.Matrix4().makeTranslation(cx, ay, cz))
          .multiply(new THREE.Matrix4().makeRotationY(ry))
          .multiply(new THREE.Matrix4().makeTranslation(-cx, -ay, -cz)),
      );
      place(holder);
    };

    const placeProp = (
      kind: PropKind | "lamp" | "acunit",
      x: number,
      z: number,
      ry: number,
      y: number,
      tilt?: [number, number],
      stack = 1,
      light?: boolean,
      intensity?: number,
    ): void => {
      // canteiro/AC unit são módulos do kit, não GLB de prop
      if (kind === "planter") {
        placeKitProp("kit_stone/Prop_Planter_Single", x, z, y, ry);
        return;
      }
      if (kind === "acunit") {
        placeKitProp("kit_trim/Prop_ACUnit", x, z, y, ry);
        return;
      }
      const proto = propProtos.get(kind);
      if (!proto) return;
      const d = kind === "lamp" ? { sx: 0.7, sy: 3.87, sz: 0.38, yMin: 0 } : PROP_DIMS[kind];
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(tilt?.[0] ?? 0, ry, tilt?.[1] ?? 0, "YXZ"),
      );
      const n = kind === "crate" ? Math.max(1, stack) : 1;
      for (let i = 0; i < n; i++) {
        const inst = proto.clone();
        inst.position.set(x, y - d.yMin + i * d.sy, z);
        if (i > 0) inst.rotation.y = ry + ((i * 37) % 10) * 0.02;
        else inst.quaternion.copy(q);
        place(inst);
        if (kind === "lamp" && light && i === 0) {
          const bulb = new THREE.PointLight(0xffc98a, intensity ?? 40, 20, 2);
          bulb.position.set(0, 3.45, 0);
          inst.add(bulb);
        }
      }
    };

    for (const p of COMPOUND_PROPS) {
      placeProp(p.kind, p.x, p.z, p.ry, p.y ?? 0, p.tilt, p.stack);
    }
    for (const p of CITY_PROPS) {
      placeProp(
        p.kind,
        p.x,
        p.z,
        p.ry,
        p.y ?? heightAt(p.x, p.z),
        p.tilt,
        p.stack,
        p.light,
        p.intensity,
      );
    }
    if (lampMaterial) {
      lampMaterial.emissive = new THREE.Color(0xffd9a0);
      lampMaterial.emissiveIntensity = 3;
    }
  };

  // ---------- carregamento ----------
  const templates = new Map<string, ModuleTemplate[]>();
  const ready = (async () => {
    const kitGltfs = await Promise.all(
      (Object.keys(KIT_URLS) as KitGroup[]).map(async (g) => ({
        g,
        gltf: await loadGLB(KIT_URLS[g]),
      })),
    );
    const propGltfs = await Promise.all(
      (Object.keys(PROP_URLS) as Array<keyof typeof PROP_URLS>).map(async (k) => ({
        k,
        gltf: await loadGLB(PROP_URLS[k]),
      })),
    );

    if (disposed) return;

    // Módulos: o nome canônico está em algum nó da cadeia (mesh ou ancestral),
    // mas meshes têm nomes auto-gerados (Plane235…). Resolve aceitando o
    // primeiro nome da cadeia que exista no manifesto do grupo; sub-meshes do
    // mesmo módulo/material são mescladas em uma única geometria.
    const nearestModule = (o: THREE.Object3D, valid: Set<string>): string => {
      let cur: THREE.Object3D | null = o;
      while (cur) {
        if (cur.name && valid.has(cur.name)) return cur.name;
        cur = cur.parent;
      }
      return "";
    };
    for (const { g, gltf } of kitGltfs) {
      gltf.scene.updateMatrixWorld(true);
      const valid = new Set(Object.keys(KIT_MODULES[g]));
      const acc = new Map<string, Map<THREE.Material, THREE.BufferGeometry[]>>();
      gltf.scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const modName = nearestModule(node, valid);
        if (!modName) return;
        const key = `${g}/${modName}`;
        const byMat = acc.get(key) ?? new Map<THREE.Material, THREE.BufferGeometry[]>();
        const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)!;
        const geo = mesh.geometry.clone();
        if (Array.isArray(mesh.material)) geo.clearGroups();
        geo.applyMatrix4(mesh.matrixWorld);
        const list = byMat.get(mat) ?? [];
        list.push(geo);
        byMat.set(mat, list);
        acc.set(key, byMat);
      });
      for (const [key, byMat] of acc) {
        if (templates.has(key)) continue;
        const parts: ModuleTemplate[] = [];
        for (const [mat, geos] of byMat) {
          const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
          if (!merged) continue;
          for (const geo of geos) if (geo !== merged) geo.dispose();
          geos.push(merged);
          parts.push({ geometry: merged, material: mat });
        }
        if (parts.length) templates.set(key, parts);
      }
    }
    for (const { k, gltf } of propGltfs) {
      gltf.scene.updateMatrixWorld(true);
      if (k === "lamp") {
        gltf.scene.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat && mat.name === "street_lamp_01_bulb") lampMaterial = mat;
        });
      }
      propProtos.set(k, gltf.scene);
    }

    buildKit();
    buildRubble();
    buildDecals();
    buildProps();
    scene.add(group);
  })();

  ready.catch((err: unknown) => {
    console.warn("[ruins] carga assíncrona falhou (cidade omitida)", err);
  });

  return {
    ready,
    dispose(): void {
      disposed = true;
      group.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of textures) t.dispose();
      // geometrias/materiais dos protótipos de props (compartilhados pelos clones)
      for (const proto of propProtos.values()) {
        proto.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry?.dispose();
            const mat = mesh.material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else mat?.dispose();
          }
        });
      }
    },
  };
}
