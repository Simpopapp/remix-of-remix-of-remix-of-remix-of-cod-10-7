import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Engine, type EngineProgress } from "@/game/core/Engine";
import type { QualityPreset } from "@/game/render/quality";
import { Input } from "@/game/core/Input";
import { Player } from "@/game/player/Player";
import { buildLevel, getLevelColliders } from "@/game/world/Level";
import { TargetManager } from "@/game/weapons/Targets";
import { Director } from "@/game/ai/Director";
import type { WeaponId } from "@/game/data/weapons";
import { RADIO_LINES } from "@/game/data/mission1";
import { GameAudio } from "@/game/audio/Audio";
import {
  WeaponSystem,
  type WeaponHitInfo,
  type WeaponStateSnapshot,
} from "@/game/weapons/WeaponSystem";
import { Objectives, type ObjectiveSnapshot } from "@/game/mission/Objectives";
import { IntroCamera, Killcam } from "@/game/mission/Cinematic";

/**
 * Componente browser-only: monta o motor 3D, o input, o player, o sistema
 * de armas, o Director (IA), os objetivos da missão e o áudio sintetizado
 * sobre o nível completo. Só é importado dinamicamente (React.lazy) na rota
 * /play.
 */

export interface MissionStats {
  kills: number;
  shotsFired: number;
  shotsHit: number;
  time: number;
}

export interface MissionSnapshot extends ObjectiveSnapshot {
  /** Waypoint projetado na tela (%, 0–100) — null quando fora de vista. */
  marker: { x: number; y: number; dist: number } | null;
}

export interface GameApi {
  requestLock(): void;
  setSensitivity(value: number): void;
  setVolume(value: number): void;
  setQuality(preset: QualityPreset): void;
  getQuality(): QualityPreset;
}

interface GameCanvasProps {
  onProgress?: EngineProgress;
  onLockChange?: (locked: boolean) => void;
  onReady?: (api: GameApi) => void;
  onHit?: (info: WeaponHitInfo) => void;
  onWeaponState?: (state: WeaponStateSnapshot) => void;
  onVitals?: (hp: number) => void;
  onDamage?: (angle: number, amount: number) => void;
  onDeath?: (stats: MissionStats) => void;
  onKillcam?: (active: boolean) => void;
  onIntro?: (active: boolean) => void;
  onMission?: (snapshot: MissionSnapshot) => void;
  onRadio?: (text: string) => void;
  onKill?: (info: { headshot: boolean }) => void;
  onCheckpoint?: (objectiveIndex: number) => void;
  onComplete?: (stats: MissionStats) => void;
  /** Checkpoint: índice do objetivo onde a missão retoma (0 = do início). */
  startObjective?: number;
}

