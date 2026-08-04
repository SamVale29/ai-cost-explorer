# Auditoria — AI Cost Explorer

> **Este documento é um retrato do código anterior às correções.** O projeto foi alterado depois desta auditoria e 19 dos 22 achados abaixo já foram corrigidos. Para o estado atual, veja [`AUDITORIA-2-REVERIFICACAO.md`](AUDITORIA-2-REVERIFICACAO.md) — que também registra uma regressão nova introduzida por uma das correções.

**Data:** 2026-08-04
**Commit auditado:** `ead2abd` (branch `codex/saved-calculator-scenarios`)
**Escopo:** código, arquitetura, segurança, dependências, testes, build, CI/CD, dados, acessibilidade, SEO e documentação.

---

## Sumário executivo

O projeto tem uma base incomum de qualidade para um v0.1.0: modelo de dados bem separado (organização / modelo / provedor / oferta / regra de preço / fonte), aritmética decimal para dinheiro, CI abrangente com permissões mínimas, validação de dados versionada e documentação honesta sobre limites.

Mas a auditoria encontrou **três defeitos de alta severidade que atingem exatamente as funcionalidades que a landing page promete**, e todos os três passam despercebidos pela suíte de testes atual:

| # | Achado | Impacto |
|---|---|---|
| **A1** | O simulador de custo devolve "Not verified" para **39 de 44 ofertas (89%)** — inclusive quando o usuário pede zero tokens de cache | A funcionalidade principal do produto está praticamente inoperante |
| **A2** | O botão "Show differences only" em `/compare` esconde **todas** as linhas comparáveis, inclusive as que de fato diferem | Recurso anunciado no README não funciona |
| **A3** | O cálculo de frescor (`getStaleness`) usa um relógio congelado em `2026-08-02` | Os selos "Fresh" nunca envelhecem — contradiz a própria metodologia publicada |

Os três são de correção pequena (poucas linhas cada) e alto retorno. Detalhes, reprodução e patch sugerido abaixo.

### Como esta auditoria foi verificada

Executado com sucesso neste ambiente:

- `data:validate` → passou (11 organizações, 43 modelos, 9 provedores, 44 ofertas)
- `benchmark:check-empty` → passou (fonte e artefato público sincronizados e vazios)
- `data:check-sources` → passou (22 referências oficiais)
- `data:health` → executado; cobertura conferida contra `public/data/catalog-health-v1.json`
- `npm audit --omit=dev` → 2 avisos *high* (react-router, ver M9)
- Reproduções empíricas em Node contra o código real compilado (A1, A2, A3, M1, M3)
- Conferência byte a byte de `public/data/*` contra `data/*` → **sincronizados**

**Não foi possível executar** neste ambiente, e portanto **não está verificado**: `pnpm lint`, `pnpm test` (vitest), `pnpm build` e `pnpm test:e2e`. Motivos: os symlinks do pnpm em pasta OneDrive retornam erro de I/O, e o binário do `esbuild` sofre SIGSEGV no sandbox Linux. O `tsc --noEmit` rodou com uma instalação npm alternativa e só acusou erros de resolução de tipos do `react-router-dom` — artefato do layout npm vs. pnpm, **não** um defeito do projeto. Recomendo rodar os quatro comandos localmente antes de aceitar este relatório como completo.

---

## Achados de alta severidade

### A1 — O simulador reporta "Not verified" para 89% das ofertas

**Arquivo:** `src/lib/calculator.ts:38-47`

`tokenCost` devolve `null` sempre que o preço é desconhecido — **mesmo quando a quantidade de tokens é zero**. E `addNullable` só soma se **todos** os quatro componentes forem não-nulos:

```ts
function tokenCost(tokens: number, price: Decimal | null): Decimal | null {
  if (price === null) return null;              // ← ignora tokens === 0
  return new Decimal(tokens).div(MILLION).mul(price);
}

function addNullable(values: Array<Decimal | null>): Decimal | null {
  const present = values.filter((value): value is Decimal => value !== null);
  if (present.length !== values.length) return null;   // ← um null derruba o total
  ...
}
```

