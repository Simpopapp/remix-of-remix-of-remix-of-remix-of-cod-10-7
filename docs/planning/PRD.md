# PRD — PROJECT1: "OPERATION BLACKOUT" (nome de trabalho)

> PRD derivado do planejamento em `.opencode/project1.md`:
> "jogo de tiro triple A com aspecto realista e cinematográfico comparável ao COD".
>
> **Decisão de escopo registrada (regra do Plan.md §Como criar):** um FPS "AAA comparável ao COD"
> é um produto de centenas de pessoas-anos. Este PRD interpreta a intenção do planejamento e a
> traduz para o que é tecnicamente entregável nesta sandbox (web, TanStack Start, sem backend de
> assets gigantes): um **FPS realista cinematográfico jogável no browser**, com pipeline de
> rendering moderno (PBR, tone mapping ACES, bloom, névoa volumétrica, sombras suaves), combate
> tático com IA, apresentação cinematográfica (intro, letterbox, killcam lenta) e uma missão
> completa com objetivos. O alvo de qualidade é "comparável a COD" no **aspecto visual e na
> sensação de jogo** dentro dos limites do browser — não em quantidade de conteúdo.

---

## 1. Visão do produto

### 1.1 Elevator pitch
Um shooter militar em primeira pessoa, jogável direto no browser, com visual
cinematográfico realista — iluminação dramática, névoa atmosférica, pós-processamento de
filme — e game feel no padrão Call of Duty: movimento fluido, armas com recuo crível,
inimigos reativos, apresentação de missão com momentos de cinema.

### 1.2 Promessa central
Abrir o jogo e, em menos de 30 segundos, estar dentro de uma missão que **parece um filme
e joga como COD** — sem downloads de clientes, sem instalação.

### 1.3 O que NÃO é
- Não é um clone de COD com licenciamento, campanha de 6 horas ou multiplayer online.
- Não é um shooter low-poly/estilizado: o objetivo declarado é realismo.
- Não é um tech-demo estático: tem gameplay completo (mover, mirar, atirar, morrer, vencer).

---

## 2. Público-alvo e plataforma

| Item | Decisão |
|---|---|
| Público | Jogadores de FPS casuais a entusiastas que querem uma dose rápida de ação |
| Plataforma | Browser desktop (Chrome/Edge/Firefox/Safari recentes) |
| Controle | Teclado + mouse (WASD, pointer lock). Gamepad: fora do escopo v1 |
| Mobile | Fora do escopo v1. A rota `/play` mostra aviso de "melhor no desktop" |
| Idioma da UI | Português (PT-BR), consistente com o projeto |

---

## 3. Pilares de design (ordem de prioridade)

1. **Cinematografia primeiro** — toda tela deve parecer um still de filme: iluminação com
   contraste dramático, grão de filme sutil, letterbox em momentos narrativos, cores
   frias/quentes contrastadas (teal & orange moderado), bloom físico, névoa com depth.
2. **Game feel COD-like** — movimento com aceleração/desaceleração, sprint com FOV kick,
   ADS com transição suave de FOV e posição de arma, recuo com padrão determinístico,
   hitmarker + feedback sonoro imediato, muzzle flash que ilumina a cena (dynamic light).
3. **Legibilidade de combate** — o jogador sempre entende de onde vem o perigo: tracers,
   direção de dano na tela, inimigos com silhueta legível contra o fundo.
4. **Performance honesta** — 60 fps em desktop médio. Cada sistema gráfico tem custo
   orçado (ver §8) e fallback quando o frame budget estoura.

---

## 4. Estrutura de jogo

### 4.1 Fluxo de telas

```
/                → Landing: título, arte cinematográfica, botão "Iniciar Missão"
/play            → shell do jogo: canvas fullscreen + overlays (menu, HUD, pause)
   └─ estados: LOADING → MENU/INTRO → PLAYING → PAUSED → DEATH → MISSION_COMPLETE
```

- `/` tem o papel de "menu principal": arte de fundo, título do jogo, botão de iniciar,
  instruções de controles, aviso de desktop.
