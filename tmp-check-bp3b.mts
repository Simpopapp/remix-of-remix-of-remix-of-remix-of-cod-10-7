/* Temp check: names of meshes under Brick_Plain_3 vs its ancestors. */
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const asset = JSON.parse(await readFile("src/assets/kit_brick.asset.json", "utf8"));
const res = await fetch(`http://localhost:8080${asset.url}`);
const ab = new Uint8Array(await res.arrayBuffer());
const scene = (await new GLTFLoader().parseAsync(ab.buffer as ArrayBuffer, "")).scene;

scene.traverse((o: THREE.Object3D) => {
  if (!(o as THREE.Mesh).isMesh) return;
  const chain: string[] = [];
  let cur: THREE.Object3D | null = o;
  while (cur) {
    chain.push(cur.name || "(anon)");
    cur = cur.parent;
  }
  if (chain.some((n) => n === "Brick_Plain_3" || n === "Brick_Plain_3_noWear")) {
    console.log("mesh:", o.name, "| chain:", chain.join(" < "));
  }
});
