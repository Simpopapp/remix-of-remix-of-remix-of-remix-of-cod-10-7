# PRD de Melhoria — PROJECT1 "OPERAÇÃO: BLACKOUT" v2 (Salto Visual AAA)

> Fonte de escopo: `.opencode/project1.md` (planejamento). Este documento define o COMO.
> Precedência: planejamento > este PRD > roadmap (`.opencode/roadmap-proj.md`).
> Base técnica confirmada no código em 2026-10-05 (ver §2).
> Tipo: PRD de MELHORIA — não recria o jogo; substitui a camada visual/conteúdo
> mantendo gameplay, IA, missão e HUD já entregues (Fases 1–6 do roadmap v1).

---

## 1. Problema

### 1.1 Diagnóstico do planejamento
O usuário avaliou a v1 como "protótipo genérico de tiro feito com blocos pintados".
Pontos explícitos:
- Objetos são primitivas (caixas) que "fingem" ser caixotes, contêineres, veículos.
- Não há prédios/casas destruídos em 3D, nem relevo (terreno plano).
- Texturas são "simulações toscas" (canvas procedural) sobre blocos.
- Personagens (inimigos) e armas estão "MUITO abaixo do esperado".
- O helicóptero é só um exemplo (~2% do objetivo): TUDO deve melhorar drasticamente.
- Proibição explícita: não montar "helicóptero de blocos". Ou parece real ou não entra.

### 1.2 Diagnóstico confirmado no código
- `src/game/world/Level.ts` (452 linhas): geometria 100% `BoxGeometry`/`PlaneGeometry`.
- `src/game/world/textures.ts`: texturas geradas em canvas 2D (ruído + linhas).
- `src/game/ai/Enemy.ts`: soldado composto por caixas/cilindros, sem esqueleto.
- `src/game/weapons/Viewmodel.ts`: armas compostas por caixas, sem mãos.
- Terreno: um `PlaneGeometry` plano; sem heightmap.
- Iluminação: boa base (ACES, PCFSoft, bloom), mas sem IBL/HDRI nem SSAO.
- Nenhum asset externo carregado (`GLTFLoader` não usado).

### 1.3 Causa-raiz
A decisão v1 "texturas procedurais, sem assets pesados, total < 15 MB" (AGENTS.md)
tornou impossível o realismo. Realismo AAA no browser exige:
1. Malhas autorais (glTF) feitas em DCC, não primitivas.
2. Materiais PBR fotográficos (albedo, normal, roughness, AO) em resolução 1–2K.
3. Iluminação baseada em imagem (HDRI) + oclusão ambiente.
4. Personagens com esqueleto e animações (rig + clips).
5. Geometria de destruição modelada (paredes quebradas, vergalhões, entulho).

**Decisão D-01:** revogar o limite de 15 MB e a regra "texturas só procedurais".
Novo budget: ≤ 120 MB total, ≤ 40 MB para o primeiro frame jogável, com streaming.

---

## 2. Estado atual reaproveitado (não refazer)

| Sistema | Arquivo | Estado | Ação v2 |
|---|---|---|---|
| Engine/loop | `src/game/core/Engine.ts` | estável | estender (IBL, SSAO, loader) |
| Input | `src/game/core/Input.ts` | estável | manter |
| Player/física | `src/game/player/Player.ts` | testado 8/8 | manter; colliders novos |
| Armas (lógica) | `src/game/weapons/WeaponSystem.ts` | estável | manter |
| Viewmodel | `src/game/weapons/Viewmodel.ts` | primitivas | SUBSTITUIR por glTF + mãos |
| Efeitos | `src/game/weapons/Effects.ts` | ok | melhorar (sprites, decals) |
| IA | `src/game/ai/*` | testado | manter FSM; trocar visual |
| Enemy visual | `src/game/ai/Enemy.ts` | primitivas | SUBSTITUIR por rig skinned |
| Nível | `src/game/world/Level.ts` | primitivas | SUBSTITUIR por kit modular |
| Texturas | `src/game/world/textures.ts` | canvas | manter só como fallback |
| Missão/HUD | `src/game/mission/*`, `play.tsx` | completo | manter; recalibrar pontos |
| Áudio | `src/game/audio/Audio.ts` | sintetizado | fase opcional: samples |