Consequência: uma oferta que **não publica `cacheWritePrice`** nunca produz um total, ainda que o usuário tenha pedido `cacheWriteTokens: 0`. Apenas **5 das 44 ofertas** publicam `cacheWritePrice`.

**Medição no catálogo real:**

| Cenário | Ofertas com custo mensal | "Not verified" |
|---|---|---|
| Cenário padrão do app (`cachedInputTokens: 1500`) | 5 / 44 | **39** |
| Zero tokens de cache (cache irrelevante) | 5 / 44 | **39** |
| Ofertas que publicam preço de input **e** output | — | 41 de 44 |

Ou seja: 41 ofertas têm preço suficiente para uma estimativa correta, e o app mostra número para 5.

Isso também **contradiz o contrato documentado** no `README.md`: *"If a used price component is unknown, the total stays 'Not verified'"*. O componente não está sendo usado — o preço só deveria bloquear o total quando os tokens correspondentes forem > 0.

**Por que os testes não pegaram:** `src/lib/calculator.test.ts` só testa (a) uma oferta com os quatro preços presentes e (b) um preço ausente que **é** usado. O caso "ausente mas não usado" — que é a maioria do catálogo — não tem teste.

**Correção sugerida:**

```ts
function tokenCost(tokens: number, price: Decimal | null): Decimal | null {
  if (tokens === 0) return new Decimal(0);   // componente não usado não bloqueia o total
  if (price === null) return null;
  return new Decimal(tokens).div(MILLION).mul(price);
}
```

**Efeito da correção, medido:** apliquei esse patch ao código compilado e rodei contra o catálogo real.

| Cenário | Antes | Depois |
|---|---|---|
| Cenário padrão do app (`cachedInputTokens: 1500`) | 5 / 44 | **26 / 44** |
| Zero tokens de cache | 5 / 44 | **41 / 44** |

As 41 coincidem exatamente com as ofertas que publicam preço de input e output — ou seja, com a correção o app passa a mostrar número sempre que o dado existe, e "Not verified" só quando realmente falta preço para um componente em uso. As 3 restantes são as ofertas de áudio da Groq e a Cohere Command A+, que de fato não têm preço publicado.

Adicionar teste de regressão: oferta com `cachedInputPrice: null` e `cacheWritePrice: null`, entrada com `cachedInputTokens: 0` e `cacheWriteTokens: 0` → espera-se `monthlyCost` numérico e nenhum aviso de cache.

---

### A2 — "Show differences only" esconde todas as linhas

**Arquivo:** `src/app/App.tsx:298`

```ts
const displayRows = rows.filter((row) =>
  !diffOnly || !row.compare ||
  row.values.some((value, index, all) => String(value) !== String(all[0]) && index > 0)
);
```

`row.values` é um array de `ReactNode`. `String(<span>$2.00</span>)` produz `"[object Object]"` para **qualquer** elemento React, então a comparação é sempre falsa e toda linha marcada com `compare: true` é filtrada.

**Reprodução (executada):**

```
String(<span>$2.00</span>)   = "[object Object]"
String(<span>$75.00</span>)  = "[object Object]"
predicado de diferença para preços DIFERENTES -> false  (esperado: true)
```

Efeito prático: das 13 linhas da comparação, 10 são marcadas `compare: true` — ligar o switch remove todas elas e sobram apenas as três não-comparáveis (modalidades de entrada, modalidades de saída e última verificação). O README anuncia esse recurso como "differences-only view".

**Correção sugerida:** comparar valores primitivos, não nós React. Guardar as chaves de comparação ao lado dos nós:

