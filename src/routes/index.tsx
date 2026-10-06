import { createFileRoute, Link } from "@tanstack/react-router";
import { Crosshair, MousePointer2, Play, Shield, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operação Blackout — FPS Cinematográfico" },
      {
        name: "description",
        content:
          "Shooter tático em primeira pessoa com apresentação cinematográfica: infiltração noturna, combate realista e missão completa, direto no browser.",
      },
      { property: "og:title", content: "Operação Blackout — FPS Cinematográfico" },
      {
        property: "og:description",
        content:
          "Shooter tático em primeira pessoa com apresentação cinematográfica: infiltração noturna, combate realista e missão completa, direto no browser.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MenuPage,
});

const controls = [
  { keys: "W A S D", label: "Movimento" },
  { keys: "Mouse", label: "Mirar" },
  { keys: "Clique esq.", label: "Atirar" },
  { keys: "Shift", label: "Correr" },
  { keys: "Ctrl", label: "Agachar" },
  { keys: "R", label: "Recarregar" },
  { keys: "1 / 2", label: "Trocar arma" },
  { keys: "E", label: "Interagir" },
];

function MenuPage() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Fundo atmosférico */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(56,120,160,0.18),transparent_55%),radial-gradient(ellipse_at_75%_80%,rgba(255,140,60,0.10),transparent_50%)]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background to-transparent" />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.015)_0px,rgba(255,255,255,0.015)_1px,transparent_1px,transparent_3px)]" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
            <Crosshair className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-[0.2em] uppercase">
            Operação Blackout
          </span>
        </div>
        <Badge
          variant="outline"
          className="border-primary/30 bg-primary/5 font-normal text-primary"
        >
          <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-emerald-400" />
          Servidor local
        </Badge>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-12">
        <section className="max-w-2xl">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.35em] text-muted-foreground">
            Missão 01 · Infiltração noturna
          </p>
          <h1 className="font-serif text-5xl leading-[1.05] font-bold tracking-tight sm:text-7xl">
            Zona Industrial
            <br />
            <span className="text-primary">Norte</span> — 02:47
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Infiltrar-se no complexo, neutralizar os sentinelas e sabotar o armazém antes do
            contra-ataque. Um FPS cinematográfico que roda direto no seu navegador — sem downloads,
            sem instalação.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/play"
              className="inline-flex items-center gap-2.5 rounded-md bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.98]"
            >
              <Play className="size-4 fill-current" />
              Iniciar Missão
            </Link>
            <span className="text-xs text-muted-foreground">
              Recomendado: computador com mouse · Chrome, Edge ou Firefox recentes
            </span>
          </div>
        </section>

        <section className="mt-14 grid gap-4 sm:grid-cols-3">
          <Card className="border-border/60 bg-card/50 backdrop-blur-xs">
            <CardHeader className="p-5 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <MousePointer2 className="size-4 text-primary" /> Controles
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-1">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                {controls.map((c) => (
                  <div key={c.keys} className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[11px] text-foreground/80">{c.keys}</span>
                    <span className="truncate">{c.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/50 backdrop-blur-xs">
            <CardHeader className="p-5 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Shield className="size-4 text-primary" /> Briefing
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-1 text-xs leading-relaxed text-muted-foreground">
              Avance até o muro externo, limpe o pátio dos sentinelas, rode o hack no armazém e
              sobreviva às ondas de contra-ataque até a extração chegar. Sua regeneração depende de
              ficar fora de fogo.
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/50 backdrop-blur-xs">
            <CardHeader className="p-5 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Wifi className="size-4 text-primary" /> Desempenho
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-1 text-xs leading-relaxed text-muted-foreground">
              Renderização 3D com iluminação cinematográfica, sombras suaves e pós-processamento de
              filme. Em computadores mais modestos, a qualidade se ajusta sozinha para manter a
              fluidez.
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/30 py-5 text-center text-xs text-muted-foreground">
        <p>Operação Blackout — construído para navegador. Teclado e mouse necessários.</p>
      </footer>
    </div>
  );
}