Invariantes preservados (AGENTS.md):
- three.js puro, sem React Three Fiber; `src/game/**` não importa React.
- Física à mão; colliders derivados de dados do nível, nunca no Player.
- `moveToward(dt, colliders)` sempre com colliders.
- `/play` com `<ClientOnly>` + `React.lazy`; nada de `window` fora de browser-only.
- Rota `/oc` intocada.

---

## 3. Visão de qualidade (alvo)

### 3.1 Frase-alvo
"Um screenshot aleatório do jogo deve ser confundível com uma captura de um shooter
comercial de 2015–2019 rodando em qualidade média." Não buscamos paridade com COD
2023 (impossível em WebGL), mas cada objeto deve ser reconhecível pelo SILHUETA e
MATERIAL, não por uma legenda imaginária.

### 3.2 Pilares visuais
1. **Silhueta autoral:** nenhum objeto de cenário com menos de ~300 triângulos
   quando visível a < 15 m; heróis (armas, inimigos, helicóptero) 5k–40k tris.
2. **Material fotográfico:** PBR completo de bibliotecas CC0 (Poly Haven, ambientCG).
3. **Luz física:** HDRI noturno/crepúsculo como environment, sol/lua direcional,
   luzes práticas (postes, fogo), SSAO, sombras de contato.
4. **Destruição narrativa:** prédios com paredes rompidas, lajes caídas, ferragens,
   marcas de fogo, carros queimados, entulho espalhado.
5. **Relevo:** terreno com heightmap (crateras, barrancos, rampas), não plano.
6. **Vida:** fumaça volumétrica fake (sprites suaves), fogo animado, poeira,
   detritos em queda, helicóptero sobrevoando.

### 3.3 Anti-objetivos (rejeição automática em gate)
- Qualquer veículo/estrutura feito de primitivas agrupadas.
- Textura gerada em canvas aplicada a objeto herói.
- Personagem sem animação esquelética.
- Arma em primeira pessoa sem mãos/braços.
- Terreno 100% plano no espaço jogável.

---

## 4. Estratégia de assets (decisão central)

### 4.1 Por que não gerar tudo por código
Modelagem procedural em código produz exatamente o que o usuário rejeitou.
Geração 3D por IA no sandbox não é confiável. Logo: **assets CC0 de qualidade
profissional**, otimizados e versionados no projeto (`public/assets/`).

### 4.2 Fontes aprovadas (licença CC0 ou equivalente permissiva)
| Categoria | Fonte | Exemplos |
|---|---|---|
| Materiais PBR | Poly Haven, ambientCG | concreto rachado, asfalto, terra, tijolo, metal ferrugem |
| HDRI | Poly Haven | céu noturno urbano, crepúsculo com fumaça |
| Props | Poly Haven models, Quaternius, Kenney (realistas apenas) | barris, pallets, contêiner, cones, sacos de areia |
| Veículos | Poly Haven / Sketchfab CC0/CC-BY | carro destruído, helicóptero |
| Personagens | Mixamo-compatível CC0 (Quaternius realistic), three.js examples (Soldier.glb, MIT) | soldado com idle/walk/run |
| Armas | Sketchfab CC0/CC-BY (fuzil, pistola) | low/mid-poly game-ready |

Regra D-02: cada asset tem entrada em `public/assets/CREDITS.md` com fonte,
autor, licença e URL. CC-BY exige atribuição na tela de créditos.

Regra D-03: se um asset herói (helicóptero, arma) não tiver versão realista
disponível, ele é REMOVIDO do escopo da fase em vez de substituído por blocos
(diretriz literal do planejamento).

### 4.3 Pipeline de otimização
1. Download para `/tmp/assets-raw/`.
2. `gltf-transform` (CLI via bunx): `dedup`, `prune`, `weld`, `simplify` (heróis
   não), `resize --width 2048` (heróis) / `1024` (props), `webp` ou `ktx2` (UASTC
   para normal, ETC1S para albedo), `draco` ou `meshopt`.
3. Saída em `public/assets/models/*.glb` e `public/assets/textures/<mat>/*`.
4. Script reprodutível: `scripts/assets/build-assets.ts` (lista declarativa
   em `scripts/assets/manifest.json`).
5. Relatório de tamanho gerado pelo script; gate falha se ultrapassar budget.

### 4.4 Carregamento
- `src/game/assets/AssetLoader.ts` (novo, TS puro): `GLTFLoader` + `DRACOLoader`
  + `KTX2Loader` + `MeshoptDecoder`; cache por URL; progresso agregado para o
  loading screen (já existe barra de progresso real).
