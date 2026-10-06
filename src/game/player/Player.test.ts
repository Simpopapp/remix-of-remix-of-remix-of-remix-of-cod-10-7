import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Player } from "./Player";
import type { BoxCollider } from "@/game/world/ValidationScene";
import { heightAt } from "@/game/world/terrainField";

/** Input de teste: flags controláveis, sem DOM/pointer lock. */
class StubInput {
  locked = true;
  forward = false;
  back = false;
  left = false;
  right = false;
  sprint = false;
  crouch = false;
  private jumpQueued = false;

  queueJump(): void {
    this.jumpQueued = true;
  }

  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  consumeMouse(): { dx: number; dy: number } {
    return { dx: 0, dy: 0 };
  }
}

const CRATE: BoxCollider = {
  minX: 4.4,
  maxX: 5.6,
  minY: 0,
  maxY: 1.2,
  minZ: 1.4,
  maxZ: 2.6,
};

function makePlayer(colliders: BoxCollider[] = [CRATE]): Player {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
  return new Player(camera, colliders);
}

function step(player: Player, input: StubInput, seconds: number, dt = 1 / 60): void {
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) player.update(dt, input);
}

describe("Player — movimento e colisão", () => {
  it("acelera até a velocidade de caminhada e para com atrito", () => {
    const p = makePlayer([]);
    const input = new StubInput();
    input.forward = true;
    step(p, input, 2);
    expect(p.position.z).toBeLessThan(20 - 4.5 * 1.5); // andou > ~6 m
    input.forward = false;
    const zAfter = p.position.z;
    step(p, input, 1.5);
    // desaceleração spring/atrito: para em < 0.5 m e zera a velocidade
    expect(p.position.z).toBeGreaterThan(zAfter - 0.5);
    expect(Math.abs(p.velocity.z)).toBeLessThan(0.01);
    expect(p.grounded).toBe(true);
  });

  it("não atravessa um caixote (colisão AABB)", () => {
    const p = makePlayer();
    p.position.set(5, 0, 4.5);
    const input = new StubInput();
    input.forward = true;
    step(p, input, 5);
    // para na face do caixote: maxZ 2.6 + raio 0.35 + eps
    expect(p.position.z).toBeCloseTo(2.951, 2);
    expect(p.velocity.z).toBe(0);
  });

  it("pula, aterrissa em cima do caixote e volta ao chão", () => {
    const p = makePlayer();
    p.position.set(5, 0, 3.5);
    const input = new StubInput();
    input.forward = true;
    input.queueJump();
    step(p, input, 0.5); // sobe no caixote com impulso frontal
    input.forward = false;
    step(p, input, 2); // assenta em cima (atrito consome o deslize)
    expect(p.position.y).toBeCloseTo(1.2, 2); // em cima do caixote
    expect(p.grounded).toBe(true);
  });

  it("pulo em campo aberto retorna ao chão", () => {
    const p = makePlayer([]);
    const input = new StubInput();
    input.queueJump();
    step(p, input, 1.5);
    expect(p.position.y).toBe(0);
    expect(p.grounded).toBe(true);
  });

  it("agachar reduz a altura da câmera e a velocidade", () => {
    const p = makePlayer([]);
    const input = new StubInput();
    input.crouch = true;
    input.forward = true;
    step(p, input, 1);
    expect(p.height).toBeCloseTo(1.05, 1);
    input.crouch = false;
    step(p, input, 1);
    expect(p.height).toBeCloseTo(1.7, 1);
  });

  it("sprint aumenta a velocidade horizontal", () => {
    const p = makePlayer([]);
    const input = new StubInput();
    input.forward = true;
    step(p, input, 2);
    const walkDist = 20 - p.position.z;

    const p2 = makePlayer([]);
    input.sprint = true;
    step(p2, input, 2);
    const sprintDist = 20 - p2.position.z;
    expect(sprintDist).toBeGreaterThan(walkDist * 1.3);
  });

  it("limites do mapa impedem sair da área", () => {
    const p = makePlayer([]);
    p.position.set(0, 0, 37);
    const input = new StubInput();
    input.forward = true; // yaw 0 = -z... andar para trás vai para +z
    input.forward = false;
    input.back = true;
    step(p, input, 20);
    expect(p.position.z).toBeLessThanOrEqual(38);
  });
});

describe("Player — terreno com relevo (Fase V2)", () => {
  it("sobe a rampa de acesso ao norte (ganho de altura)", () => {
    const p = makePlayer([]);
    const input = new StubInput();
    p.lookAtPoint({ x: 10, y: 2, z: 35.5 }); // mira no topo da rampa A
    input.forward = true;
    step(p, input, 3);
    expect(p.position.z).toBeGreaterThan(27); // passou o portão
    const expected = heightAt(p.position.x, p.position.z);
    expect(p.position.y).toBeCloseTo(expected, 1);
    expect(p.position.y).toBeGreaterThan(0.6); // subiu
    expect(p.grounded).toBe(true);
  });

  it("assenta no fundo da cratera (solo rebaixado)", () => {
    const p = makePlayer([]);
    p.position.set(-14, 2, 33); // centro da cratera de morteiro
    step(p, new StubInput(), 1);
    const expected = heightAt(-14, 33);
    expect(p.position.y).toBeCloseTo(expected, 1);
    expect(expected).toBeLessThan(-0.5);
  });
});

describe("Player — vitalidade (Fase 4)", () => {
  it("dano reduz HP e regenera após 4 s sem dano (35 HP/s)", () => {
    const p = makePlayer([]);
    expect(p.alive).toBe(true);
    expect(p.takeDamage(30)).toBe(false);
    expect(p.health).toBe(70);
    step(p, new StubInput(), 3);
    expect(p.health).toBe(70); // ainda dentro da janela de 4 s
    step(p, new StubInput(), 2); // ~1 s de regeneração
    expect(p.health).toBeGreaterThan(70);
  });

  it("novo dano interrompe a regeneração", () => {
    const p = makePlayer([]);
    p.takeDamage(50);
    step(p, new StubInput(), 5); // regenera ~35
    const healed = p.health;
    expect(healed).toBeGreaterThan(50);
    p.takeDamage(10);
    expect(p.health).toBeCloseTo(healed - 10, 5);
    step(p, new StubInput(), 2);
    expect(p.health).toBeCloseTo(healed - 10, 0); // janela de 4 s reiniciada
  });

  it("HP a zero = morto; sem movimento e sem regeneração", () => {
    const p = makePlayer([]);
    expect(p.takeDamage(100)).toBe(true);
    expect(p.alive).toBe(false);
    expect(p.health).toBe(0);
    const input = new StubInput();
    input.forward = true;
    const z = p.position.z;
    step(p, input, 1);
    expect(p.position.z).toBe(z); // controle congelado
    expect(p.takeDamage(10)).toBe(true); // não revive
  });
});
