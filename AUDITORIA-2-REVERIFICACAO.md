# Reauditoria — AI Cost Explorer

**Data:** 2026-08-04 (segunda passagem)
**Estado auditado:** working tree em `codex/saved-calculator-scenarios`, com alterações não commitadas feitas entre 08:49 e 09:26
**Referência:** [`AUDITORIA.md`](AUDITORIA.md) — primeira passagem

---

## Veredito

**19 dos 22 achados foram corrigidos**, e as correções vieram acompanhadas de testes de regressão — que eu executei de fato, não só li. Isso é o padrão certo.

Mas a reauditoria encontrou **uma regressão nova e de alto impacto**, introduzida por uma das próprias correções: a Content-Security-Policy adicionada bloqueia as fontes do site.

| | Quantidade |
|---|---|
| Corrigidos e verificados | 19 |
| Parcialmente corrigidos | 2 |
| Em aberto (decisão sua) | 1 |
| **Regressões novas** | **1 (alta)** |

### O que rodou nesta passagem

Diferente da primeira vez, consegui **executar a suíte de testes do projeto**. Compilei `src/lib` para CommonJS e implementei um shim de `vitest` sobre `node:assert`, o que permite rodar os arquivos `*.test.ts` reais sem depender do esbuild (que sofre SIGSEGV neste sandbox).

```
19 testes | 19 passaram | 0 falharam
```

Os 9 arquivos de teste, incluindo os 6 casos novos criados junto com as correções:

- `calculator > does not require prices for zero-token cache components` → **A1**
- `calculator > ignores expired and future pricing rules` → **M3**
- `calculator > does not simulate non-token pricing as token pricing` → **M4**
- `compare > detects differences in primitive comparison keys` → **A2**
- `staleness > does not treat future verification as fresh` → **A3**
- `pareto > scores only fields with verified measurements` → **M1**

Além disso, recompilei `src/lib` do zero (sem nenhum patch meu) e reexecutei as provas empíricas da primeira auditoria contra o código atual:

```
A1  OK   cenário padrão: 26/44 com custo | sem cache: 41/44 | ofertas com preço in+out: 41
A2  OK   diferentes=true  iguais=false  nulls=false  bool/null=true
A3  OK   hoje-2d=fresh  -95d=stale  -45d=aging  futuro=unknown
M1  OK   assinatura sem speed/latency; scores = a:0.744 b:0.500
M3  OK   expirada=null  futura=null  vigente=now
M4  OK   custo=null | aviso="This offer uses non-token pricing and cannot be simulated by token inputs."
REG OK   cache PEDIDO sem preço -> total=null (comportamento correto preservado)
```

A última linha é a que mais importa: a correção de A1 **não** afrouxou a honestidade do modelo. Quando o usuário pede tokens de cache e a oferta não publica preço de cache, o total continua sendo `null`. Só o componente com zero tokens deixou de bloquear o cálculo.

Também confirmei que `data/` e `public/data/` continuam sincronizados byte a byte, e que o diff gigante em `data/` (4.779 linhas) é **apenas reformatação do Prettier** — o conteúdo do catálogo não mudou (`git diff --ignore-all-space` sai vazio).

**Continua sem execução neste ambiente:** `pnpm lint`, `pnpm build`, `pnpm test:e2e` e `pnpm format:check` — os symlinks do pnpm falham em pasta OneDrive e o esbuild dá SIGSEGV no sandbox. Rode-os localmente.

---

## R1 — REGRESSÃO NOVA (alta): a CSP bloqueia as duas fontes do site

**Arquivo:** `index.html`

A CSP adicionada para resolver o achado B7 é boa em quase tudo — verifiquei inclusive que o hash do script inline está correto:

```
sha256 calculado do <script type="application/ld+json"> : sha256-t3Yeqa57GNFVRUeZFYu3kcXDrQ/LItMMYWk0NLIO5v0=
sha256 declarado na CSP                                 : sha256-t3Yeqa57GNFVRUeZFYu3kcXDrQ/LItMMYWk0NLIO5v0=
CONFERE: True
```

O problema são estas duas diretivas:

```
style-src 'self' 'unsafe-inline';
font-src  'self' data:;
```

E a primeira linha de `src/styles.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');
```

Duas requisições serão bloqueadas pelo navegador:

1. A folha de estilo em **fonts.googleapis.com** — `style-src` não a autoriza.
2. Os arquivos de fonte em **fonts.gstatic.com** — `font-src 'self' data:` não os autoriza.

**Confirmei que o `@import` sobrevive ao build.** O Vite não faz inline de `@import` com URL remota; ele apenas o iça para o topo do CSS empacotado. No `dist/assets/index-C3rd0EJx.css` já gerado:

