import * as THREE from "three";
import {
  makeConcreteTexture,
  makeCorrugatedTexture,
  makeGroundTexture,
  makeSteelTexture,
  makeWoodTexture,
} from "./textures";

/**
 * Cena de validação da Fase 1: complexo industrial noturno.
 * Atmosfera cinematográfica — lua fria, luzes práticas quentes, névoa, poeira.
 */

export interface SceneController {
  update(time: number, delta: number): void;
  dispose(): void;
}

const FOG_COLOR = 0x101e2b;

/** Contêineres: x, z, rotY, y (centro), índice de material. */
export const CONTAINER_SPECS: Array<[number, number, number, number, number]> = [
  [-10, 4, 0.15, 1.3, 0],
  [-10.5, 4.6, 0.12, 3.9, 1],
  [9, -6, -0.3, 1.3, 2],
  [8, 12, 0.05, 1.3, 1],
  [-16, -10, 1.1, 1.3, 3],
  [14, -14, 0.6, 1.3, 0],
  [0, -16, 0.0, 1.3, 2],
];

/** Caixotes de madeira: x, z, pilha (0 = chão, 1 = sobre a primeira). */
export const CRATE_SPECS: Array<[number, number, number]> = [
  [5, 2, 0],
  [5.4, 3.1, 0],
  [5.2, 2.5, 1],
  [-6, -8, 0],
  [-6.2, -6.8, 0],
  [12, 6, 0],
  [12.1, 7.2, 0],
  [12.05, 6.6, 1],
  [-13, 8, 0],
  [2, -10, 0],
  [3.1, -9.8, 0],
];

export interface BoxCollider {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * Colliders AABB do nível (dados puros, sem THREE). Contêineres rotacionados
 * usam o AABB conservador da caixa orientada; caixotes ignoram a rotação
 * aleatória (≤ 0.2 rad) e usam o cubo nominal.
 */
export function getValidationColliders(): BoxCollider[] {
  const colliders: BoxCollider[] = [];
  const hw = 3.05;
  const hh = 1.3;
  const hd = 1.22;
  for (const [x, z, rot, y] of CONTAINER_SPECS) {
    const c = Math.abs(Math.cos(rot));
    const s = Math.abs(Math.sin(rot));
    const ex = c * hw + s * hd;
    const ez = s * hw + c * hd;
    colliders.push({
      minX: x - ex,
      maxX: x + ex,
      minY: y - hh,
      maxY: y + hh,
      minZ: z - ez,
      maxZ: z + ez,
    });
  }
  for (const [x, z, stack] of CRATE_SPECS) {
    const centerY = 0.6 + stack * 1.22;
    colliders.push({
      minX: x - 0.6,
      maxX: x + 0.6,
      minY: centerY - 0.6,
      maxY: centerY + 0.6,
      minZ: z - 0.6,
      maxZ: z + 0.6,
    });
  }
  return colliders;
}

export function buildValidationScene(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  hitMeshes?: THREE.Mesh[],
): SceneController {
  const disposables: Array<{ dispose(): void }> = [];
  const animated: Array<(t: number, dt: number) => void> = [];

  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.016);

