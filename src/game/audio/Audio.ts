/**
 * Áudio do jogo (Fase 5) — 100% sintetizado via WebAudio, sem assets pesados.
 * SFX por evento (disparos, passos, reload, impacto, UI, hitmarker) + música
 * em camadas (calmo / tensão / intenso) com crossfade. O AudioContext só é
 * criado após o gesto do usuário (unlock) — política de autoplay respeitada.
 */

export type MusicLayer = "calm" | "tension" | "intense";

export type WeaponSoundId = "rifle" | "pistol";

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private layerGains: Record<MusicLayer, GainNode> | null = null;
  private currentLayer: MusicLayer = "calm";
  private volume = 0.8;

  /** Cria/resume o contexto — chamar apenas dentro de um gesto do usuário. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = 0.55;
    this.music.connect(this.master);

    this.noise = this.makeNoiseBuffer(ctx);
    this.layerGains = this.buildMusicLayers(ctx);
    this.applyLayer(this.currentLayer, true);
  }

  /** Volume master (0–1), configurável no menu de pausa. */
  setMasterVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  // ---------- SFX ----------

  /** Disparo do fuzil: burst de ruído + thump grave, com variação aleatória. */
  rifleShot(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.noise) return;
    const t = ctx.currentTime;
    this.noiseBurst(t, 0.13, 1600 + Math.random() * 400, 0.5, 0.9);
    this.thump(t, 150, 55, 0.09, 0.5);
  }

  /** Disparo da pistola: mais curto e agudo. */
  pistolShot(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.noise) return;
    const t = ctx.currentTime;
    this.noiseBurst(t, 0.09, 2300 + Math.random() * 500, 0.45, 1.1);
    this.thump(t, 200, 80, 0.06, 0.4);
  }

  /** Disparo inimigo: atenuado por distância (60 m = quase inaudível). */
  enemyShot(distance: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.noise) return;
    const t = ctx.currentTime;
    const atten = Math.max(0.08, 1 - distance / 60);
    this.noiseBurst(t, 0.12, 1400, 0.38 * atten, 0.8);
    this.thump(t, 130, 50, 0.08, 0.35 * atten);
  }

  /** Impacto de bala no cenário. */
  impact(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.noise) return;
    this.noiseBurst(ctx.currentTime, 0.05, 3400, 0.2, 2.2);
  }

  /** Passo (superfície simplificada); mais forte na sprint. */
  footstep(running: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.noise) return;
    this.noiseBurst(ctx.currentTime, 0.07, 380 + Math.random() * 120, running ? 0.2 : 0.11, 0.6);
  }

  /** Recarga: início (mag out) e fim (mag in + bolt). */
  reloadClick(phase: "start" | "end"): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const t = ctx.currentTime;
    if (phase === "start") {
      this.blip(t, 520, 0.04, 0.18);
      this.blip(t + 0.09, 340, 0.05, 0.16);
    } else {
      this.blip(t, 700, 0.03, 0.2);
      this.blip(t + 0.08, 950, 0.05, 0.22);
    }
  }

  /** Hitmarker: tick normal, distinto em headshot, duplo em abate. */
  hitmarker(headshot: boolean, killed: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const t = ctx.currentTime;
    this.blip(t, headshot ? 2600 : 2000, 0.035, 0.16);
    if (killed) {
      this.blip(t + 0.07, headshot ? 1800 : 1300, 0.06, 0.2);
    }
  }

  /** Beep de rádio/UI. */
  uiBeep(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    this.blip(ctx.currentTime, 660, 0.08, 0.12);
  }

  // ---------- música em camadas ----------

  /** Crossfade suave para a camada pedida (calmo/tensão/intenso). */
  setMusicLayer(layer: MusicLayer): void {
    if (layer === this.currentLayer) return;
    this.currentLayer = layer;
    if (this.ctx) this.applyLayer(layer, false);
  }

  private applyLayer(layer: MusicLayer, instant: boolean): void {
    if (!this.ctx || !this.layerGains) return;
    const t = this.ctx.currentTime;
    const targets: Record<MusicLayer, number> = { calm: 1, tension: 0, intense: 0 };
    for (const [name, gain] of Object.entries(this.layerGains) as Array<[MusicLayer, GainNode]>) {
      const target = name === layer ? targets[layer] : 0;
      if (instant) gain.gain.value = name === layer ? targets[layer] : 0;
      else gain.gain.setTargetAtTime(target, t, name === layer ? 1.2 : 0.8);
    }
  }

  private buildMusicLayers(ctx: AudioContext): Record<MusicLayer, GainNode> {
    const mk = (): GainNode => {
      const g = ctx.createGain();
      g.connect(this.music!);
      return g;
    };

    // calmo: pad grave de duas serras detunadas em lowpass
    const calm = mk();
    calm.gain.value = 0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 240;
    padFilter.connect(calm);
    for (const freq of [55, 55.4, 110.2]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = freq > 100 ? 0.25 : 0.5;
      osc.connect(g).connect(padFilter);
      osc.start();
    }

    // tensão: ruído grave pulsando (batida lenta) + drone agudo discreto
    const tension = mk();
    tension.gain.value = 0;
    const pulse = ctx.createGain();
    pulse.gain.value = 0.5;
    pulse.connect(tension);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.noise;
    noiseSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 170;
    bp.Q.value = 1.6;
    noiseSrc.connect(bp).connect(pulse);
    noiseSrc.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.45;
    lfo.connect(lfoGain).connect(pulse.gain);
    lfo.start();

    // intenso: serra grave em pulso rápido (percussão de oitava)
    const intense = mk();
    intense.gain.value = 0;
    const drive = ctx.createGain();
    drive.gain.value = 0.5;
    drive.connect(intense);
    const bass = ctx.createOscillator();
    bass.type = "sawtooth";
    bass.frequency.value = 55;
    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = "lowpass";
    bassFilter.frequency.value = 420;
    bass.connect(bassFilter).connect(drive);
    bass.start();
    const driveLfo = ctx.createOscillator();
    driveLfo.frequency.value = 5.5;
    const driveLfoGain = ctx.createGain();
    driveLfoGain.gain.value = 0.45;
    driveLfo.connect(driveLfoGain).connect(drive.gain);
    driveLfo.start();

    return { calm, tension, intense };
  }

  // ---------- primitivas ----------

  private makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private noiseBurst(t: number, duration: number, freq: number, gain: number, q: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(env).connect(this.sfx!);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  private thump(t: number, from: number, to: number, duration: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(env).connect(this.sfx!);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private blip(t: number, freq: number, duration: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 4000;
    osc.connect(filter).connect(env).connect(this.sfx!);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  dispose(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.music = null;
    this.layerGains = null;
    void ctx.close();
  }
}
