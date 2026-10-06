/* Temp check: full extraction simulation, list merge failures per module. */
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KIT_MODULES, type KitGroup } from "./src/game/data/kitManifest";

const norm = (attr: THREE.BufferAttribute) => {
  const flat = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++)
    for (let c = 0; c < attr.itemSize; c++) flat[i * attr.itemSize + c] = attr.getComponent(i, c);
  return new THREE.Float32BufferAttribute(flat, attr.itemSize);
};

async function load(p: string): Promise<THREE.Group> {
  const buf = await readFile(p);
  return (await new GLTFLoader().parseAsync(buf.slice().buffer as ArrayBuffer, "")).scene;
}
const groups: Array<[KitGroup, string]> = [
  ["kit_brick", "remote"],
  ["kit_trim", "public/game-assets/kit/kit_trim.glb"],
  ["kit_stone", "public/game-assets/kit/kit_stone.glb"],
  ["kit_street", "public/game-assets/kit/kit_street.glb"],
  ["kit_roof", "public/game-assets/kit/kit_roof.glb"],
];
for (const [g, path] of groups) {
  let scene: THREE.Group;
  if (path === "remote") {
    const asset = JSON.parse(await readFile("src/assets/kit_brick.asset.json", "utf8"));
    const res = await fetch(`http://localhost:8080${asset.url}`);
    scene = (await new GLTFLoader().parseAsync(new Uint8Array(await res.arrayBuffer()).buffer as ArrayBuffer, "")).scene;
  } else scene = await load(path);
  scene.updateMatrixWorld(true);
  const valid = new Set(Object.keys(KIT_MODULES[g]));
  const acc = new Map<string, Map<string, THREE.BufferGeometry[]>>();
  scene.traverse((o: THREE.Object3D) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    let cur: THREE.Object3D | null = o;
    let mod = "";
    while (cur) {
      if (cur.name && valid.has(cur.name)) { mod = cur.name; break; }
      cur = cur.parent;
    }
    if (!mod) return;
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)!;
    const geo = mesh.geometry.clone();
    if (Array.isArray(mesh.material)) geo.clearGroups();
    geo.applyMatrix4(mesh.matrixWorld);
    const c = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (c) geo.setAttribute("color", norm(c));
    const byMat = acc.get(mod) ?? new Map();
    const list = byMat.get(mat.name) ?? [];
    list.push(geo);
    byMat.set(mat.name, list);
    acc.set(mod, byMat);
  });
  for (const [mod, byMat] of acc) {
    for (const [mat, geos] of byMat) {
      if (geos.length < 2) continue;
      let merged: THREE.BufferGeometry | null = null;
      try { merged = mergeGeometries(geos, false); } catch { /* ignore */ }
      if (!merged) {
        const a = geos[0]!, b = geos[1]!;
        console.log(`${g}/${mod} [${mat}]: FAIL n=${geos.length} | A(${Object.keys(a.attributes).join(",")}) pos:${(a.attributes.position as THREE.BufferAttribute).array.constructor.name} | B(${Object.keys(b.attributes).join(",")}) pos:${(b.attributes.position as THREE.BufferAttribute).array.constructor.name}`);
      }
    }
  }
}
console.log("done");
