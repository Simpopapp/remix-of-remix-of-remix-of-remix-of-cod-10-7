import * as THREE from "three";

/**
 * LUT de color grading "teal & orange militar" (PRD v2 RM-01).
 * O PNG em /luts/ é uma fatia 2D de 32×32 × 32 fatias (layout padrão de LUT 3D);
 * aqui ele é decodificado para uma Data3DTexture consumida pelo LUTPass.
 */
const SIZE = 32;

export async function loadLut3D(
  url = "/luts/military_teal_orange.png",
): Promise<THREE.Data3DTexture> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar LUT: ${url}`));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = SIZE * SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível para decodificar a LUT");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, SIZE * SIZE, SIZE).data;

  const rgba = new Uint8Array(SIZE * SIZE * SIZE * 4);
  for (let b = 0; b < SIZE; b++) {
    for (let g = 0; g < SIZE; g++) {
      for (let r = 0; r < SIZE; r++) {
        const src = (g * SIZE * SIZE + b * SIZE + r) * 4;
        const dst = (r + g * SIZE + b * SIZE * SIZE) * 4;
        rgba[dst] = data[src]!;
        rgba[dst + 1] = data[src + 1]!;
        rgba[dst + 2] = data[src + 2]!;
        rgba[dst + 3] = 255;
      }
    }
  }

  const tex = new THREE.Data3DTexture(rgba, SIZE, SIZE, SIZE);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
