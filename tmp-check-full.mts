/* Temp check: full normalization merge test for the 2 failing modules. */
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const norm = (attr: THREE.BufferAttribute) => {
  const flat = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++)
    for (let c = 0; c < attr.itemSize; c++) flat[i * attr.itemSize + c] = attr.getComponent(i, c);
  return new THREE.Float32BufferAttribute(flat, attr.itemSize);
};

const asset = JSON.parse(await readFile("src/assets/kit_brick.asset.json", "utf8"));
const res = await fetch(`http://localhost:8080${asset.url}`);
const scene = (await new GLTFLoader().parseAsync(new Uint8Array(await res.arrayBuffer()).buffer as ArrayBuffer, "")).scene;
scene.updateMatrixWorld(true);

for (const target of ["Brick_TopTrim_90Angle_R", "Building_Small_1"]) {
  const geos: THREE.BufferGeometry[] = [];
  scene.traverse((o: THREE.Object3D) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    let cur: THREE.Object3D | null = o;
    let hit = false;
    while (cur) { if (cur.name === target) { hit = true; break; } cur = cur.parent; }
    if (!hit) return;
    const geo = mesh.geometry.clone();
    if (Array.isArray(mesh.material)) geo.clearGroups();
    geo.applyMatrix4(mesh.matrixWorld);
    for (const name of Object.keys(geo.attributes)) {
      const attr = geo.getAttribute(name) as THREE.BufferAttribute;
      if (attr.array.constructor === Float32Array && !attr.normalized) continue;
      geo.setAttribute(name, norm(attr));
      console.log(target, mesh.name, "normalized attr:", name, attr.array.constructor.name, "was normalized:", attr.normalized);
    }
    geos.push(geo);
  });
  console.log(target, "meshes:", geos.length);
  if (geos.length >= 2) {
    let merged: THREE.BufferGeometry | null = null;
    try { merged = mergeGeometries(geos, false); } catch (e) { console.log(target, "threw", e); }
    console.log(target, "merge:", merged ? "OK" : "NULL");
    if (!merged) {
      const a = geos[0]!, b = geos[1]!;
      for (const k of new Set([...Object.keys(a.attributes), ...Object.keys(b.attributes)])) {
        const aa = a.getAttribute(k) as THREE.BufferAttribute | undefined;
        const bb = b.getAttribute(k) as THREE.BufferAttribute | undefined;
        if (!aa || !bb) { console.log("  ", k, "missing on", !aa ? "A" : "B"); continue; }
        if (aa.gpuType !== bb.gpuType) console.log("  ", k, "gpuType", aa.gpuType, bb.gpuType);
        if (aa.normalized !== bb.normalized) console.log("  ", k, "normalized", aa.normalized, bb.normalized);
        if (aa.itemSize !== bb.itemSize) console.log("  ", k, "itemSize", aa.itemSize, bb.itemSize);
      }
    }
  }
}