```ts
const rows: Array<{ label: string; values: ReactNode[]; keys?: unknown[]; compare?: boolean }> = [
  {
    label: 'Input price / 1M',
    values: selected.map((o) => <Price key={o.id} value={StandardRule({ offer: o })?.inputPrice} />),
    keys: selected.map((o) => StandardRule({ offer: o })?.inputPrice ?? null),
    compare: true,
  },
  // ...
];

const displayRows = rows.filter(
  (row) => !diffOnly || !row.compare || !row.keys || new Set(row.keys.map((k) => JSON.stringify(k))).size > 1,
);
```

---

### A3 — Relógio congelado no cálculo de frescor

**Arquivo:** `src/lib/format.ts:38`

```ts
export function getStaleness(value, now = new Date('2026-08-02T12:00:00Z')): Staleness {
```

A data de referência é literal. Como todos os 44 `lastVerifiedAt` e as 22 fontes têm `checkedAt: 2026-08-02`, **cada selo do app mostrará "Fresh" para sempre**, independentemente de quanto tempo passe sem revisão do catálogo.

Isso mina diretamente a tese do produto. A página `/methodology` promete: *"Fresh 0–30 days · Aging 31–60 days · Stale 61+ days"*. Com o relógio congelado, "Aging" e "Stale" são estados inalcançáveis.

Efeito colateral relacionado: uma data no futuro (`2027-01-01`) também retorna `fresh`, porque `ageDays` fica negativo e cai no ramo `<= 30`.

O mesmo padrão aparece em `src/lib/catalog-health.ts:38`, que usa `catalog.dataAsOf` como referência — aceitável para um relatório "as of", mas então o relatório de saúde nunca sinalizará que o próprio snapshot envelheceu.

**Correção sugerida:**

```ts
export function getStaleness(value: string | null | undefined, now = new Date()): Staleness {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const ageDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (ageDays < 0) return 'unknown';   // data futura não é "fresca"
  if (ageDays <= 30) return 'fresh';
  if (ageDays <= 60) return 'aging';
  return 'stale';
}
```

Os testes que dependiam da data fixa devem passar `now` explicitamente. Considere também expor no `catalog-health` a idade do snapshot em relação a *hoje*, não só a `dataAsOf`.

---

## Achados de média severidade

### M1 — Pesos "speed" e "latency" só diluem o score

**Arquivo:** `src/lib/pareto.ts:29-30`

`speed` e `latency` entram no denominador mas nunca no numerador (não há benchmark ainda). Mover esses sliders reduz **todos** os scores proporcionalmente, sem mudar a ordem — o usuário mexe num controle que só piora os números.

Medido:

```
speed/latency = 0    -> a: 0.744  b: 0.500
speed/latency = 100  -> a: 0.212  b: 0.143   (mesma ordem, tudo menor)
```

**Correção:** ou remover os dois sliders enquanto `benchmarks` estiver vazio, ou excluí-los do denominador e rotular a UI com "sem dado medido":

```ts
const denominator = weights.cost + weights.context + weights.resources;
```

### M2 — Eixo X "Monthly simulated cost" não é implementado

**Arquivo:** `src/app/App.tsx:421` (`getAxis`)

O `<select>` oferece `monthly`, mas `getAxis` só trata `input`, `output` e `context` — qualquer outro valor retorna `null`. Selecionar "Monthly simulated cost" filtra todos os pontos e o gráfico exibe "0 offers with known axes", sem explicação. Remover a opção ou implementá-la a partir do resultado do simulador.

### M3 — `effectiveFrom` / `effectiveUntil` são ignorados

**Arquivo:** `src/lib/calculator.ts:12-18`

`choosePricingRule` filtra por `mode` e faixa de tokens, mas nunca olha as datas de vigência. Verificado: uma regra com `effectiveUntil: '2020-01-01'` continua sendo selecionada. Hoje nenhuma regra do catálogo usa esses campos, então é um risco latente — mas eles existem no tipo, na documentação e no `data-contract`, o que praticamente garante que alguém vai preenchê-los e obter preço expirado silenciosamente.