- Decoders servidos de `public/draco/`, `public/basis/` (sem CDN em runtime).
- Prioridades: P0 (bloqueia início: terreno, prédios próximos, arma, inimigo),
  P1 (stream após spawn: props distantes, helicóptero, veículos).
- Falha de asset P1 → objeto omitido + warning; P0 → tela de erro com retry.

---

## 5. Requisitos de melhoria (RM)

### RM-01 — Renderização e iluminação
- Environment HDRI via `PMREMGenerator` (`scene.environment`), fundo com
  skybox HDRI escurecido + névoa exponencial.
- Luz direcional "lua/incêndio" com CSM simples (2 cascatas) ou shadow camera
  seguindo o jogador (texel snapping) — decisão: shadow camera seguidora (mais
  barata) com mapa 2048.
- SSAO (`SAOPass` ou GTAO do three addons) com meia resolução; desligável.
- Color grading por LUT (`LUTPass`) — LUT "teal & orange militar" em `public/luts/`.
- SMAA como AA de pós-processamento (MSAA indisponível com composer em WebGL2
  sem render target multisample; usar `samples: 4` no RT se suportado).
- Bloom mantido, ajustado para fontes de fogo/flash.
- Presets de qualidade: Baixo/Médio/Alto/Ultra no menu de pausa (sombras, SSAO,
  resolução, distância de draw). Persistido em localStorage.
- Aceite: comparativo antes/depois no mesmo ângulo mostra AO nas quinas,
  reflexos de ambiente nos metais, sombras nítidas perto do jogador.

### RM-02 — Terreno com relevo
- `src/game/world/Terrain.ts`: malha de grade 256×256 sobre 120×120 m com
  heightmap (PNG 16-bit ou Float32 gerado offline), crateras de explosão,
  barranco ao redor do pátio, rampas de acesso.
- Material com splat de 3–4 camadas PBR (terra, asfalto rachado, cascalho,
  lama) via `onBeforeCompile` em `MeshStandardMaterial`, máscara RGBA.
- Física: `heightAt(x, z)` bilinear exposto; Player usa como chão (substitui
  `y=0` fixo) — com testes em `Player.test.ts` para rampas e degraus.
- IA: `moveToward` projeta y no terreno; LOS raycast considera terreno.
- Aceite: inclinações visíveis em screenshot; jogador sobe rampas sem tremer;
  testes de física verdes.

### RM-03 — Prédios e casas destruídos
- Kit modular glTF: paredes (inteira, rachada, com buraco, metade caída),
  laje quebrada com vergalhões, colunas expostas, escadas, janelas sem vidro,
  telhado parcialmente desabado.
- Montagem por dados em `src/game/data/level1.ts` (lista de peças + transform),
  não por código ad hoc.
- Mínimo: 1 armazém industrial danificado (objetivo C/E), 3 casas/prédios
  baixos destruídos ao redor do pátio, 1 prédio de 3 andares parcialmente
  desabado como ponto de referência visual (não precisa ser entrável).
- Decals de fuligem, marcas de bala, manchas de água (`DecalGeometry`).
- Entulho: instâncias (`InstancedMesh`) de blocos de concreto, tijolos, vigas.
- Colliders: cada peça do kit declara AABBs locais no manifesto; o nível
  transforma e publica via `getValidationColliders()` (contrato mantido).
- Aceite: nenhum prédio usa BoxGeometry; buracos nas paredes são visíveis
  e atravessáveis pela luz; colisão coerente com a malha.

### RM-04 — Props e veículos realistas
- Substituir todos os caixotes/contêineres/barris por glTF PBR.
- Veículos: 2–3 carros destruídos/queimados, 1 caminhão militar ou blindado
  abandonado.
- Helicóptero: modelo glTF realista com rotor animado (rotação do nó do
  rotor), sobrevoo scriptado na intro e no objetivo E (extração) com
  spline (`CatmullRomCurve3`), holofote cônico e downwash de poeira.
  Se não houver modelo qualificado → cortar (D-03).
- Aceite: um observador identifica cada objeto sem legenda.

### RM-05 — Personagens inimigos
- Modelo skinned com `AnimationMixer`: idle, walk, run, aim/shoot, hit react,
  death (2 variações). Base: `Soldier.glb` (three.js examples, MIT) com clips
  extras; ou pacote CC0 equivalente com uniforme tático.
