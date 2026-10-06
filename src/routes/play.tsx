import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Gauge, Loader2, MousePointerClick, RotateCcw, Settings2, Volume2 } from "lucide-react";
import type { WeaponStateSnapshot } from "@/game/weapons/WeaponSystem";
import { MISSION_SUBTITLE, MISSION_TITLE } from "@/game/data/mission1";
import type { MissionSnapshot, MissionStats } from "@/components/game/GameCanvas";
import {
  DEFAULT_QUALITY,
  QUALITY_ORDER,
  QUALITY_PRESETS,
  type QualityPreset,
} from "@/game/render/quality";

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: "Operação Blackout — Missão" },
      {
        name: "description",
        content:
          "FPS cinematográfico no browser: infiltração noturna em zona industrial com combate tático e apresentação de filme.",
      },
      { property: "og:title", content: "Operação Blackout — Missão" },
      {
        property: "og:description",
        content:
          "FPS cinematográfico no browser: infiltração noturna em zona industrial com combate tático e apresentação de filme.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlayPage,
});

const GameCanvas = lazy(() => import("@/components/game/GameCanvas"));

const LOADING_STEPS = [
  "Alocando recursos táticos…",
  "Compilando shaders do motor…",
  "Montando zona industrial…",
  "Sincronizando iluminação…",
  "Entrando na zona de operação…",
];

const SENS_KEY = "ob:sensitivity";
const VOLUME_KEY = "ob:volume";
const CHECKPOINT_KEY = "ob:checkpoint";

interface Hitmarker {
  id: number;
  headshot: boolean;
}

interface FeedItem {
  id: number;
  headshot: boolean;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function accuracyOf(stats: MissionStats | null): number {
  if (!stats || stats.shotsFired === 0) return 0;
  return Math.round((stats.shotsHit / stats.shotsFired) * 100);
}

/** Subtítulo de rádio com efeito typewriter (PRD RF-06). */
function RadioSubtitle({ text }: { text: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const iv = setInterval(() => {
      setShown((s) => {
        if (s >= text.length) {
          clearInterval(iv);
          return s;
        }
        return s + 1;
      });
    }, 24);
    return () => clearInterval(iv);
  }, [text]);
  return (
    <p className="text-center text-sm text-foreground/90">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">Rádio </span>
      {text.slice(0, shown)}
      {shown < text.length && <span className="animate-pulse">▌</span>}
    </p>
  );
}

