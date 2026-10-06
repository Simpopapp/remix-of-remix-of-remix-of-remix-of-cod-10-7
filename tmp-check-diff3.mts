/* Temp check v3: diff all pairs. */
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const asset = JSON.parse(await readFile("src/assets/kit_brick.asset.json", "utf8"));
const res = await fetch(`http://localhost:8080${asset.url}`);
const scene = (await new GLTFLoader().parseAsync(new Uint8Array(await res.arrayBuffer()).buffer as ArrayBuffer, "")).scene;
scene.updateMatrixWorld(true);

const target = "Brick_TopTrim_90Angle_R";
const geos: THREE.BufferGeometry[] = [];
const names: string[] = [];
scene.traverse((o: THREE.Object3D) => {
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh || !mesh.geometry) return;
  let cur: THREE.Object3D | null = o;
  let hit = false;
  while (cur) { if (cur.name === target) { hit = true; break; } cur = cur.parent; }
  if (!hit) return;
  geos.push(mesh.geometry.clone());
  names.push(mesh.name);
});
for (let i = 1; i < geos.length; i++) {
  const a = geos[0]!, b = geos[i]!;
  const keys = new Set([...Object.keys(a.attributes), ...Object.keys(b.attributes)]);
  for (const k of keys) {
    const aa = a.getAttribute(k) as THREE.BufferAttribute | undefined;
    const bb = b.getAttribute(k) as THREE.BufferAttribute | undefined;
    if (!aa || !bb) { console.log(names[i], k, "MISSING on", !aa ? names[0] : names[i]); continue; }
    if (aa.gpuType !== bb.gpuType) console.log(names[i], k, "gpuType", aa.gpuType, "/", bb.gpuType);
    if (aa.itemSize !== bb.itemSize) console.log(names[i], k, "itemSize", aa.itemSize, "/", bb.itemSize);
    if (aa.array.constructor.name !== bb.array.constructor.name) console.log(names[i], k, "ctor", aa.array.constructor.name, "/", bb.array.constructor.name);
  }
}
console.log("geos:", geos.length, names.join(","));