- `/play` carrega o motor 3D (dinâmico, ClientOnly) e orquestra os estados de jogo.
- Sem backend no v1: progresso da missão é estado de sessão (não há save persistente).
- Rota `/oc` permanece intocada (runtime OpenCode; regra do AGENTS.md do projeto).

### 4.2 Estados de jogo

| Estado | Descrição | Pointer lock | HUD |
|---|---|---|---|
| LOADING | Barra de progresso com dicas de gameplay | não | não |
| INTRO | Cinemática de abertura da missão (câmera roteirizada) | não | letterbox + subtítulos |
| PLAYING | Missão ativa | sim | completo |
| PAUSED | Menu de pausa (continuar, reiniciar, controles) | não | dimmed |
| DEATH | Morte do jogador: killcam breve + "missão falhou" + reiniciar | não | overlay de falha |
| COMPLETE | Missão concluída: estatísticas (precisão, abates, tempo) | não | overlay de vitória |

---

## 5. Requisitos funcionais

### RF-01 — Movimento em primeira pessoa (COD-like)
- WASD com aceleração (spring) e atrito; velocidade base ~4.5 m/s, sprint ~7 m/s.
- Sprint: manter Shift; cancela ADS; FOV sobe ~8° com easing.
- Agachar: Ctrl (hold), reduz altura da câmera e velocidade; melhora precisão.
- Pulo: Espaço, com gravidade realista (g ≈ 20 m/s² para game feel) e queda com
  squash sutil de câmera ao aterrissar.
- Head bob sutil ao andar/sprint (amplitude diferente por estado).
- Mouse look: sensitivity configurável (menu de pausa), sem inverter eixo Y.
- Colisão: contra geometria do nível (AABB/posição de obstáculos), sem atravessar paredes.
- bordas do mapa impedem sair da área jogável.

### RF-02 — Sistema de armas
- Arsenal v1: **fuzil de assalto** (automática, 30 balas, dano médio) e **pistola**
  (semiauto, 12 balas, dano menor, troca rápida). Número 1/2 troca, roda do mouse também.
- Viewmodel 3D com animações: idle sway (respiração), walk bob, disparo (recuo + kick),
  recarga (R, animação de mag out/in), ADS (mira centraliza, FOV ~50°, precisão sobe).
- Tiro: raycast da câmera com spread (hip fire tem spread maior; ADS quase nulo).
- Recuo: padrão vertical determinístico com dispersão horizontal aleatória leve; a câmera
  sobe e recupera (recoil recovery) como em COD.
- Muzzle flash: sprite de 1-2 frames + luz pontual dinâmica que ilumina o ambiente.
- Tracers e impactos: tracer por disparo; decal/na casca de faísca no ponto de impacto.
- Munição: contador no HUD, reserva limitada, recarga de reserva em caixas espalhadas.
- Cadência por arma (config em dados, não hardcoded na lógica).

### RF-03 — Inimigos e IA
- Soldados humanoides low-overhead (cápsula de colisão + modelo simples com máscara de
  silhueta legível; morte com ragdoll simplificado ou queda roteirizada).
- Estados: IDLE/PATROL → ALERT → COMBAT → COVER → DEAD.
  - DETECÇÃO: cone de visão (~70°, ~40 m), atenuada por distância e pela postura do
    jogador (agachado e fora de sprint reduz a taxa de detecção).
  - COMBAT: dispara rajadas com precisão imperfecta (spread cresce com distância e com
    dano sofrido), busca cobertura entre rajadas, reposiciona.
  - COMUNICAÇÃO: ao detectar, alerta inimigos próximos (raio ~25 m).
- Dano ao jogador: balas com dano por distância; direção do dano indicada no HUD (RF-05).
- Headshot: multiplier ×2 (dano x2) com hitmarker distinto.
- População por missão definida em dados (spawn points, waves, triggers).