```css
@import"https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:...";:root{font-family:Manrope,...
```

E não há fontes auto-hospedadas em `public/` para servir de fallback.

**Impacto:** `Manrope` é a fonte de todo o corpo do site (`:root { font-family: 'Manrope', ... }`) e `DM Mono` aparece **54 vezes** em `styles.css` — é a fonte de todos os números, preços, rótulos e blocos de fórmula. Com a CSP ativa, tudo cai para as fontes de sistema. O layout não quebra, mas a identidade visual do produto sim, e num app cuja proposta é apresentar números com credibilidade isso não é cosmético.

**Duas correções possíveis:**

*Opção A — liberar o Google Fonts na CSP (mudança mínima):*

```
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src  'self' data: https://fonts.gstatic.com;
```

*Opção B — auto-hospedar as fontes (recomendada):* baixar os `.woff2` de Manrope e DM Mono para `public/fonts/`, trocar o `@import` por `@font-face` locais e manter a CSP como está. Ganhos: coerência com a postura `default-src 'self'`, uma dependência de terceiros a menos, sem vazamento de IP dos visitantes para o Google, e menos uma requisição bloqueante no carregamento.

Como o projeto vende transparência e independência, a opção B combina mais com o resto das decisões dele. Nos dois casos, vale validar a CSP com o DevTools aberto antes do deploy — uma CSP só falha em produção, silenciosamente, no console.

---

## Status de cada achado da primeira auditoria

### Corrigidos e verificados (19)

| # | Achado | Como foi corrigido | Verificação |
|---|---|---|---|
| **A1** | Simulador dava "Not verified" para 39/44 ofertas | `tokenCost` retorna `0` quando `tokens === 0` | Executado: 5 → 26 (cenário padrão) e 5 → 41 (sem cache) |
| **A2** | "Show differences only" escondia tudo | Novo `src/lib/compare.ts` com `hasDifferences()` sobre chaves primitivas; `rows` ganhou campo `keys` | Executado: diferentes=`true`, iguais=`false`, `bool/null`=`true` |
| **A3** | Relógio congelado no frescor | `getStaleness(value, now = new Date())` + `ageDays < 0 → 'unknown'` | Executado: -2d=fresh, -45d=aging, -95d=stale, futuro=unknown |
| **M1** | Pesos speed/latency só diluíam | Removidos do tipo, do denominador e da UI | Assinatura agora é `{cost, context, resources}` |
| **M2** | Eixo "Monthly simulated cost" vazio | Opção removida; `xAxis` tipado como `'input' \| 'context'` | Tipo restringe os valores possíveis |
| **M3** | `effectiveFrom`/`effectiveUntil` ignorados | Novo `isEffective()` em `choosePricingRule` | Executado: expirada=`null`, futura=`null`, vigente=`now` |
| **M4** | `PricingRule.unit` ignorado | Filtro `rule.unit === 'per_million_tokens'` + aviso dedicado | Executado: `per_second` → custo `null` e aviso específico |
| **M5** | `og:image` relativa | Trocada pela URL absoluta | `https://samvale29.github.io/ai-cost-explorer/brand/social-preview.png` |
| **M6** | Título único e sitemap incompleto | `document.title` e meta description por rota; sitemap de 5 → **50** URLs (7 rotas + 43 modelos) | `App.tsx:150-151` |
| **M9** | Advisory sem prazo de revisão | Data **2026-09-01** no `SECURITY.md` e no workflow + passo informativo `pnpm audit` sem `--ignore` em `continue-on-error` | `dependency-audit.yml:42-44` |
| **B1** | README com porta e Node errados | "Node.js 22.13+" e `localhost:4173` | Bate com `engines` e `vite.config.ts` |
| **B2** | Caminhos absolutos no `index.html` | `%BASE_URL%favicon.svg` e `%BASE_URL%manifest.webmanifest` | Funciona em dev e em produção |
| **B3** | E2E acoplado a números do catálogo | `getByText(/^\d+ offers monitored$/)`, `toBeGreaterThanOrEqual(2)`, `.first()` | Nenhum `toHaveCount(n)` fixo restante |
| **B4** | `StandardRule` com nome de componente | Extraído para `src/lib/pricing.ts` como `standardRule` | 18 usos migrados |
| **B7** | Sem CSP | CSP adicionada — **mas ver R1** | Hash do script inline confere |
| **B8** | `promo/` sem versionar | `/promo/` no `.gitignore`, com comentário explicando que o script de render fica versionado | — |
| **B9** | Lacunas de teste | Novos `catalog.test.ts`, `format.test.ts`, `compare.test.ts`, `url-state.test.ts` + casos em `pareto` e `calculator` | 19 testes, todos passando |
| **B10** | `defaultOfferIds` usava `pricing[0]` | Passou a usar `standardRule({ offer })` | — |
| — | Prettier configurado mas ausente | `prettier 3.9.6` instalado, scripts `format`/`format:check` e passo no CI | Maior linha do `App.tsx`: 6.572 → **238** caracteres |