### M4 — `PricingRule.unit` é ignorado pelo simulador

**Arquivo:** `src/lib/calculator.ts:38-41`

`tokenCost` sempre divide por 1.000.000, independentemente de `unit`. O catálogo já tem duas regras `per_second` (Whisper na Groq) e o tipo prevê `per_request` e `per_image`. Hoje o problema está mascarado porque essas regras têm `inputPrice: null`; no dia em que alguém preencher o preço, o app vai apresentar um número absurdo como se fosse custo por token. Sugestão: `choosePricingRule` deve descartar regras cujo `unit !== 'per_million_tokens'` e emitir um aviso explícito de "modelo não simulável por token".

### M5 — `og:image` com caminho relativo

**Arquivo:** `index.html:12`

```html
<meta property="og:image" content="/ai-cost-explorer/brand/social-preview.png" />
```

Open Graph exige URL absoluta. Os crawlers de Facebook, LinkedIn, Slack e X não resolvem caminho relativo — o preview social vai sair sem imagem. Trocar por `https://samvale29.github.io/ai-cost-explorer/brand/social-preview.png` (o `<link rel="canonical">` logo abaixo já usa a forma absoluta correta).

### M6 — SEO: título único para 8 rotas, sitemap incompleto

Não há atualização de `document.title` nem de `<meta name="description">` por rota (nenhum uso de `document.title` ou equivalente em `src/`). `getPageTitle` existe, mas só alimenta o breadcrumb. Todas as rotas indexadas compartilham o mesmo título e descrição.

Além disso, `public/sitemap.xml` lista 5 rotas; o app tem 8 (`/compare`, `/value` e `/model/:modelId` estão de fora). E, sendo SPA sem prerender, o HTML servido a um crawler não contém o conteúdo do catálogo.

Mínimo de esforço com bom retorno: um `useEffect` no `AppShell` ajustando `document.title` e a meta description a partir de `getPageTitle`, e completar o sitemap.

### M7 — 7 commits de trabalho não estão em `main` (nem no ar)

`git rev-list --left-right --count origin/main...HEAD` → `1  7`.

O branch atual (`codex/saved-calculator-scenarios`) tem 7 commits que `main` não tem, e `main` tem 1 commit que este branch não tem. O workflow `pages.yml` só faz deploy em push para `main`. Portanto **os cenários salvos, o relatório de saúde do catálogo, as melhorias de acessibilidade e o guard de benchmark não estão no site publicado** — embora o README já os descreva. Merge (ou rebase) e deploy antes de divulgar.

### M8 — `App.tsx` concentra a aplicação inteira

449 linhas com 10 componentes de página, o contexto do catálogo, os presets do simulador e todos os componentes de UI. Linhas individuais chegam a **6.572 caracteres** (linhas 401, 445, 430, 411). Isso torna revisão de código, diff e code review praticamente inviáveis, e é a razão provável de A2 e M2 terem sobrevivido.

Não há `ErrorBoundary`: qualquer exceção de render em uma página derruba a árvore inteira para tela em branco (o `catch` do `loadCatalog` só cobre a carga do catálogo).

Sugestão de refatoração incremental, sem reescrita: mover cada página para `src/pages/*.tsx`, extrair os primitivos (`Badge`, `Price`, `Capability`, `StalenessBadge`, `EmptyState`, `SourceList`) para `src/components/`, e adicionar um `ErrorBoundary` em volta de `<Routes>`.

Detalhe relacionado: existe um `prettier.config.cjs` (`printWidth: 100`), mas **o Prettier não está nas `devDependencies`, não tem script no `package.json` e não roda no CI**. Ou seja, há uma configuração de formatação que nenhuma ferramenta aplica — o que explica as linhas de 6.572 caracteres. Instalar `prettier`, adicionar `format` e `format:check` aos scripts e um passo no CI resolveria o problema de legibilidade de uma vez.