### RF-04 — Missão e objetivos
- Uma missão completa v1: "Infiltração noturna em complexo industrial".
  1. Obj A: Avançar até o muro externo (waypoint no HUD).
  2. Obj B: Eliminar os sentinelas do pátio (contador no HUD).
  3. Obj C: Alcançar o armazém e ativar o hack (segurar E por 4 s, barra de progresso).
  4. Obj D: Sobreviver à onda de contra-ataque (3 waves) até a extração chegar.
  5. Extração: alcançar o ponto e concluir a missão.
- Waypoints: marcador 3D projetado na tela + distância em metros.
- Checkpoint: ao completar cada objetivo (reinício retoma no último objetivo).
- Fail states: HP a zero (DEATH); hacking interrompido por proximidade de inimigos não
  falha a missão, apenas reinicia o progresso do hack.

### RF-05 — HUD e feedback
- Vitalidade: barra com vinheta vermelha na borda da tela ao sofrer dano; regeneração
  estilo COD (após 4 s sem dano, regenera gradualmente).
- Crosshair dinâmico (abre com movimento/tiro, fecha em ADS/parado).
- Hitmarker no alvo (X branco; X vermelho com som distinto em abate; headshot com som).
- Direção de dano: arco vermelho na borda apontando à origem do tiro.
- Munição: armas (atual/reserva) no canto inferior direito; arma atual e arma reserva.
- Objetivo: topo com texto do objetivo ativo + waypoint marcador.
- Kill feed discreto (abates aparecem e somem).
- Indicador de interação (E) quando perto de objeto interativo.

### RF-06 — Apresentação cinematográfica
- Intro: câmera aérea sobre o complexo (crane down) até o jogador, com letterbox,
  título da missão estilo COD ("OPERAÇÃO: BLACKOUT — 02:47, Zona Industrial Norte")
  e fade para o controle do jogador.
- Subtítulos de rádio (linhas curtas do comandante durante a missão, com estilo typewriter).
- Killcam na morte: replay simplificado (últimos 2 s vistos da câmera do inimigo que matou
  ou da posição do tiro) antes do overlay de falha.
- Momento "bullet time" opcional: último abate de cada objetivo entra em slow motion
  por 0.6 s com desaturação parcial (polish; pode ser cortado se comprometer perf).
- Grain de filme + vinheta sempre ativos (intensidade baixa), letterbox só em cinemáticas.

### RF-07 — Áudio
- SFX procedurais/WebAudio (sem assets pesados): disparos (por arma, com variação),
  impacto, reload, passos (por superfície simplificada), música ambiente em camadas
  (calmo em patrol, tensão em combat, intensifica em waves), rádio/subtítulos com beep.
- Mixagem: música -12 dB sob SFX; silêncio dinâmico antes de waves (dread).
- Volume master configurável (pausa).

### RF-08 — Menus e shell
- Menu principal (rota `/`): título, "Iniciar Missão", "Controles", aviso desktop.
- Pause: continuar, reiniciar do último checkpoint, controles, volume, sair para o menu.
- Loading: barra com progresso real (compilação de shaders + geração do nível).
- Death/Complete: estatísticas (abates, precisão, tempo) + botões de ação.

### RF-09 — Qualidade e acessibilidade
- Sensibilidade de mouse e volume ajustáveis (persistidos em localStorage).
- Aviso de epilepsia leve: flashes do muzzle flash são breves e limitados.
- No pointer-lock (ESC) o jogo pausa automaticamente.
- FPS meter opcional (F3) para debug.

---

## 6. Requisitos não-funcionais

### NFR-01 — Performance (frame budget: 16.6 ms)
| Item | Orçamento |
|---|---|
| Render (cena principal) | ≤ 8 ms |
| Post-processing (bloom + grading + grain + vignette) | ≤ 3 ms |
| Lógica de jogo (IA, física simples, raycasts) | ≤ 2 ms |
| HUD/overlays React | ≤ 1 ms (fora do canvas; atualizações throttled) |
- Resolução: render em devicePixelRatio limitado a 1.5; escala dinâmica se fps < 50
  (reduz resolutionScale em 10% até 0.6 mínimo).