  // ---------- céu ----------
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
        // cores definidas em sRGB e convertidas p/ linear (o OutputPass espera linear)
        vec3 zenith = vec3(0.010, 0.020, 0.038);
        vec3 horizon = vec3(0.063, 0.118, 0.169);
        vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.55, h));
        // abaixo do horizonte escurece suavemente (sem borda dura)
        col = mix(col, horizon * 0.45, 1.0 - smoothstep(-0.25, 0.0, h));
        col = pow(col, vec3(2.2));
        // lua: disco + halo alongado na direção da luz (espaço linear)
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

  // ---------- piso ----------
  const groundGeo = new THREE.PlaneGeometry(300, 300);
  const groundTex = makeGroundTexture(512, 16);
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    roughness: 0.92,
    metalness: 0.0,
    color: 0x8a8f96,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  hitMeshes?.push(ground);
  disposables.push(groundGeo, groundMat, groundTex);

  // ---------- poça refletiva ----------
  const puddleGeo = new THREE.CircleGeometry(3.2, 32);
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x0d1a24,
    roughness: 0.06,
    metalness: 0.85,
  });
  const puddle = new THREE.Mesh(puddleGeo, puddleMat);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(-4, 0.02, 6);
  scene.add(puddle);
  disposables.push(puddleGeo, puddleMat);

  // ---------- contêineres ----------
  const containerGeo = new THREE.BoxGeometry(6.1, 2.6, 2.44);
  const containerMats = ["#6e3a2a", "#2b4a5e", "#3f5a40", "#6e3a2a"].map(
    (c) =>
      new THREE.MeshStandardMaterial({
        map: makeCorrugatedTexture(512, 2, c),
        roughness: 0.65,
        metalness: 0.35,
      }),
  );
  disposables.push(containerGeo, ...containerMats);
  for (const [x, z, rot, y, mi] of CONTAINER_SPECS) {
    const m = new THREE.Mesh(containerGeo, containerMats[mi]!);
    m.position.set(x, y, z);
    m.rotation.y = rot;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    hitMeshes?.push(m);
  }

  // ---------- caixotes de madeira ----------
  const crateGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const crateMat = new THREE.MeshStandardMaterial({
    map: makeWoodTexture(512, 1),
    roughness: 0.85,
    metalness: 0.0,
  });
  disposables.push(crateGeo, crateMat);
  for (const [x, z, stack] of CRATE_SPECS) {
    const m = new THREE.Mesh(crateGeo, crateMat);
    m.position.set(x, 0.6 + stack * 1.22, z);
    m.rotation.y = (Math.random() - 0.5) * 0.4;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    hitMeshes?.push(m);
  }

  // ---------- torre de vigia com holofote ----------
  const steelMat = new THREE.MeshStandardMaterial({
    map: makeSteelTexture(256, 2),
    roughness: 0.55,
    metalness: 0.7,
  });
  disposables.push(steelMat);
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
  const cabinGeo = new THREE.BoxGeometry(3, 1.6, 3);
  disposables.push(cabinGeo);
  const cabin = new THREE.Mesh(cabinGeo, steelMat);
  cabin.position.y = 10.8;
  cabin.castShadow = true;
  tower.add(cabin);
  hitMeshes?.push(cabin);

  const lampHousingGeo = new THREE.BoxGeometry(1.1, 0.7, 0.7);
  disposables.push(lampHousingGeo);
  const lampHousing = new THREE.Mesh(lampHousingGeo, steelMat);
  lampHousing.position.set(0, 10.1, 1.7);
  tower.add(lampHousing);

  const lampGlassGeo = new THREE.PlaneGeometry(0.9, 0.55);
  const lampGlassMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  disposables.push(lampGlassGeo, lampGlassMat);
  const lampGlass = new THREE.Mesh(lampGlassGeo, lampGlassMat);
  lampGlass.position.set(0, 10.1, 2.07);
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

  // ---------- farol vermelho (beacon) ----------
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

  // ---------- luzes práticas nas paredes dos contêineres ----------
  const practicalSpecs: Array<[number, number, number, number]> = [
    // x, y, z, intensidade
    [-7.9, 2.4, 4, 45],
    [7.4, 2.4, 11.2, 38],
    [-14.5, 2.4, -9, 34],
  ];
  for (const [x, y, z, intensity] of practicalSpecs) {
    const bulbGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0x8a6a44 });
    disposables.push(bulbGeo, bulbMat);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(x, y, z);
    scene.add(bulb);
    const light = new THREE.PointLight(0xffb26b, intensity, 22, 2);
    light.position.set(x, y, z);
    scene.add(light);
  }

  // ---------- iluminação global ----------
  const hemi = new THREE.HemisphereLight(0x22344f, 0x0b0c0e, 1.1);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0xa8c2e8, 2.2);
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

  // poeira no facho do holofote
  const dustCount = 350;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSpeed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 22;
    dustPositions[i * 3 + 1] = Math.random() * 9;
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 22;
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
      for (const d of disposables) {
        if (d && typeof d.dispose === "function") d.dispose();
      }
      scene.clear();
    },
  };
}

/** Movimento de câmera cinematográfico (crane lenta orbitando o pátio). */
export function cinematicCamera(
  camera: THREE.PerspectiveCamera,
  time: number,
  _delta: number,
): void {
  const angle = time * 0.045;
  const radius = 27;
  camera.position.set(
    Math.sin(angle) * radius,
    9.5 + Math.sin(time * 0.13) * 0.8,
    Math.cos(angle) * radius,
  );
  camera.lookAt(0, 2.5, 0);
}
