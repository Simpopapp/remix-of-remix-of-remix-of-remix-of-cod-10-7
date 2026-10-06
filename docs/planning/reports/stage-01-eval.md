# Avaliação — Stage 01

**Data:** 2026-10-05
**Veredito:** concluída
**Confiança da avaliação:** média

## Resumo executivo
A Fase 1 (fundação do motor 3D cinematográfico) está implementada conforme o ROADMAP e atende aos 6 itens de aceite do PRD Anexo B §Fase 1 por inspeção de código: cena noturna industrial com materiais PBR, composer com Bloom + Vignette + Grain, metadados head corretos nas duas rotas, integração SSR-safe via ClientOnly + lazy e dispose completo. As evidências dinâmicas citadas no status (screenshots em `/tmp/browser/phase1/`, zero erros de console via Playwright) não puderam ser reconfirmadas — o diretório não existe mais neste ambiente — de modo que a confiança é média, não alta. Nada bloqueia a Fase 2.

## Cobertura de requisitos
- Atendido: `src/game/core/Engine.ts` isolado de React (loop RAF, resize, dispose, ACES 1.05, PCFSoft, pixelRatio ≤ 1.5, FOV 75); composer com RenderPass + UnrealBloomPass (threshold 0.82, "limiar alto" do PRD) + OutputPass + grade com vinheta e grão animado.
- Atendido: `src/game/world/ValidationScene.ts` — piso PBR, 7 contêineres, 11 caixotes (≥ 6 exigidos), 3 luzes práticas quentes (≥ 2), holofote SpotLight com sombra + direcional da lua com sombra, FogExp2, poeira, céu com lua em shader, câmera crane cinematográfica.
- Atendido: `src/game/world/textures.ts` — 5 texturas procedurais em canvas (concreto, asfalto, madeira, corrugado, aço); nenhum asset pesado.
- Atendido: `src/components/game/GameCanvas.tsx` (lazy, monta Engine em `useEffect`, progresso 0.15→1, cleanup com `dispose()`), `src/routes/play.tsx` (ClientOnly + Suspense + overlay de 5 etapas) e `src/routes/index.tsx` (CTA "Iniciar Missão" → `/play`, briefing, controles, aviso desktop).
- Atendido: head metadata único por rota (title, description, og:title, og:description, og:type, twitter:card); `og:image` corretamente omitido (sem hero absoluto, conforme PRD §11).
- Atendido: fronteira `src/game/**` sem imports de React (grep confirma zero ocorrências); `window`/`document` só em caminhos browser-only (construtor do Engine via `useEffect`, `createCanvas` via cena lazy). SSR-safe.
- Atendido: decisões de arquitetura registradas em `AGENTS.md` raiz (three única dep. 3D, física manual, ClientOnly + lazy, sem backend v1).
- Parcial: item 4 do aceite ("unmount sem RAF/listeners órfãos") — o código do `dispose()` está completo e correto por inspeção (cancela RAF, remove listener de resize, dispõe controller e composer), e o teste de routing existe (1/1, consistente com o alegado), mas não há teste automatizado de unmount nem artefato de log acessível; a evidência Playwright citada não persiste no ambiente.
- Ausente / não evidenciado: screenshot da cena validada (diretório `/tmp/browser/phase1/` inexistente) e log de console zerado (sem `/tmp/observability/build-errors.log` neste ambiente). Ambos são lacunas de evidência, não de código.

## Qualidade do código
Pontos fortes:
- `Engine.ts`: separação clara renderer/composer/loop; `setSceneController` + `setCameraMotion` dão costura limpa para as Fases 2–3; `trackFps` já expõe `fps` para a futura escala dinâmica (Fase 5).
- `ValidationScene.ts`: `disposables` + `animated` centralizados com `dispose()` que limpa tudo e dá `scene.clear()`; parâmetros de luz/sombra dentro das faixas do PRD (exposição 1.05, bloom sutil 0.42).
- `textures.ts`: sem acesso a DOM em module scope; `finish()` padroniza colorSpace/repeat/anisotropy.
- Rotas: PT-BR consistente; `handleProgress` estável via `useCallback([])`, logo o `useEffect [onProgress]` do canvas não reinicializa o motor.