export default function GameCanvas({
  onProgress,
  onLockChange,
  onReady,
  onHit,
  onWeaponState,
  onVitals,
  onDamage,
  onDeath,
  onKillcam,
  onIntro,
  onMission,
  onRadio,
  onKill,
  onCheckpoint,
  onComplete,
  startObjective = 0,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onProgress?.(0.15);
    let engine: Engine | null = null;
    let frame = 0;

    const raf = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (!canvas.clientWidth || !canvas.clientHeight) return;
        engine = new Engine(canvas);
        onProgress?.(0.4);

        const hitMeshes: THREE.Mesh[] = [];
        const sceneController = buildLevel(engine.scene, engine.renderer, hitMeshes);
        onProgress?.(0.6);

        const audio = new GameAudio();
        const colliders = getLevelColliders();

        const input = new Input(canvas);
        input.attach();
        // áudio só inicializa dentro do gesto do usuário (política de autoplay)
        const detachLock = input.onLockChange((locked) => {
          if (locked) audio.unlock();
          // primeiro lock: dispara a intro cinematográfica (controle suspenso)
          if (locked && !introDone && !introStarted) {
            introStarted = true;
            intro.begin(player.position.clone().add(new THREE.Vector3(0, player.height, 0)));
            input.suspended = true;
            onIntro?.(true);
          }
          onLockChange?.(locked);
        });

        const player = new Player(engine.camera, colliders);
        // alçote de depuração/verificação — só em dev
        if (import.meta.env.DEV) {
          const win = window as unknown as Record<string, unknown>;
          win["__obPlayer"] = player;
        }

        const targets = new TargetManager(engine.scene);
        if (import.meta.env.DEV) {
          (window as unknown as Record<string, unknown>)["__obTargets"] = targets;
        }

        // ---------- estatísticas da missão (Fase 6) ----------
        const stats: MissionStats = { kills: 0, shotsFired: 0, shotsHit: 0, time: 0 };
        let introStarted = false;
        let introDone = startObjective > 0; // retomar de checkpoint pula a intro
        let killcam: Killcam | null = null;
        let slowmoTimer: ReturnType<typeof setTimeout> | null = null;
        let finished = false;

        const director = new Director(engine.scene, player, colliders, hitMeshes, {
          ...(onDamage ? { onPlayerDamage: onDamage } : {}),
          ...(onDeath
            ? {
                onPlayerDeath: (source: THREE.Vector3) => {
                  // killcam: últimos 2 s vistos da origem do tiro letal (PRD RF-06)
                  input.suspended = true;
                  document.exitPointerLock();
                  killcam = new Killcam(
                    source.clone().add(new THREE.Vector3(0, 1.6, 0)),
                    player.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
                  );
                  engine!.setCameraMotion((_t, dt) => {
                    if (killcam?.update(dt, engine!.camera)) {
                      engine!.setCameraMotion(null);
                      killcam = null;
                      onKillcam?.(false);
                      onDeath?.({ ...stats });
                    }
                  });
                  onKillcam?.(true);
                },
              }
            : {}),
          ...(audio.ready ? { onEnemyShot: (dist: number) => audio.enemyShot(dist) } : {}),
          ...(onKill
            ? {
                onEnemyKilled: (info: { id: number; headshot: boolean }) => {
                  stats.kills += 1;
                  onKill({ headshot: info.headshot });
                },
              }
            : {}),
        });
        if (import.meta.env.DEV) {
          (window as unknown as Record<string, unknown>)["__obDirector"] = director;
        }

        const objectives = new Objectives(
          director,
          {
            ...(onCheckpoint ? { onAdvance: (index: number) => onCheckpoint(index) } : {}),
            ...(onRadio ? { onRadio: (text: string) => onRadio(text) } : {}),
            ...(onComplete
              ? {
                  onComplete: () => {
                    finished = true;
                    input.suspended = true;
                    document.exitPointerLock();
                    onComplete?.({ ...stats });
                  },
                }
              : {}),
            ...(onMission
              ? {
                  onSlowmo: () => {
                    if (!engine) return;
                    engine.timeScale = 0.25;
                    if (slowmoTimer) clearTimeout(slowmoTimer);
                    slowmoTimer = setTimeout(() => {
                      if (engine) engine.timeScale = 1;
                    }, 600);
                  },
                }
              : {}),
          },
          startObjective,
        );
        if (import.meta.env.DEV) {
          (window as unknown as Record<string, unknown>)["__obObjectives"] = objectives;
        }

        // intro cinematográfica (crane-down) — câmera roteirizada
        const intro = new IntroCamera();

        const weapons = new WeaponSystem(
          engine.camera,
          engine.scene,
          player,
          input,
          targets,
          hitMeshes,
          {
            ...(onHit
              ? {
                  onHit: (info: WeaponHitInfo) => {
                    stats.shotsHit += 1;
                    audio.hitmarker(info.headshot, info.killed);
                    onHit(info);
                  },
                }
              : {}),
            ...(onWeaponState ? { onStateChange: onWeaponState } : {}),
            onShot: (weapon: WeaponId) => {
              stats.shotsFired += 1;
              if (weapon === "pistol") audio.pistolShot();
              else audio.rifleShot();
            },
            onReload: (phase) => audio.reloadClick(phase),
          },
          director,
        );
        if (import.meta.env.DEV) {
          const win = window as unknown as Record<string, unknown>;
          win["__obWeapons"] = weapons;
          win["__obCamera"] = engine.camera;
          win["__obScene"] = engine.scene;
        }
        onProgress?.(0.75);

        let vitalsAcc = 0;
        let missionAcc = 0;
        let musicAcc = 0;
        let stepAccum = 0;
        engine.setSceneController({
          update(time, delta) {
            sceneController.update(time, delta);
            targets.update(delta);
            player.update(delta, input);
            weapons.update(delta);
            director.update(delta);
            if (introDone && !finished) objectives.update(delta, player.position, input.holdingE);

            // tempo de missão só corre com controle ativo
            if (introDone && !finished && player.alive && input.locked && !input.suspended) {
              stats.time += delta;
            }

            // passos: distância percorrida no chão (zancada mais longa na sprint)
            const hSpeed = Math.hypot(player.velocity.x, player.velocity.z);
            if (player.grounded && hSpeed > 1) {
              stepAccum += hSpeed * delta;
              const stride = hSpeed > 5.5 ? 2.6 : 2.1;
              if (stepAccum >= stride) {
                stepAccum = 0;
                audio.footstep(hSpeed > 5.5);
              }
            } else {
              stepAccum = 0;
            }

            // camada de música pela ameaça (calmo/tensão/intenso), a cada 0.5 s
            musicAcc += delta;
            if (musicAcc >= 0.5) {
              musicAcc = 0;
              audio.setMusicLayer(director.musicLevel());
            }

            vitalsAcc += delta;
            if (vitalsAcc >= 0.12 && onVitals) {
              vitalsAcc = 0;
              onVitals(player.health);
            }

            // snapshot da missão (throttle ~8 Hz) com waypoint projetado
            missionAcc += delta;
            if (missionAcc >= 0.12 && onMission && !finished) {
              missionAcc = 0;
              const snap = objectives.snapshot;
              let marker: MissionSnapshot["marker"] = null;
              if (snap.waypoint) {
                const wp = new THREE.Vector3(snap.waypoint.x, 1.4, snap.waypoint.z);
                const dist = player.position.distanceTo(wp);
                const projected = wp.project(engine!.camera);
                if (projected.z < 1) {
                  marker = {
                    x: (projected.x * 0.5 + 0.5) * 100,
                    y: (-projected.y * 0.5 + 0.5) * 100,
                    dist,
                  };
                }
              }
              onMission({ ...snap, marker });
            }
          },
          dispose() {
            detachLock();
            input.detach();
            weapons.dispose();
            director.dispose();
            targets.dispose();
            sceneController.dispose();
            audio.dispose();
            if (slowmoTimer) clearTimeout(slowmoTimer);
          },
        });

        // câmera da intro roda após o Player (sobrescreve a câmera de jogo)
        engine.setCameraMotion((_t, dt) => {
          if (introDone) {
            engine!.setCameraMotion(null);
            return;
          }
          if (intro.update(dt, engine!.camera)) {
            introDone = true;
            input.suspended = false;
            engine!.setCameraMotion(null);
            onIntro?.(false);
            if (onRadio) {
              const id = objectives.snapshot.id;
              onRadio(RADIO_LINES[id] ?? "");
            }
          }
        });

        onReady?.({
          requestLock: () => input.requestLock(),
          setSensitivity: (value) => player.setSensitivity(value),
          setVolume: (value) => audio.setMasterVolume(value),
          setQuality: (preset) => engine!.setQuality(preset),
          getQuality: () => engine!.getQuality(),
        });
        engine.start();
        onProgress?.(1);
      });
    });

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(frame);
      engine?.dispose();
      engine = null;
      delete (window as unknown as Record<string, unknown>)["__obPlayer"];
    };
  }, [
    onProgress,
    onLockChange,
    onReady,
    onHit,
    onWeaponState,
    onVitals,
    onDamage,
    onDeath,
    onKillcam,
    onIntro,
    onMission,
    onRadio,
    onKill,
    onCheckpoint,
    onComplete,
    startObjective,
  ]);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