### M9 — Advisory *high* suprimido em `react-router`

`pnpm-workspace.yaml` ignora `GHSA-qwww-vcr4-c8h2`, e o CI passa `--ignore GHSA-qwww-vcr4-c8h2`. O `npm audit` confirma que `react-router 7.18.2` está na faixa afetada (7.12.0 – 8.2.0).

A justificativa em `SECURITY.md` é tecnicamente sólida — o app usa só `BrowserRouter`/`Routes` declarativos, sem APIs RSC, e não há runtime de servidor para sofrer CSRF. **Não recomendo remover a exceção agora**, mas duas melhorias: (1) colocar uma data de revisão explícita na exceção (hoje ela não tem prazo e tende a virar permanente), e (2) o `dependency-audit.yml` roda semanalmente mas com a mesma flag `--ignore`, então ele nunca avisará quando a correção sair — vale um passo extra sem a flag, em modo `continue-on-error`, só para gerar sinal.

---

## Achados de baixa severidade

| # | Achado | Local |
|---|---|---|
| B1 | README diz "Open `http://localhost:5173/`", mas `vite.config.ts` fixa `port: 4173` com `strictPort: true`. README também pede "Node.js 20+" enquanto `engines` exige `>=22.13` e o CI usa Node 24. | `README.md`, `vite.config.ts`, `package.json` |
| B2 | `index.html` referencia `/ai-cost-explorer/favicon.svg` e `/ai-cost-explorer/manifest.webmanifest` com caminho absoluto; em `pnpm dev` a base é `/`, então os dois dão 404. Usar `%BASE_URL%`. | `index.html:17-18` |
| B3 | E2E acoplado a números do catálogo: `getByText('44 offers')`, `toHaveCount(7)` para a busca "GPT", `toHaveCount(6)` result cards. Qualquer inclusão de oferta quebra o CI por motivo errado. Preferir asserções relativas. | `e2e/smoke.spec.ts` |
| B4 | `StandardRule` tem nome de componente (PascalCase) mas é chamado como função (`StandardRule({ offer })`) em ~10 pontos. Funciona, mas quebra as regras de hooks se algum dia usar estado. Renomear para `standardRule`. | `src/app/App.tsx:178` |
| B5 | `activeFilterCount` usa `.filter(Boolean)`: um filtro com valor `0` (ex.: preço mínimo 0) não é contado nem exibido como chip. | `src/app/App.tsx:256` |
| B6 | Acessibilidade: cabeçalhos de ordenação usam `aria-pressed` no botão em vez de `aria-sort` no `<th>`; o gráfico de barras é uma `<div aria-label>` sem `role` (o AT ignora); os pontos do scatter SVG não são focáveis por teclado. | `src/app/App.tsx:270, 411, 430` |
| B7 | Nenhuma Content-Security-Policy. GitHub Pages não permite headers, mas um `<meta http-equiv="Content-Security-Policy">` restritivo é viável e barato para um app estático sem `eval` e sem `innerHTML`. | `index.html` |
| B8 | `promo/` (6,4 MB, com `.mp4` e `.zip`) e `scripts/create-promo-video.mjs` (243 linhas) estão sem versionar e sem ignorar. Decidir: commitar o script e ignorar os binários, ou ignorar tudo. | raiz |
| B9 | Lacunas de teste unitário: `scoreOffers`, `format.ts`, `catalog.ts` (`hydrateOffers`, `parseIds`) e `url-state.ts` não têm cobertura. `paretoFrontier` tem um único caso. | `src/lib/` |
| B10 | `defaultOfferIds` filtra por `offer.pricing[0]?.inputPrice` em vez da regra `standard`; se a ordem das regras mudar no JSON, a seleção padrão do simulador muda junto. | `src/app/App.tsx:371` |

---

## O que está bem feito

Vale registrar, porque é acima da média e não deveria ser desfeito numa refatoração:

