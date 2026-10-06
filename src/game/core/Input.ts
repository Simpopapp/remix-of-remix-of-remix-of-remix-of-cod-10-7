/**
 * Input puro (sem React): teclado, mouse e pointer lock.
 * Só coleta estado; o Player consome. Ao perder o lock, todo estado é limpo
 * (pausa implícita) e os callbacks são notificados.
 */

export class Input {
  locked = false;
  /** Suspensão cinematográfica: lock mantido, controle congelado (intro/killcam). */
  suspended = false;

  private keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private jumpQueued = false;
  private buttons = new Set<number>();
  private pressed = new Set<string>();
  private wheelAcc = 0;
  private lockListeners = new Set<(locked: boolean) => void>();

  constructor(private canvas: HTMLCanvasElement) {}

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.locked || e.repeat) return;
    if (e.code === "Space") {
      this.jumpQueued = true;
      e.preventDefault();
    }
    this.keys.add(e.code);
    this.pressed.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) return;
    this.buttons.add(e.button);
    if (e.button === 0) this.pressed.add("Mouse0");
  };

  private onMouseUp = (e: MouseEvent) => {
    this.buttons.delete(e.button);
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.locked) return;
    this.wheelAcc += Math.sign(e.deltaY);
  };

  private onContextMenu = (e: MouseEvent) => {
    if (e.target === this.canvas) e.preventDefault();
  };

  private onPointerLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) this.clear();
    for (const cb of this.lockListeners) cb(this.locked);
  };

  private onBlur = () => {
    if (this.locked) document.exitPointerLock();
    this.clear();
  };

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    this.locked = document.pointerLockElement === this.canvas;
  }

  detach(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.lockListeners.clear();
  }

  requestLock(): void {
    const result = this.canvas.requestPointerLock() as unknown;
    if (result instanceof Promise) result.catch(() => {});
  }

  onLockChange(cb: (locked: boolean) => void): () => void {
    this.lockListeners.add(cb);
    return () => {
      this.lockListeners.delete(cb);
    };
  }

  /** Limpa todo estado efêmero (usado ao pausar/perder lock). */
  clear(): void {
    this.keys.clear();
    this.jumpQueued = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.buttons.clear();
    this.pressed.clear();
    this.wheelAcc = 0;
  }

  consumeMouse(): { dx: number; dy: number } {
    if (this.suspended) return { dx: 0, dy: 0 };
    const delta = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return delta;
  }

  /** true uma única vez por pressionar (tecla ou botão do mouse). */
  consumePressed(code: string): boolean {
    if (this.suspended || !this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  /** Acumulado da roda do mouse (-1/0/+1) desde o último consumo. */
  consumeWheel(): number {
    if (this.suspended) return 0;
    const w = this.wheelAcc;
    this.wheelAcc = 0;
    return w;
  }

  /** true uma única vez por pressionar de Espaço. */
  consumeJump(): boolean {
    if (this.suspended) return false;
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    return jump;
  }

  get primary(): boolean {
    return !this.suspended && this.buttons.has(0);
  }
  get ads(): boolean {
    return !this.suspended && this.buttons.has(2);
  }

  get forward(): boolean {
    return !this.suspended && (this.keys.has("KeyW") || this.keys.has("ArrowUp"));
  }
  get back(): boolean {
    return !this.suspended && (this.keys.has("KeyS") || this.keys.has("ArrowDown"));
  }
  get left(): boolean {
    return !this.suspended && (this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
  }
  get right(): boolean {
    return !this.suspended && (this.keys.has("KeyD") || this.keys.has("ArrowRight"));
  }
  get sprint(): boolean {
    return !this.suspended && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"));
  }
  get crouch(): boolean {
    return (
      !this.suspended &&
      (this.keys.has("ControlLeft") || this.keys.has("ControlRight") || this.keys.has("KeyC"))
    );
  }

  /** E pressionado (interação/hack — PRD RF-05). */
  get holdingE(): boolean {
    return !this.suspended && this.keys.has("KeyE");
  }
}