Pontos de atenção (não bloqueiam; sugeridos para Fase 2 ou polish da Fase 6):
- `Engine.ts:121-124` — o `OutputPass` vem antes do `ShaderPass` de grade final; a grade (vinheta/grão/teal) roda em espaço de saída em vez de linear. Funciona visualmente, mas o ideal canônico seria gradear antes do `OutputPass`.
- `GameCanvas.tsx:22` — se o canvas medir zero no rAF interno, o retorno antecipado deixa o overlay travado em progresso 0.15 sem mensagem. Caso de borda raro (CSS `h-full` em container `fixed inset-0` torna improvável).
- `ValidationScene.ts:306` — `void renderer;` indica parâmetro não utilizado em `buildValidationScene`; considerar remover o parâmetro numa próxima passada.
- `ValidationScene.ts:155` — rotação dos caixotes usa `Math.random()` a cada montagem: layout não determinístico entre loads (screenshots variam). Aceitável no v1, mas seed fixo facilitaria regressão visual.
- Bulbos práticos como esferas `MeshBasicMaterial` (status já registra como pendência conhecida, refinamento na Fase 6 — de acordo).

## Discrepâncias
Nenhuma divergência material entre `stage-01-status.md` e o código: contagens (7 contêineres, 11 caixotes, 3 práticas, torre + beacon + holofote + poça + poeira + crane), passes do composer, overlay de 5 etapas e gates alegados (vitest 1/1 — um único arquivo de teste existe em `src/test/app-routing.test.tsx`) conferem. A única ressalva é que as evidências dinâmicas (screenshots, console zerado) são citadas mas não estão mais presentes no disco — ambiente efêmero é a causa provável, não contradição do builder.

## Riscos para as próximas etapas
- Sem screenshot de referência persistido no repo, a Fase 5/6 não terá baseline visual da "cena alvo" — recomendo salvar a próxima captura validada em `docs/planning/` (sobrevive a wipes) em vez de só `/tmp/`.
- Cobertura de testes hoje é só routing; ao chegar a Fase 2 (Player/Input) e Fase 4 (combate), validação dependerá de Playwright manual — aceitar e planejar, não bloquear.
- Ordem do composer (grade após OutputPass) pode gerar retrabalho se a Fase 5 calibrar teal & orange com precisão — decisão de 5 minutos na Fase 5, sem urgência.

## Recomendações
1. Antes da Fase 2, gerar um screenshot da cena e arquivá-lo em `docs/planning/` como baseline visual (prioridade média; desbloqueia comparação futura).
2. Na Fase 5, revisitar a ordem OutputPass vs. grade ao calibrar o teal & orange final (prioridade baixa).
3. Opcional: remover `void renderer;` / parâmetro não usado e considerar seed fixo nos caixotes (prioridade baixa, cabe em qualquer fase).

## Evidências consultadas
- docs/planning/PRD.md (§18 Fase 1, §7 D1–D3, §8, §11, NFR-01)
- docs/planning/ROADMAP.md (Fase 1)
- docs/planning/stages/stage-01-status.md
- src/game/core/Engine.ts (198 linhas, lido integralmente)
- src/game/world/ValidationScene.ts (335 linhas, lido integralmente)
- src/game/world/textures.ts (178 linhas, lido integralmente)
- src/components/game/GameCanvas.tsx, src/routes/play.tsx, src/routes/index.tsx (lidos integralmente)
- src/test/app-routing.test.tsx (único teste; confere "1/1 passed")
- AGENTS.md raiz (decisões PROJECT1, linhas 31–36)
- grep `from "react" | window | document` em `src/game/**` (zero imports React; browser APIs só em caminhos client-only)
- `/tmp/browser/phase1/` (inexistente) e `/tmp/observability/build-errors.log` (inexistente) — lacunas de evidência registradas
