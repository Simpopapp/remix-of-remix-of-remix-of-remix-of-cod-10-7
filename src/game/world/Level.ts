import * as THREE from "three";
import { PRACTICAL_LIGHTS, WAREHOUSE_PILLARS } from "@/game/data/level1";
import { getPropColliders, type BoxCollider } from "@/game/data/props";
import { getRuinColliders } from "@/game/data/ruins";
import { applyEnvironment, disposeTextureCache, pbrMaterial } from "@/game/assets/AssetLoader";
import { makeSteelTexture } from "./textures";
import { createTerrain } from "./Terrain";
import { createRuinedCity } from "./RuinedCity";

/**
 * Nível completo da missão 1 (Fase 5) com a cidade destruída (Fase V3):
 * terreno com relevo, muralha/armazém em painéis do kit PBR, prédios
 * arruinados ao norte, props GLB e atmosfera teal & orange. Construído por
 * dados — o cenário procedural de caixas (contêineres, caixotes, barris,
 * muros, telhado, cabine) foi substituído pelo kit modular (RuinedCity).
 */

const FOG_COLOR = 0x0e1a26;

export interface SceneController {
  update(time: number, delta: number): void;
  dispose(): void;
}

/**
 * Colliders do nível completo: props GLB do pátio, painéis/paredes/prédios
 * do kit (derivados do manifesto por getRuinColliders) e pilares do armazém.
 * Publicado de forma síncrona — a chegada assíncrona das malhas nunca muda
 * a física.
 */
export function getLevelColliders(): BoxCollider[] {
  const colliders = [...getPropColliders(), ...getRuinColliders()];
  for (const [px, pz, radius] of WAREHOUSE_PILLARS) {
    colliders.push({
      minX: px - radius,
      maxX: px + radius,
      minY: 0,
      maxY: 8,
      minZ: pz - radius,
      maxZ: pz + radius,
    });
  }
  return colliders;
}