- Fallback: se WebGPU não disponível, WebGL2 (three padrão). Sem WebGL2 → mensagem clara.

### NFR-02 — Carregamento
- First paint do shell em < 2 s; motor 3D carregado de forma lazy (React.lazy + ClientOnly).
- Progresso de loading real: contagem de assets/módulos inicializados.
- Nenhum asset > 4 MB; total inicial do jogo < 15 MB (objetivo; texturas geradas
  proceduralmente quando possível).

### NFR-03 — Estabilidade
- Nenhum erro de console em fluxo completo (loading → intro → play → death → restart).
- Cleanup total ao desmontar a rota: sem listeners/RAF/timers órfãos (gates: teste manual
  + `vitest` de unmount, quando aplicável).
- SSR-safe: nenhum acesso a `window`/`document` fora de ClientOnly/lazy modules.

### NFR-04 — Manutenibilidade
- Dados de gameplay (armas, ondas, objetivos) em módulos de config tipados, não espalhados
  em lógica.
- Motor isolado em `src/game/**` sem depender de React (só a shell integra).
- TypeScript estrito, zero `any` implícito; lint limpo (gates §19 do AGENTS.md).

---

## 7. Stack técnica

| Camada | Escolha | Por quê |
|---|---|---|
| Motor 3D | **three.js** (+ `three/examples/jsm` postprocessing) | Padrão maduro no browser; EffectComposer/Bloom/Vignette/Grading prontos |
| Integração React | `<ClientOnly>` + `React.lazy` para o módulo do motor | Regra do projeto: import dinâmico de libs browser-only; SSR intacto |
| Estado de jogo | Store leve próprio (classe Game com event emitter) + `useSyncExternalStore` na shell | Evita re-render do React por frame; HUD lê snapshots throttled |
| Áudio | WebAudio API (síntese de SFX) | Sem assets pesados; latência zero |
| Estilo | Tailwind v4 + tokens do projeto (shadcn ui) | Consistência com o design system |
| Roteamento | TanStack Start file routes | Regra do projeto |
| Assets 3D | Geometria procedural + materiais PBR com texturas geradas (canvas/`imagegen` quando necessário) | Sem pipeline de assets; controle de peso |

**Decisões explícitas (registadas em `AGENTS.md`):**
- D1: three.js é a única dependência 3D; sem React Three Fiber (controle direto do render
  loop e menos abstração para perf).
- D2: física é implementada à mão (gravidade, colisão AABB, raycast do three) — sem
  cannon-es/rapier no v1 (peso e complexidade).
- D3: Nenhum backend para o jogo v1; progresso em memória + localStorage de preferências.

---

## 8. Arquitetura

```
src/
├── routes/
│   ├── index.tsx            → menu principal (arte cinematográfica + CTA)
│   └── play.tsx             → shell do jogo (ClientOnly + lazy Engine)
├── game/                    → isolado de React
│   ├── core/
│   │   ├── Engine.ts        → loop, renderer, composer, resize, cleanup
│   │   ├── GameState.ts     → máquina de estados + event emitter
│   │   └── Input.ts         → teclado/mouse/pointer-lock (mantido puro)
│   ├── player/
│   │   ├── Player.ts        → câmera, movimento, colisão, posturas
│   │   └── WeaponSystem.ts  → viewmodel, tiro, recuo, munição, troca
│   ├── world/
│   │   ├── Level.ts         → construção procedural do nível por dados
│   │   ├── materials.ts     → materiais PBR e texturas procedurais
│   │   └── atmosphere.ts    → luz, névoa, céu, pós-processamento
│   ├── ai/
│   │   ├── Enemy.ts         → soldado + FSM (IDLE→COMBAT→DEAD)
│   │   └── Director.ts      → spawn/waves/triggers da missão
│   ├── mission/
│   │   ├── Objectives.ts    → objetivos, waypoints, checkpoints
│   │   └── Cinematic.ts     → intro, letterbox, subtítulos, killcam
│   ├── audio/
│   │   └── Audio.ts         → síntese de SFX + camadas de música
│   └── data/
│       ├── weapons.ts       → stats de armas (tipado)
│       └── mission1.ts      → layout/objetivos/waves da missão v1
└── components/game/
    ├── Hud.tsx              → crosshair, HP, munição, objetivo, hitmarker
    └── Overlays.tsx         → loading, pause, death, complete
```

