/* Temp check: Brick_Plain_3 extraction + merge. */
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const asset = JSON.parse(await readFile("src/assets/kit_brick.asset.json", "utf8"));
const res = await fetch(`http://localhost:8080${asset.url}`);
const ab = new Uint8Array(await res.arrayBuffer());
const scene = (await new GLTFLoader().parseAsync(ab.buffer as ArrayBuffer, "")).scene;
scene.updateMatrixWorld(true);

const hit: THREE.Mesh[] = [];
scene.traverse((o: THREE.Object3D) => {
  let cur: THREE.Object3D | null = o;
  while (cur) {
    if (cur.name === "Brick_Plain_3") {
      hit.push(o as THREE.Mesh);
      return;
    }
    cur = cur.parent;
  }
});
console.log("meshes under Brick_Plain_3:", hit.length);
const byMat = new Map<string, THREE.BufferGeometry[]>();
for (const m of hit) {
  const mat = (Array.isArray(m.material) ? m.material[0] : m.material)!;
  const geo = m.geometry.clone();
  if (Array.isArray(m.material)) geo.clearGroups();
  geo.applyMatrix4(m.matrixWorld);
  const list = byMat.get(mat.name) ?? [];
  list.push(geo);
  byMat.set(mat.name, list);
  console.log("  mesh:", m.name, "mat:", mat.name, "attrs:", Object.keys(geo.attributes).join(","), "index:", !!geo.index);
}
for (const [mat, geos] of byMat) {
  if (geos.length === 1) {
    console.log(mat, "single geo OK");
    continue;
  }
  let merged: THREE.BufferGeometry | null = null;
  try {
    merged = mergeGeometries(geos, false);
  } catch (e) {
    console.log(mat, "merge threw:", e);
  }
  console.log(mat, "merge:", merged ? "OK" : "NULL");
}