**Segurança e supply chain**
- Nenhum segredo no repositório (varredura por padrões de chave: limpa). `.env` e `.env.*` ignorados, com `.env.example` explícito e comentário de aviso.
- Todos os 4 workflows com `permissions: contents: read` e `persist-credentials: false`; o job de deploy eleva permissão só onde precisa.
- `pnpm install --frozen-lockfile --ignore-scripts` em todos os workflows, mais `pnpm audit signatures`.
- Nenhum `dangerouslySetInnerHTML`, `innerHTML` ou `eval` no código.
- App estático puro, sem backend e sem tráfego de credenciais — e o `SECURITY.md` diz isso de forma verificável.
- `benchmark.ts` exige `--execute` explícito; o CI nunca dispara chamadas pagas.
- Dependabot semanal com agrupamento produção/desenvolvimento, cobrindo npm e GitHub Actions.

**Dados e integridade**
- `public/data/*` está byte a byte em sincronia com `data/*` — conferido.
- `validate-data.ts` cobre unicidade de IDs, integridade referencial, preços negativos, faixas de tier invertidas e completude de fontes.
- `benchmark-contract.ts` impede que benchmarks vazem para o artefato público sem passar pelo protocolo.
- 100% das ofertas têm fonte oficial; nenhum modelo órfão; nenhuma dupla modelo+provedor duplicada.

**Engenharia**
- `decimal.js` para dinheiro em vez de float — decisão correta e rara.
- `strict: true` no TypeScript, sem `any` no código de aplicação.
- Acessibilidade: skip-link, `:focus-visible` global, `@media (prefers-reduced-motion: reduce)`, `aria-expanded`/`aria-controls` no menu mobile, `aria-live` na contagem de resultados, `<caption class="sr-only">` na tabela.
- Documentação (`README`, `methodology.md`, `data-contract.md`, `benchmark-submission.md`, `SECURITY.md`, templates de issue) coerente e honesta sobre limitações.

---

## Plano de ação sugerido

**Agora (antes de qualquer divulgação do link)**

1. A1 — corrigir `tokenCost` + teste de regressão. *(1 linha de código; leva o simulador de 5 para 26 ofertas no cenário padrão e para 41 sem tokens de cache — medido)*
2. A3 — `getStaleness` com `now = new Date()` + guarda para data futura.
3. A2 — comparar chaves primitivas no "differences only".
4. M7 — merge para `main` e deploy; o site publicado está atrás do README.

**Esta semana**

5. M5 — `og:image` absoluta.
6. M1 — remover ou neutralizar os sliders `speed`/`latency`.
7. M2 — remover a opção de eixo "Monthly simulated cost" (ou implementá-la).
8. B1, B2 — alinhar README/porta/versão de Node e usar `%BASE_URL%` no `index.html`.
9. B8 — decidir o destino de `promo/`.

**Próximo ciclo**

10. M8 — extrair páginas e componentes de `App.tsx`; adicionar `ErrorBoundary`; colocar `prettier --check` no CI.
11. M6 — título e description por rota; completar o sitemap.
12. M3, M4 — respeitar `effectiveFrom`/`effectiveUntil` e `unit` em `choosePricingRule`.
13. B9 — cobrir `scoreOffers`, `format.ts`, `catalog.ts`; B3 — desacoplar o E2E dos números do catálogo.
14. M9 — data de revisão para a exceção do advisory + passo de auditoria sem `--ignore` em modo informativo.

---

## Fontes

Todos os achados foram apurados diretamente no repositório em `C:\Users\r2m9\OneDrive\Documentos\AI Cost Explorer`. Arquivos centrais: `src/lib/calculator.ts`, `src/lib/format.ts`, `src/lib/pareto.ts`, `src/app/App.tsx`, `index.html`, `.github/workflows/*.yml`, `data/*/index.json`, `public/data/*`, `README.md`, `SECURITY.md`.