Regras de fronteira:
- `src/game/**` não importa React nem rotas; expõe API tipada (start/stop/snapshot).
- A shell React só consome snapshots (throttle ~10 Hz) via `useSyncExternalStore`.
- Texturas procedurais geradas em módulos browser-only (canvas 2D → CanvasTexture).

---

## 9. Assets e direção de arte

### 9.1 Direção visual
- **Referência:** COD MW2019 noite — contraste alto, névoa azul-fria com luzes quentes
  (holofotes, sinalizações), úmido, partículas de poeira.
- Paleta: azuis profundos (#0a1420-ish) para sombras, âmbar/laranja para luzes práticas,
  vermelho saturado reservado a alertas/dano.
- Grão de filme + vinheta + leve chromatic aberration nas bordas em dano.

### 9.2 Assets
- Texturas: geradas por canvas (concreto, metal, asfalto, placa metálica, caixote) com
  ruído e variação; normal maps derivados por filtro simples quando necessário.
- Modelos: geometria primitiva composta (containers, muros, torres, caixotes, carros
  estilizados) com materiais PBR; proporções realistas são prioridade sobre detalhe.
- Se um asset-chave ficar fraco, gerar imagem de referência/textura com `imagegen`
  (premium para textura com texto legível) — decisão por fase.

---

## 10. Escopo por fase (resumo executivo)

| Fase | Entrega | Aceite mínimo |
|---|---|---|
| 1 | Fundação do motor 3D na rota /play | Canvas com cena atmosférica cinematográfica renderizando a 60 fps, pós-processamento ativo, sem erro de console, SSR-safe |
| 2 | Movimento FPS completo | Pointer lock + WASD + sprint/crouch/jump + colisão + head bob, sensação fluida |
| 3 | Armas funcionais | Fuzil + pistola com tiro/ADS/recoil/reload/tracers/muzzle light e hitmarker em alvo de teste |
| 4 | Inimigos e combate | IA com detecção/combate/cobertura, dano ao jogador, morte/respawn de inimigos |
| 5 | Nível realista completo + áudio | Missão inteira navegável com iluminação/atmosfera/sfx/music por camada |
| 6 | Missão cinematográfica final | Objetivos A–E, intro cinemática, killcam, HUD completo, death/complete, polish |

Cada fase só avança quando os gates da seção 19 do AGENTS.md passarem e o monitor emitir
relatório em `docs/planning/reports/stage-NN-eval.md`.

---

## 11. Critérios de aceite (globais)

1. `/` apresenta o jogo com arte e copy em PT-BR; botão leva a `/play`.
2. `/play` carrega sem erro de console; engine roda a 60 fps em desktop médio.
3. O ciclo completo jogável existe: mover → mirar → atirar → matar → morrer → reiniciar.
4. Nenhuma regressão de build/teste/lint (gates).
5. Rota `/oc` e OpenCode runtime permanecem funcionais (regra do projeto).

---

## 12. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Perf de post-processing em GPU fraca | fps < 50 | Escala dinâmica de resolução; desligar bloom em fallback |
| Assets "parecem baratos" (primitivas) | Quebra a promessa de realismo | Iluminação/atmosfera carrega o visual; materiais PBR com texturas ricas; silhuetas compostas |
| Escopo inchado (IA, killcam, cinemática) | Fases atrasadas | Cada fase tem aceite mínimo; extras marcados como polish cortáveis |
| Pointer lock UX (browser prompts) | Frustação | Requer clique explícito; pausa automática ao perder lock; instruções claras |
| Regressão de SSR/hidratação | Build/preview quebram | ClientOnly + lazy import; gates de build após cada mudança |
| WebAudio autoplay policy | Áudio mudo até gesto | Inicializar áudio no primeiro clique (iniciar missão) |

---

## 13. Métricas de sucesso (v1)

- 60 fps estáveis na missão inteira em desktop médio (i5/IRIS ou equivalente).
- Zero erros de console no fluxo completo.
- Jogador consegue completar a missão em 5–10 min com desafio real (pode morrer).
- "Looks like a movie" na primeira captura de tela (validação visual por screenshot).

---

## 14. Fora de escopo (v1, registrado para evitar drift)

- Multiplayer/online, save na nuvem, contas.
- Mobile/touch, gamepad.
- Campanha com múltiplas missões (uma missão completa v1).
- Texturas fotogramétricas reais, rigs de animação humanos complexos, ragdoll físico real.
- Backend de pontuação/leaderboard.

---

## 15. Referências de qualidade (para gates visuais)

- Iluminação noturna com fonte direcional fria + práticas quentes; sombras suaves (PCFSoft).
- Tone mapping ACES Filmic; exposição ~0.9–1.1; contraste pós-grade sutil.
- Névoa exponencial com cor do céu; godrays simples via bloom nas luzes fortes.
- Post FX: Bloom (limiar alto), Vignette, Film Grain (subtle), Color grading frio.
- FOV base 75°; ADS ~50°; sprint ~83° com easing de ~0.15 s.

---

## 16. Glossário

- **ADS**: aim down sights — mirar pela mira da arma.
- **FOV kick**: mudança temporária do campo de visão em sprint.
- **Killcam**: replay curto da morte.
- **Director**: sistema que orquestra spawns/waves/triggers da missão.
- **Práticas**: luzes diegéticas do cenário (holofotes, letreiros).

---

## 17. Anexo A — Tabelas de tuning (dados de gameplay)

### 17.1 Movimento
| Parâmetro | Valor inicial | Notas |
|---|---|---|
| Velocidade base (m/s) | 4.5 | Andar normal |
| Sprint (m/s) | 7.0 | Cancela ADS e recarga |
| Aceleração (m/s²) | 40 | Spring p/ velocidade alvo |
| Desaceleração (m/s²) | 55 | Atrito ao soltar tecla |
| Gravidade (m/s²) | 20 | Game feel > realismo puro |
| Altura de pulo (m) | 1.1 | Permite subir em caixotes de 1 m |
| Altura câmera (m) | 1.7 | Em pé |
| Altura câmera agachado (m) | 1.0 | + redução de detecção (RF-03) |
| FOV base | 75° | |
| FOV sprint | 83° | Easing ~0.15 s |
| FOV ADS | 50° | Easing ~0.12 s |
| Sensibilidade padrão | 1.0 (mapeia ~0.0022 rad/px) | Configurável 0.2–3.0 |
| Head bob andar (amplitude) | 0.025 m / 2.2 Hz | |
| Head bob sprint (amplitude) | 0.05 m / 3.1 Hz | |
| Kick de aterrissagem | 0.06 m, recupera em 0.2 s | |

### 17.2 Armas (valores em src/game/data/weapons.ts)
| Parâmetro | Fuzil (AR) | Pistola |
|---|---|---|
| Dano corpo (base) | 26 | 18 |
| Dano cabeça (×) | 2.0 | 2.0 |
| Cadência (tiros/s) | 9.5 | 6.5 |
| Modo | Automática | Semiautomática |
| Carregador | 30 | 12 |
| Reserva inicial | 120 | 48 |
| Tempo de recarga (s) | 2.1 | 1.6 |
| Spread hip (°, rad interno) | 1.8 | 2.2 |
| Spread ADS (°) | 0.25 | 0.4 |
| Spread por movimento | +1.2° em sprint | +1.5° |
| Recuo vertical por tiro | 0.35° | 0.9° |
| Recuo horizontal (aleatório) | ±0.18° | ±0.35° |
| Recuperação de recuo | 65% por segundo | 65%/s |
| Alcance de dano pleno (m) | 35 | 18 |
| Falloff até (m → dano min) | 80 m → 70% | 45 m → 65% |
| Kick da viewmodel | +pos z 0.03 m, +rot x 1.5° | 0.04 m / 2.5° |
| Tracer | sim, 1 por tiro | sim |
| Muzzle light | raio 6 m, 40 ms | raio 4 m, 40 ms |

### 17.3 Inimigos
| Parâmetro | Valor | Notas |
|---|---|---|
| HP | 100 | |
| Dano por bala ao jogador | 8–14 (por distância) | |
| Precisão base | 55% hit chance a 15 m | cai ~30% a 40 m |
| Spread de rajada | cresce 12% por tiro na rajada | |
| Duração da rajada | 3–6 tiros | pausa 0.8–1.6 s entre rajadas |
| Cone de visão | 70° / 40 m | |
| Taxa de detecção | 0.6/s a 10 m, escala por proximidade | agachado: ×0.6 |
| Raio de alerta | 25 m | |
| Velocidade patrulha/combat | 1.6 / 3.4 m/s | |
| Tempo de reação | 0.35–0.6 s | aleatório por inimigo |
| Cobertura | procura ponto a ≤ 6 m com LOS bloqueado | recalcula por rajada |

### 17.4 Sobrevivência do jogador
| Parâmetro | Valor |
|---|---|
| HP máximo | 100 |
| Regeneração | após 4 s sem dano; 35 HP/s |
| Vinheta de dano | intensidade ∝ dano sofrido; fade 1.2 s |
| Efeito crítico (< 30 HP) | pulso vermelho + batimento cardíaco abafado |

### 17.5 Waves do objetivo D (contra-ataque)
| Wave | Inimigos | Origem | Nota de áudio |
|---|---|---|---|
| 1 | 4 | norte (portão) | tensão base |
| 2 | 6 | norte + leste | camada de tensão |
| 3 | 8 | norte + leste + telhado oeste | música intensa + silêncio prévia de 2 s |

---

## 18. Anexo B — Critérios de aceite detalhados por fase

### Fase 1 — Fundação do motor 3D
1. `/play` renderiza cena noturna industrial: chão com material PBR, ≥ 6 caixotes,
   ≥ 2 luzes práticas quentes, 1 holofote direcional com sombras, névoa exponencial.
2. Composer ativo: Bloom + Vignette + Grain visíveis em screenshot.
3. `document.title` e meta og/twitter corretos em `/` e `/play`.
4. Navegar `/` → `/play` → voltar não deixa RAF/listeners órfãos (verificado por log
   de dispose no console do jogo ou teste).
5. Zero erros no build, lint e console.
6. Screenshot da cena validado visualmente (evidência no reporte da fase).

### Fase 2 — Movimento
1. Pointer lock só após clique; ESC pausa e solta lock; retomar funciona.
2. Sprint muda FOV com easing perceptível; crouch abaixa câmera; pulo cai com gravidade.
3. Colisão: jogador não atravessa caixotes/muros; encostar na borda do mapa não sai.
4. Head bob presente ao andar, ausente parado; kick ao aterrissar.
5. Sensibilidade ajustável em pause persiste após reload (localStorage).

### Fase 3 — Armas
1. Trocar arma (1/2/roda) com animação de rebaixamento/levantamento < 0.5 s.
2. ADS: FOV anima, mira centraliza, spread cai; atirar em ADS é preciso.
3. Recuo: burst de 5 tiros a 15 m em parede forma padrão vertical com leve dispersão.
4. Recarga: R inicia animação; munição atualiza no fim; cancelamento ao trocar arma.
5. Muzzle flash ilumina o chão próximo (luz dinâmica) e some em ≤ 60 ms.
6. Hitmarker em alvo de teste + destruição/queda do alvo após HP esgotado.

### Fase 4 — Inimigos
1. Inimigo patrulhando detecta o jogador dentro do cone com reação em < 0.6 s.
2. Em combate, alterna rajadas e cobertura; não atravessa geometria.
3. Ao ser alertado por companheiro, entra em combate mesmo fora do cone.
4. Headshot mata em 2 tiros; corpo em 4; hitmarker distinto em headshot.
5. Dano recebido mostra arco direcional; HP regenera após 4 s sem dano.
6. 8 inimigos simultâneos: fps ≥ 50 no desktop de referência.

### Fase 5 — Nível + áudio
1. Missão completa navegável do spawn até a extração sem bloqueios de geometria.
2. Atmosfera final: teal & orange legível, névoa, poeira em raios de luz.
3. SFX por evento (disparo, passo, reload, impacto, UI) sem cortes e sem erro de autoplay
   (áudio inicia após clique).
4. Música muda de camada ao entrar em combate e retorna ao acalmar.
5. Escala dinâmica de resolução ativa: cai fps < 50 → reduz scale; sobe → recupera.

### Fase 6 — Missão final
1. Intro cinematográfica roda 1×, com letterbox e título da missão; pode ser pulada (Enter).
2. Objetivos A–E em sequência com waypoints e checkpoints funcionais.
3. Morte → killcam breve → overlay de falha → reiniciar retoma do último checkpoint.
4. Conclusão mostra estatísticas (tempo, abates, precisão).
5. Fluxo completo sem erro de console; rota `/oc` intacta.

---

## 19. Anexo C — Matriz de QA (regressão por fase)

| Cenário | Fase a partir de | Como validar |
|---|---|---|
| Build + lint + tipos | todas | Gates §19 (bunx vitest run, bun run build, bun run lint) |
| Console limpo em `/play` | 1+ | Playwright: capturar console, zero erros |
| Unmount limpo (voltar ao menu) | 1+ | Playwright: navegar e voltar, sem erros/warnings novos |
| Movimento fluido | 2+ | Teste manual + screenshot; fps meter F3 ≥ 55 |
| Combate ponta a ponta | 4+ | Playwright: script de movimento+tiro em alvo; validar hit |
| Missão completa | 6 | Playthrough manual cronometrado + screenshots por objetivo |
| Performance sob carga | 5+ | 8 inimigos + partículas: fps ≥ 50 |

---

## 20. Anexo D — Estratégia de dados da missão 1 (layout)

Coordenadas em metros; origem no centro do pátio industrial. Referência para Level.ts.

```
ZONA (120 × 90 m, cercada):
  Sul (spawn, z=+40): ponto de inserção atrás de contêineres
  Centro: pátio aberto com 10–14 coberturas (caixotes, contêineres, carro)
  Norte (z=-35): portão de entrada dos waves
  Leste (x=+45): anexo com torre de vigia
  Oeste (x=-40): armazém (obj C: hack)
  Extração: sul, ao lado do spawn (ativada após waves)
```

| Elemento | Posição aproximada | Função |
|---|---|---|
| Spawn | (0, +40) | início, Obj A |
| Muro externo | z=+20, gap central | Obj A: avançar |
| Sentinelas pátio | 5 patrulhas fixas | Obj B |
| Armazém (hack) | (-40, 0) | Obj C: segurar E |
| Pontos de wave | portão norte + anexo leste + telhado oeste | Obj D |
| Extração | (0, +42) | Obj E |

Cobertura: cada caixote/contêiner é registrado como AABB de cobertura para IA (Fase 4).

---

## 21. Anexo E — Checklist de entrega (cada fase)

- [ ] Código em `src/game/**` (ou rotas) com TypeScript estrito, sem `any` implícito.
- [ ] Gates: build OK, lint OK, testes OK, preview sem erros de console.
- [ ] Evidência visual (screenshot) anexada ao status da fase.
- [ ] `docs/planning/stages/stage-NN-status.md` escrito antes de chamar o monitor.
- [ ] Relatório do monitor em `docs/planning/reports/stage-NN-eval.md`.
- [ ] Decisões novas (bibliotecas, padrões) registradas em `AGENTS.md` da raiz.
