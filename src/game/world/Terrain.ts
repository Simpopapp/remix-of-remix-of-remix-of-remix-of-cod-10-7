import * as THREE from "three";
import { heightAt, terrainWeights, TERRAIN_SEG, TERRAIN_SIZE } from "./terrainField";
import { loadTexture } from "@/game/assets/AssetLoader";

/**
 * Malha do terreno com relevo (Fase V2, PRD RM-02) — browser-only.
 * - geometria: plano 120×120 m com 256×256 segmentos, alturas vindas de
 *   `heightAt()` (mesma função usada por Player/IA — física e visual coerentes);
 * - splat de 4 camadas PBR fotográficas (asfalto/terra/cascalho/lama) via
 *   máscara RGBA gerada por `terrainWeights()` e injetada no shader padrão
 *   (albedo + roughness por camada, mesclados pelos pesos).
 */

/** IDs das camadas: 0 = asfalto (alpha), 1 = terra (R), 2 = cascalho (G), 3 = lama (B). */
const LAYER_IDS = ["asphalt", "dirt", "gravel", "brown_mud"] as const;
const LAYER_REPEAT = 48; // ~2.5 m por tile sobre 120 m

function buildSplatTexture(): THREE.DataTexture {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const half = TERRAIN_SIZE / 2;
  const step = TERRAIN_SIZE / S;
  for (let j = 0; j < S; j++) {
    const z = half - (j + 0.5) * step;
    for (let i = 0; i < S; i++) {
      const x = -half + (i + 0.5) * step;
      const w = terrainWeights(x, z);
      const k = (j * S + i) * 4;
      data[k] = Math.round(w.dirt * 255);
      data[k + 1] = Math.round(w.gravel * 255);
      data[k + 2] = Math.round(w.mud * 255);
      data[k + 3] = Math.round(w.asphalt * 255);
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function createTerrain(renderer: THREE.WebGLRenderer): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEG, TERRAIN_SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i)!, pos.getZ(i)!));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const albedo: THREE.Texture[] = [];
  const rough: THREE.Texture[] = [];
  for (const id of LAYER_IDS) {
    albedo.push(loadTexture(`/game-assets/textures/${id}/Diffuse.jpg`, true, 1));
    rough.push(loadTexture(`/game-assets/textures/${id}/Rough.jpg`, false, 1));
  }
  const splat = buildSplatTexture();

  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  mat.defines = { USE_UV: "" };
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const t of [...albedo, ...rough]) t.anisotropy = aniso;
  splat.anisotropy = 4;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms["uSplat"] = { value: splat };
    shader.uniforms["uScale"] = { value: new THREE.Vector2(LAYER_REPEAT, LAYER_REPEAT) };
    for (let i = 0; i < 4; i++) {
      shader.uniforms[`uAlb${i}`] = { value: albedo[i] };
      shader.uniforms[`uRgh${i}`] = { value: rough[i] };
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D uSplat;
uniform sampler2D uAlb0;
uniform sampler2D uAlb1;
uniform sampler2D uAlb2;
uniform sampler2D uAlb3;
uniform sampler2D uRgh0;
uniform sampler2D uRgh1;
uniform sampler2D uRgh2;
uniform sampler2D uRgh3;
uniform vec2 uScale;
float vTerrRough = 1.0;`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
    vec4 m = texture2D(uSplat, vUv);
    m /= max(m.r + m.g + m.b + m.a, 0.001);
    vec2 suv = vUv * uScale;
    vec3 alb = m.a * texture2D(uAlb0, suv).rgb
             + m.r * texture2D(uAlb1, suv).rgb
             + m.g * texture2D(uAlb2, suv).rgb
             + m.b * texture2D(uAlb3, suv).rgb;
    float rgh = m.a * texture2D(uRgh0, suv).r
              + m.r * texture2D(uRgh1, suv).r
              + m.g * texture2D(uRgh2, suv).r
              + m.b * texture2D(uRgh3, suv).r;
    diffuseColor.rgb *= alb;
    vTerrRough = clamp(rgh, 0.04, 1.0);
  `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
  roughnessFactor = vTerrRough;`,
      );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = "terrain";
  return mesh;
}