### Parcialmente corrigidos (2)

**M8 — modularização de `App.tsx`.** O `ErrorBoundary` foi criado (`AppErrorBoundary.tsx`) e alguns primitivos saíram para `components.tsx` (234 linhas), mas `App.tsx` ainda tem **3.035 linhas** com todas as 8 páginas dentro. A formatação resolveu a legibilidade linha a linha — que era o problema mais grave —, então isso deixou de ser urgente. Mas separar as páginas em `src/pages/*.tsx` continua valendo, e agora é um refactor mecânico e de baixo risco.

**B5, B6 — detalhes menores.** `activeFilterCount` ainda usa `.filter(Boolean)`, então um filtro com valor `0` não é contado. `aria-sort` aparece uma vez em `App.tsx`; vale conferir se cobre todos os cabeçalhos ordenáveis da tabela do explorer.

### Em aberto — decisão sua (1)

**M7 — o trabalho não está no ar.** Nada mudou aqui, e agora a distância aumentou:

- Branch atual: `codex/saved-calculator-scenarios`
- `git rev-list --left-right --count origin/main...HEAD` → `1 7` (7 commits à frente, 1 atrás)
- **Todas as correções desta rodada estão sem commit** — `git status` mostra mais de 30 arquivos modificados

O `pages.yml` só publica em push para `main`. Ou seja: o site no ar ainda tem o simulador quebrado, o "differences only" quebrado e o relógio congelado. Enquanto isso o README já descreve tudo funcionando.

Sugestão de sequência: corrigir R1 → commitar em blocos temáticos (correções de cálculo, correções de UI/SEO, formatação, testes) → rebase/merge em `main` → deixar o CI rodar → deploy.

Vale separar o commit do Prettier dos commits de lógica. Do jeito que está, o diff de formatação de 4.779 linhas em `data/` vai enterrar as mudanças que realmente importam na revisão.

---

## Achado residual novo (baixo)

**standardRule vs. choosePricingRule divergem quanto ao `unit`.** A correção de M4 fez `choosePricingRule` descartar regras que não sejam `per_million_tokens`, mas `src/lib/pricing.ts` continua fazendo apenas:

```ts
return offer.pricing.find((rule) => rule.mode === 'standard');
```

Esse helper alimenta 18 pontos de exibição de preço no `App.tsx` (tabelas do explorer, comparação, cards, página de modelo). Hoje o problema é latente — as duas regras `per_second` do catálogo têm preço `null`, então nada é exibido. Mas no dia em que alguém preencher o preço por segundo do Whisper, a tabela vai mostrá-lo como se fosse USD por 1M de tokens, enquanto o simulador corretamente se recusa a calcular. As duas superfícies precisam concordar.

Correção sugerida: `standardRule` também filtrar por `unit === 'per_million_tokens'`, ou devolver a regra junto com o `unit` para que os componentes de exibição rotulem a unidade correta.

---

## Prioridade agora

1. **R1** — liberar o Google Fonts na CSP ou auto-hospedar as fontes. É o único item que quebra algo hoje.
2. **M7** — commitar, mergear em `main` e publicar. Sem isso, nenhuma das 19 correções chega ao usuário.
3. Achado residual do `standardRule` — 1 linha, evita um bug futuro difícil de rastrear.
4. Rodar localmente `pnpm format:check`, `pnpm lint`, `pnpm build` e `pnpm test:e2e` — os quatro que eu não consegui executar aqui.
5. M8 (separar páginas), B5 e B6 — quando houver folga.

---

## Fontes

Verificação feita sobre `C:\Users\r2m9\OneDrive\Documentos\AI Cost Explorer` no estado de 2026-08-04 09:26. Arquivos centrais desta passagem: `src/lib/calculator.ts`, `src/lib/compare.ts`, `src/lib/pricing.ts`, `src/lib/format.ts`, `src/lib/pareto.ts`, `src/lib/*.test.ts`, `src/app/App.tsx`, `src/app/AppErrorBoundary.tsx`, `src/app/components.tsx`, `index.html`, `src/styles.css`, `dist/assets/index-C3rd0EJx.css`, `.github/workflows/*.yml`, `package.json`, `public/sitemap.xml`.
