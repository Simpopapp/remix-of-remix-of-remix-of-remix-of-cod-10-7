<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS.md

Regras técnicas do projeto.

## Arquitetura e Ambiente
- Stack: TanStack Start (React 19), Vite, Tailwind CSS v4, Radix UI.
- Rotas: TanStack Start com roteamento baseado em arquivos em `src/routes/`. Não editar `src/routeTree.gen.ts` manualmente.
- Componentes UI: Primitivos reutilizáveis baseados em Radix UI em `src/components/ui/`.
- Hooks que leem browser APIs (ex.: áudio, mídia, storage) devem derivar suporte em `useEffect`, nunca em `typeof window` no render — SSR/cliente divergem e quebram a hidratação.
- O proxy do OpenCode expõe o runtime OpenCode na rota `/oc`. oculta nas rotas do app, só utilizar o runtime OpenCode
## Verificação e Qualidade
- Gates de verificação: `bunx vitest run` (ou `npm run test`) + `bun run build` + lint com `bunx eslint src scripts` (NUNCA `bun run lint`/`eslint .`: atravessa `public/game-assets` e trava >600 s neste ambiente — convenção desde a Fase V2; 0 erros obrigatório, warnings em `src/components/ui/*` são aceitos como pré-existentes).
- tsconfig usa `noPropertyAccessFromIndexSignature` e `exactOptionalPropertyTypes`: usar acesso por colchetes em `Record<string, unknown>` e spread condicional para props opcionais.
- um remix é ativado quando se recebe o comando "I've successfully remixed this project. What would be a good next step?" para iniciar um remix é obrigatorio usar o project monitor e seguir as regras do plan.md para evitar bugs e erros no projeto
- Nunca use o opencode para fazer tarefas de um remix
- Nunca confunda informar o monitor do projeto com fazer uma ask para o usuário (tem uma skill pra isso)
- Nunca pergunte qualquer coisa ao usuário sem ter relatado a falta dos 3 arquivos descritos no plan.md para o project-monitor antes! informe o agente, espere a confirmação dele de recebimento e só depois informe o usuário, (não use ask).


## Decisões de Arquitetura do Jogo (PROJECT1)
- Motor 3D: three.js é a única dependência 3D; sem React Three Fiber (controle direto do render loop e performance). Módulos do jogo em `src/game/**` não importam React.
- Física implementada à mão (gravidade, colisão AABB eixo a eixo, raycast do three); sem cannon-es/rapier no v1. Colliders derivam dos specs do nível (`getValidationColliders()`), nunca hardcoded no Player.
- Física do player (movimento/colisão) é TS puro e deve ter cobertura em `src/game/player/Player.test.ts` — o preview headless roda a ~3 fps e não serve para validar movimento.
- Pointer lock só após clique do usuário; perder lock = pausa (Input limpa estado e a UI reage via `pointerlockchange`).
- Integração React apenas via `<ClientOnly>` + `React.lazy` na rota `/play`; nenhum acesso a `window`/`document` fora de módulos browser-only.
- Visual v2: assets reais CC0 (PBR/HDRI/glTF) em `public/game-assets/` carregados por `src/game/assets/AssetLoader.ts`; canvas procedural só como fallback — realismo exige materiais fotográficos. Nunca usar `/assets/` (reservado ao proxy do OpenCode). Créditos em `public/game-assets/CREDITS.md`.
- Armas: dados em `src/game/data/weapons.ts`; sistema em `src/game/weapons/**` (WeaponSystem, Viewmodel, Effects, Targets) — TS puro. Dano via raycast contra meshes com `userData` (`targetId`/`zone`); recuo via mola no Player (`kickRecoil`), nunca alterando yaw/pitch diretamente.
- Sem backend para o jogo no v1; progresso em memória + preferências em localStorage.
- Inimigos/IA: dados de spawn e tuning em `src/game/data/mission1.ts`; IA em `src/game/ai/**` (Enemy FSM, Director, aiMath) — TS puro, sem React. Toda movimentação do inimigo passa por `moveToward(dt, colliders)` com os colliders do nível; chamadas sem colliders quebram em runtime ("colliders is not iterable") — nunca omitir.
- A rota `/oc` e o OpenCode runtime nunca são alterados pelo jogo.
