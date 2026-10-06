/* Temp check: merge for Brick_Plain_3 (meshes only). */
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const asset = JSON.parse(await readFile("src/assets/kit_brick.asset.json", "utf8"));
const res = await fetch(`http://localhost:8080${asset.url}`);
const ab = new Uint8Array(await res.arrayBuffer());
const scene = (await new GLTFLoader().parseAsync(ab.buffer as ArrayBuffer, "")).scene;
scene.updateMatrixWorld(true);

const byMat = new Map<string, THREE.BufferGeometry[]>();
scene.traverse((o: THREE.Object3D) => {
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh || !mesh.geometry) return;
  const chain: string[] = [];
  let cur: THREE.Object3D | null = o;
  while (cur) {
    chain.push(cur.name || "(anon)");
    cur = cur.parent;
  }
  if (!chain.includes("Brick_Plain_3")) return;
  const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)!;
  const geo = mesh.geometry.clone();
  if (Array.isArray(mesh.material)) geo.clearGroups();
  geo.applyMatrix4(mesh.matrixWorld);
  const list = byMat.get(mat.name) ?? [];
  list.push(geo);
  byMat.set(mat.name, list);
  console.log("mesh:", mesh.name, "mat:", mat.name, "attrs:", Object.keys(geo.attributes).join(","), "index:", !!geo.index, "verts:", geo.attributes.position?.count);
});
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