- Variação: 2–3 texturas/tons de uniforme e capacete opcional.
- Mira: o tronco gira para o alvo via bone `Spine` (aditivo) durante COMBAT.
- Arma do inimigo anexada ao bone da mão direita.
- Hit zones: hitboxes invisíveis presas a bones (cabeça, tronco, membros)
  mantendo `userData.targetId/zone` — contrato com WeaponSystem preservado.
- Morte: ragdoll fora de escopo; usar clip de morte + blend, corpo permanece.
- Performance: `SkeletonUtils.clone` por instância; até 12 skinned simultâneos.
- Aceite: inimigo anda/corre com pés coerentes com velocidade (time-scale do
  clip ∝ velocidade), atira com animação, morre com clip.

### RM-06 — Armas e mãos em primeira pessoa
- Viewmodel glTF com braços/luvas e fuzil (estilo M4/AK) e pistola,
  materiais PBR 2K.
- Animações: idle sway (procedural mantido), disparo (recoil procedural +
  ferrolho animado se houver nó), recarga (clip ou procedural por nós:
  carregador sai/entra), troca de arma (baixa/sobe).
- Render em camada separada com FOV próprio (camera de viewmodel) e
  `depthTest` limpo para não atravessar paredes.
- Muzzle flash por sprite flipbook + luz pontual; cápsulas ejetadas (instanced
  com física simples).
- Aceite: close-up da arma em ADS mostra detalhes (trilho, mira, desgaste).

### RM-07 — Atmosfera e VFX
- Fumaça: sprites suaves (soft particles com depth) em colunas saindo de
  prédios em chamas; 3–5 emissores.
- Fogo: flipbook animado + luz pontual cintilante.
- Poeira/cinzas caindo (Points), névoa de altura.
- Impactos por material (concreto: poeira cinza; metal: faíscas; terra: torrões),
  decals de bala com fade.
- Aceite: screenshot sem HUD transmite "zona de guerra".

### RM-08 — Áudio (opcional, após visual)
- Samples CC0 para tiros (camadas: mecânica/estampido/cauda), passos por
  superfície, helicóptero com doppler, ambiente de guerra distante.

---

## 6. Requisitos não-funcionais

### NFR-01 Performance
- Desktop médio (GTX 1060 / M1): ≥ 55 fps em "Alto" a 1080p.
- Integrado (Iris Xe): ≥ 40 fps em "Baixo".
- Draw calls ≤ 400 (Alto); usar `InstancedMesh` e merge por material.
- Triângulos em tela ≤ 1.5 M (Alto). LOD (`THREE.LOD`) em prédios e veículos.
- Escala dinâmica de resolução (já existente) mantida.

### NFR-02 Carregamento
- Primeiro frame jogável ≤ 12 s em 50 Mbps; cache HTTP imutável para `/assets`.
- Loading screen com progresso real por bytes.

### NFR-03 Estabilidade
- Zero erros de console no fluxo completo; dispose de geometrias/texturas
  no unmount (padrão Engine existente).

### NFR-04 Manutenibilidade
- Nível e kits descritos por dados; nenhum transform mágico espalhado.
- Asset pipeline reprodutível por script.

---

## 7. Arquitetura (deltas)

```text
src/game/
  assets/
    AssetLoader.ts      (novo) loaders + cache + progresso
    manifest.ts         (novo) ids -> url, prioridade, colliders locais
  world/
    Terrain.ts          (novo) heightmap + splat + heightAt()
    Environment.ts      (novo) HDRI, lua, névoa, LUT
    LevelV2.ts          (novo) monta kit/props por dados; substitui Level.ts
    Decals.ts           (novo)
  vfx/
    Smoke.ts, Fire.ts, Debris.ts (novos)
  ai/
    EnemyVisual.ts      (novo) rig skinned + mixer; Enemy.ts delega o visual
  weapons/
    ViewmodelV2.ts      (novo) glTF + mãos; mesma interface do Viewmodel
  vehicles/
    Helicopter.ts       (novo) spline + rotor + holofote
scripts/assets/
  manifest.json, build-assets.ts
public/assets/{models,textures,hdri,luts}/, public/{draco,basis}/
```

Contratos:
- `Level` continua expondo `getValidationColliders()`, spawn e pontos da missão.
- `Enemy` mantém API pública (FSM/Director intactos); visual atrás de interface
  `EnemyView { update(dt, state, speed, aimDir); playDeath(); hitboxes }`.
- `Viewmodel` mantém métodos usados por `WeaponSystem`.
- Troca v1→v2 por flag interna até a fase final, depois remoção do código v1.

