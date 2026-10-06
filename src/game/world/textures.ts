import * as THREE from "three";

/**
 * Texturas procedurais geradas em canvas 2D — evita assets pesados e mantém
 * o carregamento rápido. Todos os módulos aqui são browser-only.
 */

function createCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");
  return [canvas, ctx];
}

function grain(ctx: CanvasRenderingContext2D, size: number, amount: number, density = 0.5) {
  const count = Math.floor(size * size * 0.02 * density);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = (Math.random() - 0.5) * amount;
    ctx.fillStyle = `rgba(${a > 0 ? "255,255,255" : "0,0,0"},${Math.abs(a)})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

function blots(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
  count: number,
  maxR: number,
) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * maxR;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function finish(canvas: HTMLCanvasElement, repeat: number, anisotropy = 4): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = anisotropy;
  return tex;
}

/** Concreto: base cinza fria com manchas e grão. */
export function makeConcreteTexture(size = 512, repeat = 8, tint = "#454a50"): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(size);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, size, size);
  blots(ctx, size, "rgba(20,22,26,0.25)", 40, 30);
  blots(ctx, size, "rgba(120,126,132,0.18)", 30, 22);
  grain(ctx, size, 0.16);
  // juntas de dilatação
  ctx.strokeStyle = "rgba(10,12,14,0.5)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * size;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  return finish(canvas, repeat);
}

/** Piso de asfalto escuro com manchas de óleo. */
export function makeGroundTexture(size = 512, repeat = 14): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(size);
  ctx.fillStyle = "#23262b";
  ctx.fillRect(0, 0, size, size);
  blots(ctx, size, "rgba(8,9,12,0.5)", 26, 46);
  blots(ctx, size, "rgba(60,64,70,0.2)", 20, 30);
  grain(ctx, size, 0.2, 0.8);
  // rachaduras
  ctx.strokeStyle = "rgba(12,13,16,0.65)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(canvas, repeat);
}

/** Madeira de caixote: tábuas horizontais com veios. */
export function makeWoodTexture(size = 512, repeat = 1): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(size);
  ctx.fillStyle = "#5a4632";
  ctx.fillRect(0, 0, size, size);
  const plank = size / 6;
  for (let i = 0; i < 6; i++) {
    const shade = 0.85 + Math.random() * 0.3;
    ctx.fillStyle = `rgb(${(90 * shade) | 0},${(70 * shade) | 0},${(50 * shade) | 0})`;
    ctx.fillRect(0, i * plank, size, plank - 2);
    ctx.fillStyle = "rgba(20,14,8,0.7)";
    ctx.fillRect(0, i * plank + plank - 3, size, 3);
    // veios
    ctx.strokeStyle = "rgba(40,28,16,0.35)";
    for (let v = 0; v < 5; v++) {
      ctx.beginPath();
      const y = i * plank + Math.random() * plank;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(
        size * 0.3,
        y + (Math.random() - 0.5) * 8,
        size * 0.7,
        y + (Math.random() - 0.5) * 8,
        size,
        y,
      );
      ctx.stroke();
    }
  }
  grain(ctx, size, 0.12);
  return finish(canvas, repeat);
}

/** Metal corrugado enferrujado (contêineres). */
export function makeCorrugatedTexture(
  size = 512,
  repeat = 2,
  base = "#5a3830",
): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const stripe = size / 16;
  for (let i = 0; i < 16; i++) {
    const shade = i % 2 === 0 ? 1.15 : 0.8;
    ctx.fillStyle = `rgba(${shade > 1 ? "255,255,255" : "0,0,0"},0.14)`;
    ctx.fillRect(i * stripe, 0, stripe, size);
  }
  blots(ctx, size, "rgba(96,48,24,0.4)", 26, 26);
  blots(ctx, size, "rgba(30,18,12,0.45)", 18, 18);
  grain(ctx, size, 0.14);
  return finish(canvas, repeat);
}

/** Metal escovado escuro (estruturas, torres). */
export function makeSteelTexture(size = 256, repeat = 2): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(size);
  ctx.fillStyle = "#3a3f45";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 200; i++) {
    const y = Math.random() * size;
    ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }
  blots(ctx, size, "rgba(15,17,20,0.35)", 12, 20);
  grain(ctx, size, 0.1);
  return finish(canvas, repeat);
}