function PlayPage() {
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [sensitivity, setSensitivity] = useState(1);
  const [weapon, setWeapon] = useState<WeaponStateSnapshot | null>(null);
  const [hitmarker, setHitmarker] = useState<Hitmarker | null>(null);
  const [hp, setHp] = useState(100);
  const [vignette, setVignette] = useState(0);
  const [damageDirs, setDamageDirs] = useState<Array<{ id: number; angle: number }>>([]);
  const [dead, setDead] = useState(false);
  const [runId, setRunId] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [quality, setQualityState] = useState<QualityPreset>(DEFAULT_QUALITY);
  // Fase 6: missão, cinemática e estatísticas
  const [mission, setMission] = useState<MissionSnapshot | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [killFeed, setKillFeed] = useState<FeedItem[]>([]);
  const [intro, setIntro] = useState(false);
  const [killcam, setKillcam] = useState(false);
  const [deathStats, setDeathStats] = useState<MissionStats | null>(null);
  const [completeStats, setCompleteStats] = useState<MissionStats | null>(null);
  const [startObjective, setStartObjective] = useState(0);
  const apiRef = useRef<{
    requestLock(): void;
    setSensitivity(value: number): void;
    setVolume(value: number): void;
    setQuality(preset: QualityPreset): void;
    getQuality(): QualityPreset;
  } | null>(null);
  const hitIdRef = useRef(0);
  const dirIdRef = useRef(0);
  const feedIdRef = useRef(0);
  const subtitleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleProgress = useCallback((fraction: number) => {
    setProgress(fraction);
    if (fraction >= 1) {
      setTimeout(() => setFading(true), 350);
    }
  }, []);

  const handleLockChange = useCallback((isLocked: boolean) => {
    setLocked(isLocked);
    if (isLocked) setHasStarted(true);
  }, []);

  const handleReady = useCallback(
    (api: {
      requestLock(): void;
      setSensitivity(value: number): void;
      setVolume(value: number): void;
      setQuality(preset: QualityPreset): void;
      getQuality(): QualityPreset;
    }) => {
      apiRef.current = api;
      setReady(true);
      setQualityState(api.getQuality());
      try {
        const raw = window.localStorage.getItem(VOLUME_KEY);
        const value = raw === null ? NaN : Number(raw);
        if (Number.isFinite(value)) api.setVolume(Math.min(1, Math.max(0, value)));
      } catch {
        // storage indisponível — mantém padrão
      }
    },
    [],
  );

  const handleHit = useCallback((info: { headshot: boolean; killed: boolean }) => {
    hitIdRef.current += 1;
    setHitmarker({ id: hitIdRef.current, headshot: info.headshot || info.killed });
  }, []);

  const handleWeaponState = useCallback((state: WeaponStateSnapshot) => {
    setWeapon(state);
  }, []);

  const handleVitals = useCallback((value: number) => {
    setHp(value);
  }, []);

  const handleDamage = useCallback((angle: number, amount: number) => {
    setVignette((v) => Math.min(1, v + amount / 45));
    dirIdRef.current += 1;
    const id = dirIdRef.current;
    setDamageDirs((list) => [...list.slice(-2), { id, angle }]);
  }, []);

  const handleDeath = useCallback((stats: MissionStats) => {
    setDeathStats(stats);
    setDead(true);
  }, []);

  const handleKill = useCallback((info: { headshot: boolean }) => {
    feedIdRef.current += 1;
    const id = feedIdRef.current;
    setKillFeed((feed) => [...feed.slice(-3), { id, headshot: info.headshot }]);
  }, []);

  const handleMission = useCallback((snapshot: MissionSnapshot) => {
    setMission(snapshot);
  }, []);

  const handleRadio = useCallback((text: string) => {
    setSubtitle(text);
    if (subtitleTimer.current) clearTimeout(subtitleTimer.current);
    subtitleTimer.current = setTimeout(() => setSubtitle(null), 5000);
  }, []);

  const handleCheckpoint = useCallback((objectiveIndex: number) => {
    try {
      window.localStorage.setItem(CHECKPOINT_KEY, String(objectiveIndex));
    } catch {
      // storage indisponível — checkpoint só não persiste
    }
  }, []);

  const handleComplete = useCallback((stats: MissionStats) => {
    setCompleteStats(stats);
    try {
      window.localStorage.removeItem(CHECKPOINT_KEY);
    } catch {
      // storage indisponível
    }
  }, []);

  const handleIntro = useCallback((active: boolean) => setIntro(active), []);
  const handleKillcam = useCallback((active: boolean) => setKillcam(active), []);

  // hitmarker some após um instante
  useEffect(() => {
    if (!hitmarker) return;
    const t = setTimeout(() => setHitmarker(null), 240);
    return () => clearTimeout(t);
  }, [hitmarker]);

  // vinheta de dano decai gradualmente
  useEffect(() => {
    const iv = setInterval(() => {
      setVignette((v) => (v > 0 ? Math.max(0, v - 0.05) : 0));
    }, 120);
    return () => clearInterval(iv);
  }, []);

  // arcos de direção de dano somem após 1.2 s
  useEffect(() => {
    if (damageDirs.length === 0) return;
    const t = setTimeout(() => setDamageDirs((l) => l.slice(1)), 1200);
    return () => clearTimeout(t);
  }, [damageDirs]);

  // itens do kill feed somem após 4 s
  useEffect(() => {
    if (killFeed.length === 0) return;
    const t = setTimeout(() => setKillFeed((l) => l.slice(1)), 4000);
    return () => clearTimeout(t);
  }, [killFeed]);

  // sensibilidade só no cliente (evita divergência de hidratação)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SENS_KEY);
      const value = raw === null ? NaN : Number(raw);
      if (Number.isFinite(value) && value >= 0.2 && value <= 3) {
        setSensitivity(value);
        apiRef.current?.setSensitivity(value);
      }
    } catch {
      // storage indisponível — mantém padrão
    }
  }, []);

  const changeSensitivity = (value: number) => {
    setSensitivity(value);
    try {
      window.localStorage.setItem(SENS_KEY, String(value));
    } catch {
      // storage indisponível
    }
    apiRef.current?.setSensitivity(value);
  };

  const changeVolume = (value: number) => {
    setVolume(value);
    try {
      window.localStorage.setItem(VOLUME_KEY, String(value));
    } catch {
      // storage indisponível
    }
    apiRef.current?.setVolume(value);
  };

  const changeQuality = (preset: QualityPreset) => {
    setQualityState(preset);
    apiRef.current?.setQuality(preset);
  };

  const requestLock = () => apiRef.current?.requestLock();

  const restartMission = () => {
    // checkpoint: retoma no último objetivo concluído (PRD RF-04)
    let resume = 0;
    try {
      const raw = window.localStorage.getItem(CHECKPOINT_KEY);
      const value = raw === null ? NaN : Number(raw);
      if (Number.isFinite(value) && value >= 0 && value <= 4) resume = value;
    } catch {
      // storage indisponível
    }
    setDead(false);
    setDeathStats(null);
    setCompleteStats(null);
    setHp(100);
    setVignette(0);
    setDamageDirs([]);
    setWeapon(null);
    setHitmarker(null);
    setKillFeed([]);
    setMission(null);
    setSubtitle(null);
    setStartObjective(resume);
    setRunId((r) => r + 1);
  };

  const step = Math.min(LOADING_STEPS.length - 1, Math.floor(progress * LOADING_STEPS.length));
  const showPause = ready && !locked && !dead && !completeStats;
  const playing = locked && !intro && !killcam && !dead;
  const letterbox = intro || killcam;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <ClientOnly>
        <Suspense fallback={null}>
          <GameCanvas
            key={runId}
            startObjective={startObjective}
            onProgress={handleProgress}
            onLockChange={handleLockChange}
            onReady={handleReady}
            onHit={handleHit}
            onWeaponState={handleWeaponState}
            onVitals={handleVitals}
            onDamage={handleDamage}
            onDeath={handleDeath}
            onKillcam={handleKillcam}
            onIntro={handleIntro}
            onMission={handleMission}
            onRadio={handleRadio}
            onKill={handleKill}
            onCheckpoint={handleCheckpoint}
            onComplete={handleComplete}
          />
        </Suspense>
      </ClientOnly>

      {/* Vinheta de dano (intensidade ∝ dano sofrido + HP baixo) */}
      <div
        className="pointer-events-none fixed inset-0 z-[5]"
        style={{
          boxShadow: `inset 0 0 140px rgba(190, 24, 24, ${Math.min(
            0.85,
            vignette + (hp < 55 ? (55 - hp) / 90 : 0) + (dead ? 0.45 : 0),
          )})`,
        }}
      />

      {/* Direção do dano: arcos vermelhos na borda apontando à origem */}
      {damageDirs.map((d) => (
        <div key={d.id} className="pointer-events-none fixed inset-0 z-[6]">
          <div
            className="absolute left-1/2 top-1/2 size-72"
            style={{ transform: `translate(-50%, -50%) rotate(${d.angle}rad)` }}
          >
            <div
              className="absolute left-1/2 top-0 h-1.5 w-20 -translate-x-1/2 rounded-full bg-destructive/80"
              style={{ boxShadow: "0 0 14px rgba(220,38,38,0.8)" }}
            />
          </div>
        </div>
      ))}

      {/* Letterbox cinematográfico (intro / killcam — PRD RF-06) */}
      {letterbox && (
        <>
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[15] h-[14vh] bg-black" />
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[15] h-[14vh] bg-black" />
        </>
      )}

      {/* Crosshair + hitmarker */}
      {playing && (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            <div className="absolute size-1 rounded-full bg-foreground/90" />
            <div className="absolute h-px w-3 -translate-x-3.5 bg-foreground/70" />
            <div className="absolute h-px w-3 translate-x-3.5 bg-foreground/70" />
            <div className="absolute h-3 w-px -translate-y-3.5 bg-foreground/70" />
            <div className="absolute h-3 w-px translate-y-3.5 bg-foreground/70" />
            {hitmarker && (
              <div
                key={hitmarker.id}
                className="absolute animate-in fade-in zoom-in-50 duration-100"
              >
                <div className="relative size-6">
                  <div
                    className={`absolute left-1/2 top-1/2 h-0.5 w-2.5 -translate-y-1/2 rotate-45 ${
                      hitmarker.headshot ? "bg-destructive" : "bg-foreground"
                    }`}
                    style={{ transform: "translate(-50%,-50%) rotate(45deg) translateX(-6px)" }}
                  />
                  <div
                    className={`absolute left-1/2 top-1/2 h-0.5 w-2.5 -translate-y-1/2 rotate-45 ${
                      hitmarker.headshot ? "bg-destructive" : "bg-foreground"
                    }`}
                    style={{ transform: "translate(-50%,-50%) rotate(45deg) translateX(6px)" }}
                  />
                  <div
                    className={`absolute left-1/2 top-1/2 h-0.5 w-2.5 -translate-y-1/2 -rotate-45 ${
                      hitmarker.headshot ? "bg-destructive" : "bg-foreground"
                    }`}
                    style={{ transform: "translate(-50%,-50%) rotate(-45deg) translateX(-6px)" }}
                  />
                  <div
                    className={`absolute left-1/2 top-1/2 h-0.5 w-2.5 -translate-y-1/2 -rotate-45 ${
                      hitmarker.headshot ? "bg-destructive" : "bg-foreground"
                    }`}
                    style={{ transform: "translate(-50%,-50%) rotate(-45deg) translateX(6px)" }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Objetivo + waypoint (Fase 6) */}
      {playing && mission && (
        <>
          <div className="pointer-events-none fixed inset-x-0 top-5 z-10 flex flex-col items-center">
            <p className="text-[10px] uppercase tracking-[0.35em] text-primary/80">
              Objetivo {mission.id}
            </p>
            <p className="mt-0.5 font-serif text-lg font-semibold tracking-tight text-foreground drop-shadow-md">
              {mission.title}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {mission.id === "D"
                ? `${mission.wavesRemaining} onda(s) restante(s)`
                : mission.detail}
            </p>
          </div>
          {mission.marker && (
            <div
              className="pointer-events-none fixed z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${mission.marker.x}%`, top: `${mission.marker.y}%` }}
            >
              <div className="flex flex-col items-center">
                <div
                  className="size-3 rotate-45 border border-primary bg-primary/25"
                  style={{ boxShadow: "0 0 10px rgba(56,120,160,0.8)" }}
                />
                <span className="mt-1 font-mono text-[10px] text-primary">
                  {Math.round(mission.marker.dist)} m
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Kill feed (Fase 6) */}
      {playing && killFeed.length > 0 && (
        <div className="pointer-events-none fixed right-6 top-5 z-10 space-y-1 text-right">
          {killFeed.map((item) => (
            <p
              key={item.id}
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/80"
            >
              <span className="text-destructive">✕</span> hostil eliminado
              {item.headshot && <span className="ml-1.5 text-primary"> headshot</span>}
            </p>
          ))}
        </div>
      )}

      {/* Barra de hack (objetivo C — Fase 6) */}
      {playing && mission && mission.hackProgress > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-10 flex justify-center">
          <div className="w-64">
            <p className="mb-1 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
              Hackeando terminal
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/80">
              <div
                className="h-full bg-primary transition-[width] duration-100"
                style={{ width: `${Math.round(mission.hackProgress * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Munição */}
      {playing && weapon && (
        <div className="pointer-events-none fixed bottom-6 right-8 z-10 text-right">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {weapon.name}
          </p>
          <p className="font-mono text-2xl font-semibold text-foreground">
            {weapon.mag}
            <span className="text-sm text-muted-foreground"> / {weapon.reserve}</span>
          </p>
          {weapon.reloading && (
            <p className="animate-pulse font-mono text-[10px] uppercase tracking-[0.25em] text-destructive">
              Recarregando…
            </p>
          )}
        </div>
      )}

      {/* Integridade (regeneração estilo COD) */}
      {playing && !dead && (
        <div className="pointer-events-none fixed bottom-6 left-8 z-10">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Integridade
          </p>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-1.5 w-44 overflow-hidden rounded-full bg-secondary/80">
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{
                  width: `${hp}%`,
                  backgroundColor: hp < 30 ? "var(--destructive)" : "var(--primary)",
                }}
              />
            </div>
            <span className="font-mono text-sm text-foreground/90">{Math.ceil(hp)}</span>
          </div>
        </div>
      )}

      {/* Subtítulo de rádio (typewriter — Fase 6) */}
      {subtitle && !dead && (
        <div className="pointer-events-none fixed inset-x-0 bottom-16 z-20 flex justify-center px-6">
          <div className="max-w-xl rounded-md border border-border/40 bg-black/55 px-4 py-2 backdrop-blur-xs">
            <RadioSubtitle text={subtitle} />
          </div>
        </div>
      )}

      {/* Título da missão durante a intro (estilo COD) */}
      {intro && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[18vh] z-20 flex flex-col items-center text-center">
          <p className="animate-in fade-in duration-1000 font-serif text-4xl font-bold tracking-tight text-foreground drop-shadow-2xl">
            {MISSION_TITLE}
          </p>
          <p className="mt-1 animate-in fade-in duration-1000 text-xs uppercase tracking-[0.35em] text-muted-foreground">
            {MISSION_SUBTITLE}
          </p>
        </div>
      )}

      {/* Overlay de carregamento */}
      <div
        className={`pointer-events-none fixed inset-0 z-30 flex flex-col items-center justify-center bg-background transition-opacity duration-700 ${
          fading ? "opacity-0" : "opacity-100"
        }`}
        style={{ visibility: fading ? "hidden" : "visible" }}
      >
        <div className="w-72 max-w-[80vw] text-center">
          <p className="mb-1 font-serif text-2xl font-semibold tracking-tight text-foreground">
            Operação Blackout
          </p>
          <p className="mb-6 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Zona Industrial Norte — 02:47
          </p>
          <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            <span>{LOADING_STEPS[step]}</span>
          </div>
        </div>
      </div>

      {/* Overlay de início / pausa (pointer lock só após clique) */}
      {showPause && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-80 max-w-[85vw] rounded-lg border border-border/60 bg-card/70 p-6 text-center shadow-2xl">
            <p className="mb-1 font-serif text-2xl font-semibold tracking-tight text-foreground">
              Operação Blackout
            </p>
            <p className="mb-5 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
              {hasStarted ? "Missão pausada" : "Pronto para operar"}
            </p>

            <button
              type="button"
              onClick={requestLock}
              className="mb-5 inline-flex w-full items-center justify-center gap-2.5 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              <MousePointerClick className="size-4" />
              {hasStarted ? "Retomar missão" : "Assumir o controle"}
            </button>

            <div className="mb-4 space-y-1.5 text-left text-[11px] text-muted-foreground">
              <p>
                <span className="font-mono text-foreground/80">W A S D</span> mover ·{" "}
                <span className="font-mono text-foreground/80">Shift</span> correr ·{" "}
                <span className="font-mono text-foreground/80">Ctrl</span> agachar ·{" "}
                <span className="font-mono text-foreground/80">Espaço</span> pular
              </p>
              <p>
                <span className="font-mono text-foreground/80">Mouse</span> mirar ·{" "}
                <span className="font-mono text-foreground/80">Esq.</span> atirar ·{" "}
                <span className="font-mono text-foreground/80">Dir.</span> mira precisa ·{" "}
                <span className="font-mono text-foreground/80">ESC</span> pausar
              </p>
              <p>
                <span className="font-mono text-foreground/80">1 / 2</span> trocar arma ·{" "}
                <span className="font-mono text-foreground/80">R</span> recarregar ·{" "}
                <span className="font-mono text-foreground/80">E</span> interagir
              </p>
            </div>

            <div className="border-t border-border/40 pt-4">
              <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Settings2 className="size-3.5" />
                  Sensibilidade
                </span>
                <span className="font-mono text-foreground/80">{sensitivity.toFixed(1)}×</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={sensitivity}
                onChange={(e) => changeSensitivity(Number(e.target.value))}
                className="w-full accent-primary"
                aria-label="Sensibilidade do mouse"
              />
              <p className="mt-1.5 text-left text-[10px] text-muted-foreground/70">
                Ajuste persiste entre sessões.
              </p>
            </div>

            <div className="border-t border-border/40 pt-4">
              <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Volume2 className="size-3.5" />
                  Volume
                </span>
                <span className="font-mono text-foreground/80">{Math.round(volume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                className="w-full accent-primary"
                aria-label="Volume master"
              />
            </div>

            <div className="border-t border-border/40 pt-4">
              <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Gauge className="size-3.5" />
                  Qualidade gráfica
                </span>
                <span className="font-mono text-foreground/80">
                  {QUALITY_PRESETS[quality].label}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {QUALITY_ORDER.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => changeQuality(preset)}
                    aria-pressed={quality === preset}
                    className={`rounded border px-1 py-1.5 text-[11px] transition-colors ${
                      quality === preset
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    {QUALITY_PRESETS[preset].label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-left text-[10px] text-muted-foreground/70">
                Ajuste persiste entre sessões.
              </p>
            </div>

            {startObjective > 0 && (
              <p className="mt-4 border-t border-border/40 pt-3 text-[10px] text-muted-foreground/80">
                Checkpoint: retomando no objetivo {["A", "B", "C", "D", "E"][startObjective] ?? "A"}{" "}
                ao reiniciar.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Morte do jogador: killcam → falha da missão + estatísticas */}
      {dead && !killcam && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm">
          <div className="w-80 max-w-[85vw] text-center">
            <p className="mb-1 font-serif text-4xl font-semibold tracking-tight text-destructive">
              K.I.A.
            </p>
            <p className="mb-6 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
              Missão falhou — Operação Blackout
            </p>

            <div className="mb-6 grid grid-cols-2 gap-2 rounded-md border border-border/50 bg-card/50 p-3 text-left font-mono text-xs">
              <span className="text-muted-foreground">Abates</span>
              <span className="text-right text-foreground">{deathStats?.kills ?? 0}</span>
              <span className="text-muted-foreground">Precisão</span>
              <span className="text-right text-foreground">{accuracyOf(deathStats)}%</span>
              <span className="text-muted-foreground">Tempo</span>
              <span className="text-right text-foreground">
                {formatTime(deathStats?.time ?? 0)}
              </span>
            </div>

            <button
              type="button"
              onClick={restartMission}
              className="mb-3 inline-flex w-full items-center justify-center gap-2.5 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              <RotateCcw className="size-4" />
              Reiniciar do checkpoint
            </button>
            <Link
              to="/"
              className="inline-flex w-full items-center justify-center rounded-md border border-border/60 px-6 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Abandonar operação
            </Link>
          </div>
        </div>
      )}

      {/* Missão concluída: estatísticas (Fase 6) */}
      {completeStats && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm">
          <div className="w-80 max-w-[85vw] text-center">
            <p className="mb-1 font-serif text-4xl font-semibold tracking-tight text-primary">
              Missão concluída
            </p>
            <p className="mb-6 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
              Operação Blackout — extração bem-sucedida
            </p>

            <div className="mb-6 grid grid-cols-2 gap-2 rounded-md border border-border/50 bg-card/50 p-3 text-left font-mono text-xs">
              <span className="text-muted-foreground">Abates</span>
              <span className="text-right text-foreground">{completeStats.kills}</span>
              <span className="text-muted-foreground">Disparos</span>
              <span className="text-right text-foreground">{completeStats.shotsFired}</span>
              <span className="text-muted-foreground">Precisão</span>
              <span className="text-right text-foreground">{accuracyOf(completeStats)}%</span>
              <span className="text-muted-foreground">Tempo</span>
              <span className="text-right text-foreground">{formatTime(completeStats.time)}</span>
            </div>

            <button
              type="button"
              onClick={restartMission}
              className="mb-3 inline-flex w-full items-center justify-center gap-2.5 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              <RotateCcw className="size-4" />
              Jogar novamente
            </button>
            <Link
              to="/"
              className="inline-flex w-full items-center justify-center rounded-md border border-border/60 px-6 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Voltar ao menu
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