---

## 8. Escopo por fase

### Fase V1 — Pipeline de assets e iluminação física
Entrega: AssetLoader, decoders locais, script de assets, HDRI + PMREM, LUT,
SSAO, SMAA, presets de qualidade. Substituir material do chão por PBR real.
Aceite: screenshot comparativo; loading real por bytes; 0 erros.

### Fase V2 — Terreno com relevo
Entrega: Terrain.ts, heightmap, splat 4 camadas, heightAt no Player e IA.
Aceite: rampas/crateras visíveis; testes de física para declive; IA não flutua.

### Fase V3 — Cidade destruída (kit modular + props)
Entrega: kit de prédios destruídos, armazém danificado, props PBR, veículos
queimados, entulho instanciado, decals. Remoção de todas as BoxGeometry de
cenário. Colliders por manifesto.
Aceite: inspeção automatizada (`scene.traverse`) sem BoxGeometry visível
fora de colliders/debug; screenshots de 4 ângulos.

### Fase V4 — Personagens inimigos skinned
Entrega: EnemyVisual com mixer, blend por velocidade, mira no spine, arma no
bone, hitboxes por bone, clips de morte.
Aceite: testes de aiMath verdes; Playwright mostra animação mudando de estado.

### Fase V5 — Armas e mãos em primeira pessoa
Entrega: ViewmodelV2, câmera de viewmodel, recarga/troca animadas, flipbook
de flash, cápsulas.
Aceite: close-up ADS; troca e recarga visíveis em sequência de screenshots.

### Fase V6 — VFX, helicóptero e atmosfera
Entrega: fumaça, fogo, poeira, impactos por material, helicóptero realista
(ou corte documentado), integração na intro e extração.
Aceite: screenshot sem HUD "zona de guerra"; helicóptero com rotor girando.

### Fase V7 — Otimização, LOD e polish final
Entrega: LODs, instancing, auditoria de draw calls, presets calibrados,
créditos de assets, remoção do código v1, áudio samples (se houver tempo).
Aceite: métricas NFR-01 registradas (em desktop real; headless ~3 fps não
serve como medição, limitação conhecida).

---

## 9. Critérios de aceite globais
1. Nenhum objeto herói construído por primitivas.
2. Todos os materiais de superfície grandes são PBR com normal map.
3. Terreno com relevo jogável.
4. Pelo menos 4 estruturas destruídas reconhecíveis.
5. Inimigos e armas com animação e detalhe reconhecível em close-up.
6. Gameplay v1 (missão A–E) continua completo e sem regressões (vitest verde).
7. Build, lint, typecheck e vitest verdes em cada fase.
8. Créditos de assets completos.

## 10. Gates por fase
- `bun run build` OK, `bun run lint` 0 errors, `bunx vitest run` verde.
- Playwright em `/play`: carregamento até jogável, 0 erros de console,
  screenshots salvos em `/tmp/browser/v2-phaseN/`.
- Status em `docs/planning/stages/stage-V{N}-status.md`; monitor avalia.

## 11. Riscos
| Risco | Impacto | Mitigação |
|---|---|---|
| Asset realista indisponível em CC0 | alto | D-03 (cortar, nunca blocos); buscar CC-BY com crédito |
| Peso de download | médio | KTX2/Draco/meshopt, streaming P1, budget no script |
| Performance WebGL | alto | presets, LOD, instancing, SSAO meia-res |
| Kits de fontes diferentes não combinam | médio | LUT único, re-texturizar com mesmos materiais PBR |
| Colliders divergentes da malha | médio | AABBs declarados no manifesto + overlay debug (F3) |
| Headless não mede fps | baixo | métrica em desktop real, registrada como pendência |
| Licenças | médio | CREDITS.md obrigatório, verificação por gate |

## 12. Decisões registradas
- D-01 Revoga limite de 15 MB; novo budget 120 MB / 40 MB inicial.
- D-02 Créditos obrigatórios por asset.
- D-03 Sem modelo realista → corte, nunca primitivas.
- D-04 Shadow camera seguidora em vez de CSM completo.
- D-05 Sem ragdoll; clips de morte.
- D-06 Áudio por samples é a última prioridade (planejamento foca visual).
- D-07 Trocar visual atrás de interfaces para não tocar FSM/física testadas.

## 13. Fora de escopo
Multiplayer, destruição dinâmica em tempo real, ragdoll, mundo aberto,
mobile touch, WebGPU (avaliar após v2).