export function buildLevel(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  hitMeshes?: THREE.Mesh[],
): SceneController {
  const disposables: Array<{ dispose(): void }> = [];
  const animated: Array<(t: number, dt: number) => void> = [];

  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.014);

  // ---------- céu noturno com lua ----------
  const skyGeo = new THREE.SphereGeometry(400, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec3 dir = normalize(vWorld);
        float h = dir.y;
        vec3 zenith = vec3(0.010, 0.020, 0.038);
        vec3 horizon = vec3(0.063, 0.118, 0.169);
        vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.55, h));
        col = mix(col, horizon * 0.45, 1.0 - smoothstep(-0.25, 0.0, h));
        col = pow(col, vec3(2.2));
        vec3 moonDir = normalize(vec3(-0.55, 0.67, -0.31));
        float moonDot = max(dot(dir, moonDir), 0.0);
        float disc = smoothstep(0.9993, 0.9997, moonDot);
        float halo = pow(moonDot, 180.0) * 0.25 + pow(moonDot, 24.0) * 0.055;
        col += vec3(0.85, 0.92, 1.0) * (disc * 0.9 + halo);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  disposables.push(skyGeo, skyMat);

  // ---------- terreno com relevo (Fase V2, PRD RM-02) ----------
  // Relevo por heightfield + splat de 4 camadas PBR (asfalto/terra/cascalho/
  // lama); plano abaixo apenas cobre o horizonte distante, sem tingimento.
  const terrain = createTerrain(renderer);
  scene.add(terrain);
  hitMeshes?.push(terrain);
  const underGeo = new THREE.PlaneGeometry(600, 600);
  const underMat = pbrMaterial("asphalt", 90);
  const under = new THREE.Mesh(underGeo, underMat);
  under.rotation.x = -Math.PI / 2;
  under.position.y = -4.4;
  scene.add(under);
  hitMeshes?.push(under);
  const disposeEnv = applyEnvironment(renderer, scene);
  disposables.push(
    underGeo,
    underMat,
    terrain.geometry,
    terrain.material as THREE.Material,
    { dispose: disposeEnv },
    { dispose: disposeTextureCache },
  );

  // ---------- poças refletivas ----------
  const puddleGeo = new THREE.CircleGeometry(3.2, 32);
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x0d1a24,
    roughness: 0.06,
    metalness: 0.85,
  });
  disposables.push(puddleGeo, puddleMat);
  for (const [px, pz, s] of [
    [-4, 6, 1],
    [6, -14, 0.7],
    [-12, -14, 0.9],
  ] as const) {
    const puddle = new THREE.Mesh(puddleGeo, puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(px, 0.02, pz);
    puddle.scale.setScalar(s);
    scene.add(puddle);
  }

  // ---------- cidade destruída (Fase V3) ----------
  // Kit modular PBR (prédios, muralha, armazém, rua, entulho, decals) e
  // props GLB — carga assíncrona; colliders já publicados acima (dados).
  const ruinedCity = createRuinedCity(scene, renderer, hitMeshes);

  // ---------- pilares internos do armazém ----------
  const steelMat = new THREE.MeshStandardMaterial({
    map: makeSteelTexture(256, 2),
    roughness: 0.55,
    metalness: 0.7,
  });
  disposables.push(steelMat);
  const pillarGeo = new THREE.CylinderGeometry(0.28, 0.28, 8, 10);
  disposables.push(pillarGeo);
  for (const [px, pz, r, h] of WAREHOUSE_PILLARS) {
    const pillar = new THREE.Mesh(pillarGeo, steelMat);
    pillar.position.set(px, h / 2, pz);
    pillar.scale.set(r / 0.28, 1, r / 0.28);
    pillar.castShadow = true;
    scene.add(pillar);
    hitMeshes?.push(pillar);
  }

  // ---------- torre de vigia com holofote ----------
  const tower = new THREE.Group();
  const legGeo = new THREE.CylinderGeometry(0.12, 0.16, 10, 8);
  disposables.push(legGeo);
  for (const [lx, lz] of [
    [-1.4, -1.4],
    [1.4, -1.4],
    [-1.4, 1.4],
    [1.4, 1.4],
  ] as const) {
    const leg = new THREE.Mesh(legGeo, steelMat);
    leg.position.set(lx, 5, lz);
    leg.castShadow = true;
    tower.add(leg);
    hitMeshes?.push(leg);
  }

  // cabeçote do holofote: corpo cilíndrico (zero BoxGeometry de cenário)
  const lampHousingGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10);
  lampHousingGeo.rotateX(Math.PI / 2);
  disposables.push(lampHousingGeo);
  const lampHousing = new THREE.Mesh(lampHousingGeo, steelMat);
  lampHousing.position.set(0, 10.1, 1.7);
  tower.add(lampHousing);

  const lampGlassGeo = new THREE.PlaneGeometry(0.8, 0.8);
  const lampGlassMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  disposables.push(lampGlassGeo, lampGlassMat);
  const lampGlass = new THREE.Mesh(lampGlassGeo, lampGlassMat);
  lampGlass.position.set(0, 10.1, 2.26);
  tower.add(lampGlass);

  const searchLight = new THREE.SpotLight(0xffc27a, 900, 70, Math.PI / 7, 0.45, 2);
  searchLight.position.set(0, 10.1, 1.9);
  searchLight.castShadow = true;
  searchLight.shadow.mapSize.set(1024, 1024);
  searchLight.shadow.bias = -0.0004;
  const searchTarget = new THREE.Object3D();
  searchTarget.position.set(4, 0, 14);
  tower.add(searchTarget);
  searchLight.target = searchTarget;
  tower.add(searchLight);
  tower.position.set(22, 0, -10);
  scene.add(tower);
  animated.push((t) => {
    const a = t * 0.12;
    searchTarget.position.set(4 + Math.sin(a) * 10, 0, 14 + Math.cos(a * 0.7) * 8);
  });

  // ---------- faróis vermelhos (beacons) ----------
  const beaconGeo = new THREE.SphereGeometry(0.12, 12, 8);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  disposables.push(beaconGeo, beaconMat);
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.set(0, 11.9, 0);
  tower.add(beacon);
  animated.push((t) => {
    const pulse = Math.max(0, Math.sin(t * 2.4));
    beaconMat.color.setRGB(0.6 + pulse * 0.6, 0.08, 0.08);
  });
  const beaconLight = new THREE.PointLight(0xff3030, 0, 18, 2);
  beaconLight.position.copy(beacon.position);
  tower.add(beaconLight);
  animated.push((t) => {
    beaconLight.intensity = Math.max(0, Math.sin(t * 2.4)) * 30;
  });

  // beacon verde do ponto de extração (armazém)
  const extractGeo = new THREE.TorusGeometry(0.7, 0.06, 8, 24);
  const extractMat = new THREE.MeshBasicMaterial({ color: 0x35ff8a });
  disposables.push(extractGeo, extractMat);
  const extractRing = new THREE.Mesh(extractGeo, extractMat);
  extractRing.rotation.x = -Math.PI / 2;
  extractRing.position.set(0, 0.06, -27);
  scene.add(extractRing);
  animated.push((t) => {
    extractMat.color.setRGB(0.1 + Math.max(0, Math.sin(t * 3)) * 0.5, 1, 0.45);
  });

  // ---------- luzes práticas quentes ----------
  for (const [x, y, z, intensity] of PRACTICAL_LIGHTS) {
    const bulbGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0x8a6a44 });
    disposables.push(bulbGeo, bulbMat);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(x, y, z);
    scene.add(bulb);
    const light = new THREE.PointLight(0xffb26b, intensity, 24, 2);
    light.position.set(x, y, z);
    scene.add(light);
  }

  // ---------- iluminação global (teal & orange) ----------
  const hemi = new THREE.HemisphereLight(0x22405a, 0x0b0c0e, 1.2);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0xa8c2e8, 2.1);
  moon.position.set(-45, 55, -25);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -60;
  moon.shadow.camera.right = 60;
  moon.shadow.camera.top = 60;
  moon.shadow.camera.bottom = -60;
  moon.shadow.camera.far = 160;
  moon.shadow.bias = -0.0005;
  scene.add(moon);
  scene.add(moon.target);

  // rim light quente de preenchimento (laranja suave de um lado oposto à lua)
  const rim = new THREE.DirectionalLight(0xff9a4a, 0.35);
  rim.position.set(30, 18, 40);
  scene.add(rim);

  // ---------- poeira ----------
  const dustCount = 350;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSpeed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 60;
    dustPositions[i * 3 + 1] = Math.random() * 9;
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    dustSpeed[i] = 0.1 + Math.random() * 0.25;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xbfd4e6,
    size: 0.04,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);
  disposables.push(dustGeo, dustMat);
  animated.push((_t, dt) => {
    const pos = dustGeo.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < dustCount; i++) {
      const y = (arr[i * 3 + 1] ?? 0) + dustSpeed[i]! * dt;
      arr[i * 3 + 1] = y > 9.5 ? 0 : y;
    }
    pos.needsUpdate = true;
  });

  void renderer;

  return {
    update(time, delta) {
      for (const fn of animated) fn(time, delta);
    },
    dispose() {
      ruinedCity.dispose();
      for (const d of disposables) {
        if (d && typeof d.dispose === "function") d.dispose();
      }
      scene.clear();
    },
  };
}
