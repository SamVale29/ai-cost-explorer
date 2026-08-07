# Auditoria 4 — auditoria completa e independente

**Data:** 2026-08-06
**Alvo:** `C:\AI Cost Explorer` — branch `codex/saved-calculator-scenarios`, commit `c68e9bc`
**Método:** auditoria do zero, sem assumir que os achados das auditorias 1–3 continuam válidos. Toda afirmação abaixo foi reproduzida em execução real, com instalação limpa (`pnpm install --frozen-lockfile`, pnpm 11.6.0, Node 22.22).

---

## 1. Painel de achados

| ID | Severidade | Achado | Impacto |
|---|---|---|---|
| A4-1 | **Alto** | Preços divergentes da fonte oficial citada (gpt-5.6-luna 5×, gpt-5.6-terra 25%) | Números errados no ar |
| A4-2 | **Alto** | Claude Sonnet 5 perde o preço em 31/08 e a regra sucessora já publicada não existe | Oferta fica "Not verified" em 25 dias |
| A4-3 | **Alto** | Preço não verificado do modo `standard` é silenciosamente substituído pelo preço `batch` | Viola a política de `null`; erra o custo sem aviso |
| A4-4 | Médio | Tokens de cache não são limitados, apesar do aviso afirmar que foram | Superestima o custo |
| A4-5 | Médio | `dataAsOf`/`generatedAt` fixos no código; frescor nunca degrada | "0 stale" é estrutural, não medido |
| A4-6 | Médio | `pricing:watch` só verifica se a URL responde, nunca compara preços | Incapaz de detectar A4-1 |
| A4-7 | Médio | Texto de 8–10 px em `--muted-2` reprova o contraste WCAG AA | Acessibilidade e legibilidade |
| A4-8 | Médio | Value score trata campo não verificado como zero | Contradiz o próprio data-contract |
| A4-9 | Médio | `App.tsx` com 3.035 linhas e zero testes de componente | 70% do código sem rede de proteção |
| A4-10 | Baixo | `zod` em `dependencies` e nunca importado | Dependência morta |
| A4-11 | Baixo | `sharp` <0.35 com 4 CVEs high fora do escopo do audit da CI | 6 PRs do Dependabot parados |
| A4-12 | Baixo | Hash CSP do JSON-LD sem teste de regressão | Quebra silenciosa em edição futura |
| A4-13 | Baixo | `frame-ancestors` via `<meta>` é ignorado pelos navegadores | Proteção aparente, não real |
| A4-14 | Baixo | Source maps (1,83 MB) publicados em produção | Peso do artefato |
| A4-15 | Baixo | `annual = monthly × 12` com 30 dias/mês = 360 dias/ano | Subestima ~1,4% |
| A4-16 | Baixo | Actions fixadas por tag, não por SHA | Superfície de supply chain |

**Portões de qualidade: todos passam.** `typecheck`, `lint --max-warnings=0`, `format:check`, `data:validate`, `data:check-sources`, `build` — saída limpa. 21 testes em 10 arquivos, 21 passaram.

O código está limpo, tipado e consistente. Os problemas encontrados não estão na forma, estão na **fidelidade dos números e na capacidade do projeto de detectar quando eles envelhecem** — que é exatamente a promessa central do produto.

---

## 2. Achados de severidade alta

### A4-1 — dois preços divergem da fonte oficial que o próprio catálogo cita

O catálogo registra a fonte `https://developers.openai.com/api/docs/models` para as três ofertas GPT-5.6. Consultei essa página hoje (06/08) e a página específica do modelo:

| Oferta | Catálogo (in / out) | Fonte oficial hoje (in / out) | Divergência |
|---|---|---|---|
| `gpt-5.6-sol` | 5,00 / 30,00 | 5,00 / 30,00 | — correto |
| `gpt-5.6-terra` | **2,50 / 15,00** | **2,00 / 12,00** | +25% |
| `gpt-5.6-luna` | **1,00 / 6,00** | **0,20 / 1,20** | **+400% (5×)** |

A página do modelo Luna confirma: `Input $0.2 · Cached input $0.02 · Output $1.2 / 1M tokens`.

Consequências concretas:

- Um usuário simulando 10 M tokens/dia em `gpt-5.6-luna` vê **$300/mês** quando o custo real seria **$60/mês**. O erro é do tamanho da decisão que a ferramenta se propõe a apoiar.
- O `cachedInputPrice` das três ofertas GPT-5.6 está `null` ("Not verified"), mas a OpenAI publica esses valores na mesma página citada ($0,02 para Luna, $0,20 para Terra). Aqui o `null` não representa ausência na fonte — representa uma leitura incompleta da fonte.

Os demais provedores que consegui verificar batem: Anthropic (Fable 5 10/50, Opus 5 5/25, Sonnet 4.6 3/15, Haiku 4.5 1/5, incluindo os multiplicadores de cache 0,1× e 1,25×) e DeepSeek (v4-flash 0,14 / 0,0028 / 0,28 e v4-pro 0,435 / 0,003625 / 0,87) estão idênticos à fonte oficial.

**Correção:** revisar as três ofertas OpenAI, preencher `cachedInputPrice`, e registrar em `data/history` o evento de mudança se a alteração for do lado do provedor.

### A4-2 — Claude Sonnet 5 fica sem preço a partir de 31/08

A regra `anthropic-sonnet-5-standard` tem `effectiveUntil: "2026-08-31"` e **não existe regra sucessora**, embora a Anthropic já publique o preço que entra em vigor: $3 / $15 por MTok a partir de 01/09/2026.

Simulei `choosePricingRule` com o catálogo real em quatro datas:

| Data simulada | Regra escolhida |
|---|---|
| 2026-08-06 | `anthropic-sonnet-5-standard` (in = 2) |
| **2026-08-31** | **nenhuma → UI mostra "Not verified"** |
| 2026-09-01 | nenhuma |
| 2026-10-01 | nenhuma |

Dois defeitos somados:

1. **Falta a regra sucessora.** O modelo de dados suporta `effectiveFrom` — o campo existe, o calculador o honra, e apenas duas regras em todo o catálogo o usam. A informação está pública desde já; a ausência transforma uma transição conhecida em um buraco no catálogo.
2. **Erro de um dia no limite.** `isEffective` faz `effectiveUntil >= now`, e `"2026-08-31"` é interpretado como `2026-08-31T00:00:00Z`. O preço promocional vale **até o fim** de 31/08, mas a aplicação o descarta à meia-noite do próprio dia 31 — 24 horas antes. Datas puras em `effectiveUntil` precisam ser tratadas como fim do dia.

**Correção:** normalizar `effectiveUntil` sem hora para `T23:59:59.999Z` e cadastrar a regra `effectiveFrom: "2026-09-01"` com 3 / 0,3 / 3,75 / 15 (e a batch correspondente 1,5 / 7,5).

### A4-3 — preço `batch` é usado como se fosse `standard` quando o `standard` não foi verificado

`mixedPrice` (`src/lib/calculator.ts:47-59`) faz o blend entre modo padrão e batch assim:

```ts
const base = new Decimal(standardPrice ?? batchPrice ?? 0);
const batchValue = new Decimal(batchPrice ?? standardPrice ?? 0);
return base.mul(new Decimal(1).sub(batchRate)).add(batchValue.mul(batchRate));
```

O `??` faz um dos modos cobrir a lacuna do outro. Com `batchRate = 0` — ou seja, o usuário **não pediu batch nenhum** — o preço batch acaba aplicado a 100% da fatia padrão. Reproduzi com uma oferta sintética (padrão in = 2, batch in = 1):

| Cenário | `batchRate` | Esperado | Obtido |
|---|---|---|---|
| `standard.inputPrice = null`, `batch.inputPrice = 1` | 0 | `null` + aviso | **1,00, sem nenhum aviso** |
| `standard.cachedInputPrice = null`, `batch.cachedInputPrice = 0,25` | 0 | `null` + aviso | **0,25, sem nenhum aviso** |

Isso contraria três compromissos escritos do próprio projeto:

- `docs/data-contract.md`: "`null` significa 'não verificado na fonte citada'. Não significa zero, grátis, sem suporte ou de menor qualidade."
- `docs/methodology.md`: "Batch é uma mistura ponderada sobre a fração escolhida; **não é aplicado a uma oferta que não publica regra de batch**."
- O aviso "não verificado" só dispara quando **os dois** modos estão nulos, então o usuário nunca é informado da substituição.

É a mesma classe do achado A1 da auditoria 1 (que foi corrigido para o caso de regra única). A guarda de regressão existente não cobre o caso padrão+batch.

**Correção:** `mixedPrice` deve retornar `null` quando o preço do modo efetivamente usado estiver ausente, em vez de cair no outro modo. Com `batchRate = 0`, o preço batch não deve influenciar nada.

---

## 3. Achados de severidade média

### A4-4 — os tokens de cache não são limitados, mas o aviso diz que foram

`calculateOfferCost` calcula `standardTokens = max(0, total − cached − write)` e emite:

> "Cache and cache-write tokens were capped at the request input total."

Nenhum limite é de fato aplicado. Com `inputTokens = 1.000.000` e `cachedInputTokens = 5.000.000`:

| | Valor |
|---|---|
| Custo se realmente limitado a 1 M @ $0,50 | **$0,50** |
| Custo obtido | **$2,50** |
| Aviso exibido | "…were capped at the request input total." |

O usuário recebe um custo 5× maior que o próprio cenário que descreveu, junto de uma mensagem afirmando que a entrada foi corrigida. A metodologia publicada também afirma que "os tokens em cache nunca são contados duas vezes" — aqui eles são contados fora do total da requisição.

**Correção:** ou limitar de verdade (`cached = min(cached, total)`, depois `write = min(write, total − cached)`), ou trocar o aviso por um que descreva o que acontece. A primeira opção é a que corresponde ao texto já publicado.

### A4-5 — a data de referência do catálogo está fixa no código, então nada nunca envelhece

`scripts/build-catalog.ts:38-39`:

```ts
generatedAt: '2026-08-02T00:00:00Z',
dataAsOf: '2026-08-02',
```

São literais. Rodei `pnpm build` hoje, 06/08, e o artefato publicado continua declarando que foi gerado em 02/08. Pior: `catalog-health` mede o frescor das fontes **contra `dataAsOf`**, e todas as 22 fontes têm `checkedAt` exatamente `2026-08-02`. A distância é sempre zero.

Rodando `calculateCatalogHealth` sobre o catálogo real com âncoras diferentes:

| Âncora | fresh | aging | stale |
|---|---|---|---|
| `dataAsOf` fixo (o que é publicado) | 22 | 0 | 0 |
| Data de hoje (06/08) | 22 | 0 | 0 |
| Se ninguém atualizar até 01/12 | 0 | 0 | **22** |

O terceiro cenário é o que a realidade produziria — mas o relatório publicado continuaria dizendo "22 fresh, 0 stale", porque a âncora não se move. O painel de frescor é, por construção, incapaz de reportar dados velhos. E a UI mostra esse literal em quatro lugares ("Data as of…", "Catalog checked…", "updated…").

**Correção:** derivar `dataAsOf` do maior `checkedAt` presente nos dados, `generatedAt` de `new Date()` no momento do build, e medir o frescor contra a data corrente do build. Aí o indicador passa a significar alguma coisa.

### A4-6 — a vigilância de preços não vigia preços

`pricing-watch.yml` roda toda segunda-feira e executa `scripts/pricing-watch.ts`, que faz `HEAD` em cada URL de fonte e informa quais não responderam. É um monitor de *link quebrado*, não de *preço mudado*. A divergência do A4-1 estava presente enquanto todas as 22 URLs respondiam 200 — o workflow passaria verde.

Além disso, o resultado só vai para o log da execução: nenhuma issue é aberta, nenhuma notificação é enviada, e workflows agendados no GitHub são desativados após 60 dias sem atividade no repositório.

**Correção:** extrair os valores numéricos das páginas que expõem preço em texto (Anthropic, DeepSeek, OpenAI e Mistral servem markdown ou tabelas legíveis), comparar com o catálogo e abrir issue automática na divergência. Um comparador que cubra só 4 dos 9 provedores já teria pego este caso.

### A4-7 — texto de 8 a 10 pixels em cor que reprova o contraste

Calculei a razão de contraste WCAG das variáveis do tema:

| Cor | Sobre `--bg` | Sobre `--panel` | Mínimo AA (texto normal) |
|---|---|---|---|
| `--muted-2` tema escuro (#66768f) | 4,21 | 3,81 | 4,5 — **reprova** |
| `--muted-2` tema claro (#8190a4) | 3,03 | 3,25 | 4,5 — **reprova** |
| `--mint` tema claro (#1e9a72) | 3,30 | 3,55 | 4,5 — **reprova** |
| `--gold` tema claro (#a76b06) | 4,12 | 4,42 | 4,5 — **reprova por pouco** |
| `--muted` tema claro (#63738b) | 4,487 | 4,82 | 4,5 — **reprova sobre `--bg` por 0,013** |
| `--muted` tema escuro (#8493aa) | 6,23 | 5,63 | passa |
| `--text` (ambos temas) | 15,08–17,23 | 15,57–16,21 | passa |

`--muted-2` é usado como cor de texto em 28 regras, e os tamanhos envolvidos afastam qualquer isenção de "texto grande":

| Seletor | Tamanho |
|---|---|
| `.data-table th` | **8 px** |
| `.model-cell small`, `.numeric-cell small`, `.comparison-offer-head small` | **8 px** |
| `.nav-label`, `.nav-count`, `.hero-footnote`, `.stat-card small` | **9 px** |
| `.unknown-value`, `.disclaimer` | **10 px** |

Vale destacar `.disclaimer`: o texto "Estimate only. Verify current pricing with the provider before making purchasing decisions." — o aviso de maior peso da página — é renderizado a 10 px na cor de menor contraste do tema, em três telas diferentes.

O `e2e/accessibility.spec.ts` existe, mas verifica apenas `aria-expanded`, o backdrop do menu e o skip link. Nenhuma verificação de contraste.

**Correção:** escurecer `--muted-2` até ≥4,5:1 nos dois temas (no tema claro algo próximo de `#5b6a80`), subir os 8 px para no mínimo 11–12 px, e adicionar `@axe-core/playwright` ao E2E para transformar isso em portão automático.

### A4-8 — o value score trata "não verificado" como zero

`scoreOffers` (`src/lib/pareto.ts:43-59`):

```ts
const resourceScore = [functionCalling, structuredOutputs, promptCaching]
  .filter((value) => value === true).length / 3;
...
score = ((costScore ?? 0) * wc + (contextScore ?? 0) * wx + resourceScore * wr) / denom;
```

Uma capability `null` cai no mesmo balde que `false`, e um preço não verificado entra na soma como `0` — ou seja, pontuado como se fosse a pior oferta da lista. No catálogo real isso atinge:

- **15 de 44 ofertas** têm ao menos uma capability não verificada (toda a linha Cohere, entre outras);
- **3 ofertas** sem `inputPrice` verificado recebem `costScore` 0.

O `data-contract.md` diz literalmente que `null` "não significa zero, grátis, sem suporte ou de menor qualidade" e que a UI "evita usá-los como valores conhecidos". A fronteira de Pareto respeita isso; o value score não.

**Correção:** normalizar o score apenas sobre as dimensões conhecidas (redistribuir o peso) e exibir quantos campos entraram no cálculo — o valor `knownFields` já é calculado e retornado, só não é usado para isso.

### A4-9 — 3.035 linhas sem teste unitário e sem medição de cobertura

| Área | Linhas | Testes |
|---|---|---|
| `src/lib/` | 1.304 | 21 testes, 10 arquivos |
| `src/app/App.tsx` | **3.035** | **nenhum** |

`@testing-library/react` e `@testing-library/jest-dom` estão instalados e **nunca são importados** em lugar nenhum. Não há configuração de cobertura no `vitest.config.ts`. A lógica pura está bem coberta — os defeitos A4-3, A4-4 e A4-8 estão justamente nas bordas que os testes existentes não exercitam, e nada cobre renderização, estado de formulário ou os fluxos de erro da UI.

O E2E cobre 6 cenários de navegador, o que ajuda, mas não substitui teste de unidade em um arquivo desse tamanho — e não pôde ser executado nesta auditoria (ver limitações).

**Correção:** quebrar `App.tsx` por rota, adicionar `--coverage` com limiar mínimo, e começar pelos componentes que formatam preço e exibem avisos.

---

## 4. Achados de severidade baixa

**A4-10 — `zod` nunca é importado.** Está em `dependencies` (produção), não em `devDependencies`, e nenhum arquivo em `src/`, `scripts/` ou `e2e/` faz `import ... from 'zod'`. A validação em `scripts/validate-data.ts` é manual. Remover, ou usá-lo de fato para validar o contrato de dados — a segunda opção seria uma melhoria real sobre a validação artesanal atual.

**A4-11 — `sharp` com CVEs e Dependabot parado.** `pnpm audit` completo aponta `sharp <0.35.0` com CVE-2026-33327/33328/35590/35591 (high, corrigido em ≥0.35.0). A CI só roda `pnpm audit --prod`, então nunca vê isso. É ferramenta de build local (geração de OG image e screenshots), risco baixo, mas há correção disponível. Há **6 PRs do Dependabot abertos sem merge**, incluindo o grupo de 12 atualizações de dev. A exceção documentada do React Router (`GHSA-qwww-vcr4-c8h2`) está corretamente registrada em `pnpm-workspace.yaml` e na `SECURITY.md`, e a data de revisão — **01/09/2026** — vence em 26 dias.

**A4-12 — hash CSP sem teste.** A CSP em `index.html` autoriza o JSON-LD por `sha256-t3Yeqa57GNFVRUeZFYu3kcXDrQ/LItMMYWk0NLIO5v0=`. Recalculei o hash do bloco no `dist/index.html`: **confere exatamente**. Mas qualquer edição futura no JSON-LD (mudar a descrição, o autor, a licença) quebra o casamento em silêncio. Um teste de 5 linhas que recalcula o hash e compara evitaria isso.

**A4-13 — `frame-ancestors` em `<meta>` não faz nada.** A especificação CSP ignora `frame-ancestors` (e `report-uri` e `sandbox`) quando entregues via `<meta http-equiv>`; a diretiva só vale em cabeçalho HTTP. O GitHub Pages não permite cabeçalhos customizados, então a proteção declarada contra clickjacking não está em vigor. O risco real é baixo (app estático, sem sessão nem ação destrutiva), mas a diretiva sugere uma proteção que não existe. Vale um comentário no HTML dizendo isso, ou removê-la.

**A4-14 — source maps em produção.** `vite.config.ts` usa `sourcemap: true`. O `index-Dm-uBDau.js.map` tem 1,83 MB e está servido publicamente (confirmei o download). Para um projeto MIT com código aberto não há exposição, mas é 5× o peso do bundle no artefato de deploy. Se for intencional, vale documentar; se não, `sourcemap: false` em produção.

**A4-15 — o ano tem 360 dias.** `annual = monthly × 12`, e `monthly = daily × daysPerMonth` (padrão 30). Confirmado na execução: diário $2 → mensal $60 → anual $720, o equivalente a 360 dias. A fórmula está documentada em `README.md` e em `docs/methodology.md`, então não é engano escondido — mas subestima o ano em ~1,4%, e a projeção anual é justamente o número que alguém leva para uma reunião de orçamento.

**A4-16 — actions por tag.** Todos os workflows usam `actions/checkout@v6`, `setup-node@v7`, `pnpm/action-setup@v6` etc. Tags são mutáveis. Fixar por SHA (o Dependabot atualiza SHAs normalmente) fecha a janela de comprometimento de tag. As permissões estão bem feitas: `contents: read` no topo de todos os workflows, `pages: write`/`id-token: write` isolados só no job de deploy, `persist-credentials: false` em todos os checkouts, `--ignore-scripts` na instalação.

---

## 5. O que foi verificado e está correto

Executado nesta auditoria, com saída limpa:

```
typecheck (tsc --noEmit)         exit 0
lint (eslint --max-warnings=0)   exit 0
format:check (prettier)          exit 0
data:validate                    11 orgs, 43 modelos, 9 provedores, 44 ofertas
data:check-sources               22 URLs válidas
data:health                      93% preço in/out, 93% contexto, 100% fontes
build                            363,81 kB JS (112,95 kB gzip) + 50,08 kB CSS
test (vitest)                    10 arquivos, 21 testes, 21 passaram
```

Verificações adicionais que passaram:

- **Sincronismo `data/` ↔ `public/data/`**: as 7 entidades são byte a byte idênticas entre a fonte da verdade e o artefato publicado.
- **Segredos**: nenhum segredo no código, nos dados, nos workflows ou no histórico do Git. `.env*` está no `.gitignore` com exceção correta para `.env.example`. `scripts/benchmark.ts` lê a chave de `process.env`, falha explicitamente se ausente e nunca a escreve em disco.
- **XSS**: nenhum `dangerouslySetInnerHTML`, `innerHTML`, `eval` ou `new Function` em todo o projeto. Os 11 `target="_blank"` têm todos `rel="noreferrer"`.
- **Entrada não confiável**: o estado do calculador vindo da URL passa por `isCalculatorInput`, que rejeita não-finitos, negativos e taxas acima de 1. Cenários importados de JSON passam pelo mesmo filtro, com limite de 12. `localStorage` é lido dentro de `try/catch` e a aplicação continua funcionando sem persistência.
- **Aritmética**: `decimal.js` em todo o caminho de preço; o teste de mistura padrão/batch confere ao centavo.
- **Deploy em dia**: os assets servidos em `samvale29.github.io/ai-cost-explorer` (`index-Dm-uBDau.js.map`, `dm-mono-400-4GdczIuU.woff2`) têm exatamente os hashes que meu build local desta branch produziu. **O que está no ar é este código** — a pendência que a auditoria 3 deixou em aberto foi resolvida. A referência local `origin/main` está defasada (último fetch em 02/08) e sugere o contrário; um `git fetch` corrige a leitura.
- **Licença de fontes (H1 da auditoria 3)**: `OFL.txt` presente, completo, com as duas linhas de copyright, e os três WOFF2 íntegros. Confirmado também no site publicado.
- **Finais de linha (H2 da auditoria 3)**: `.gitattributes` em vigor, working tree limpo, sem diff fantasma.

---

## 6. Limitações desta auditoria

Declaro o que **não** pude verificar, para que não seja lido como aprovação:

1. **E2E não executado.** O ambiente Linux desta sessão não consegue baixar o Chromium do Playwright (rede restrita). Os 6 cenários de `e2e/` foram lidos, não executados. A CI os roda.
2. **Verificação de preço parcial.** Consegui confrontar com a fonte oficial 3 provedores dos 9 (OpenAI, Anthropic, DeepSeek) — 12 das 44 ofertas. As páginas de Google, Mistral, Cohere, xAI, Groq e Together não foram consultadas. **A taxa de erro encontrada foi de 2 em 12** (17%); não há motivo para supor que os outros 32 registros estejam livres do mesmo problema. Uma revisão completa das 44 ofertas contra as fontes é a ação de maior retorno deste laudo.
3. **Sem inspeção visual.** Os achados de acessibilidade vêm de cálculo sobre o CSS e leitura do JSX, não de renderização com leitor de tela ou auditoria axe em navegador.

---

## 7. Ordem sugerida

1. **A4-1** — corrigir os preços GPT-5.6 e revisar as 32 ofertas ainda não conferidas contra a fonte. É o único achado que já está errando na cara do usuário.
2. **A4-2** — cadastrar a regra sucessora do Sonnet 5 e corrigir o limite de data. Tem prazo: 25 dias.
3. **A4-3** e **A4-4** — os dois defeitos do calculador. São pequenos em código e grandes em confiança.
4. **A4-5** e **A4-6** — sem eles, o A4-1 se repete e ninguém percebe.
5. **A4-7**, **A4-8**, **A4-9** — qualidade estrutural.
6. Os itens baixos, em lote, junto com o merge dos PRs do Dependabot.

Os três primeiros bloqueariam um gate de release, na minha leitura. Os demais não.

---

## 8. Segunda passagem (06/08) — conferência das demais ofertas e correções aplicadas

Depois de fechar o laudo acima, estendi a conferência de preço a todos os provedores acessíveis. Resultado por provedor:

| Provedor | Ofertas | Conferidas | Divergentes |
|---|---|---|---|
| Anthropic | 5 | 5 | 0 |
| Google | 5 | 5 | 0 |
| xAI | 5 | 5 | 0 |
| DeepSeek | 2 | 2 | 0 |
| Groq | 6 | 6 | 0 preço errado, **2 preços publicados guardados como `null`** |
| OpenAI | 5 | 3 | **2** |
| Together | 5 | 5 | **4** |
| Cohere | 5 | 1 (+1 parcial) | 0 confirmadas, **1 duplicidade estrutural** |
| Mistral | 6 | 2 | 0 |
| **Total** | **44** | **34 (+1 parcial)** | **6 ofertas com defeito** |

Google e xAI foram conferidos inclusive nas faixas de contexto longo (curto e longo, entrada/cache/saída) — todos os 18 valores batem. Anthropic confere nos dez valores, incluindo os multiplicadores de cache 0,1× e 1,25×.

### Divergências novas — Together AI

Fonte: [catálogo serverless oficial](https://docs.together.ai/docs/serverless/models).

| Oferta | Catálogo | Fonte oficial | Divergência |
|---|---|---|---|
| `Qwen/Qwen3.7-Max` | 2,50 / 7,50 | **1,25 / 3,75** | 2× |
| `Qwen/Qwen3.5-9B` | 0,10 / 0,15 | **0,17 / 0,25** | −41% na entrada |
| `deepseek-ai/DeepSeek-V4-Pro` | 2,10 / 4,40 | **1,74 / 3,48** | +21% |
| `Qwen/Qwen3.5-397B-A17B` | ativo | **não consta no catálogo oficial** | oferta fantasma |
| `Qwen/Qwen3.6-Plus` | 0,50 / 3,00 | 0,50 / 3,00 | correto |

Quatro das cinco ofertas Together estavam erradas. Somando com as duas da OpenAI, a taxa de defeito entre as ofertas conferidas é de **6 em 34 (18%)** — consistente com a estimativa preliminar do laudo.

### A4-17 (Médio) — duas ofertas com o mesmo `provider` + `apiModelId`

`offer-cohere-command-a` e `offer-cohere-command-a-plus` apontam ambas para o modelo de API `command-a-plus-05-2026`. Uma tem preço (2,50 / 10,00), a outra é inteiramente `null`. A confusão vem da própria documentação da Cohere — a página do **Command A** exibe `command-a-plus-05-2026` como Model ID — mas o efeito no catálogo é que a UI mostra duas linhas para o mesmo modelo da API, uma delas inteiramente "Not verified".

`scripts/validate-data.ts` verifica unicidade de `offer.id`, mas não de `providerId + apiModelId`. Uma linha a mais no validador impede a repetição:

```ts
uniqueBy(offers, (o) => `${o.providerId}::${o.apiModelId}`, 'offers: duplicate provider+apiModelId');
```

### A4-18 (Baixo) — preços publicados guardados como `null`

Groq publica `$0,111/hora` para `whisper-large-v3` e `$0,04/hora` para `whisper-large-v3-turbo`; as duas ofertas estão com preço `null`. Não são erro de valor, são lacunas de leitura — e são exatamente o que segura a cobertura de preço em 93%. A conversão para a unidade `per_second` do schema é direta ($0,111/h = $0,0000308/s), mas troca a unidade da fonte; preferi não inventar a representação e deixar registrado.

### A4-5 é pior do que o laudo indicava

A data de referência não está fixa em um lugar, está em **três**: `scripts/build-catalog.ts`, `scripts/catalog-health.ts` e `scripts/create-snapshot.ts`. Ao corrigir a primeira, as saídas ficaram inconsistentes na hora (o build dizia 06/08 e o relatório de saúde dizia 02/08). Isso confirma o diagnóstico: literal duplicado é literal que diverge.

### Correções aplicadas nesta passagem

Branch `fix/auditoria-4`, a partir de `c68e9bc`:

| Achado | O que mudou |
|---|---|
| A4-1 | `gpt-5.6-terra` 2,50/15 → **2,00/12** e cache `null` → **0,20**; `gpt-5.6-luna` 1,00/6 → **0,20/1,20** e cache `null` → **0,02** |
| A4-1 | `Qwen3.7-Max` → 1,25/3,75; `Qwen3.5-9B` → 0,17/0,25; `DeepSeek-V4-Pro` (Together) → 1,74/3,48 com cache 0,20 |
| A4-1 | `Qwen3.5-397B-A17B`: `availability.status` `active` → `retired` |
| A4-2 | Regras sucessoras do Claude Sonnet 5 (`standard` 3/0,3/3,75/15 e `batch` 1,5/0,15/1,875/7,5) com `effectiveFrom: 2026-09-01` |
| A4-2 | `isEffective` passa a tratar data sem hora em `effectiveUntil` como fim do dia — o preço promocional deixa de sumir 24 h antes. Teste de regressão cobrindo 31/08 00:00, 31/08 23:59, 01/09 e 15/09 |
| A4-5 | Literal de data sincronizado em `build-catalog.ts` e `catalog-health.ts` (paliativo; a derivação automática ainda está pendente) |
| — | Registro de fontes: 10 URLs com `checkedAt` renovado e +1 URL (model card do GPT-5.6 Luna, que publica os preços de cache) |

Nenhum `PriceChangeEvent` foi registrado: não encontrei anúncio de mudança de preço em nenhuma das cinco divergências, e os fatores envolvidos (5×, 2×, 1,25×) sugerem erro de leitura na coleta original, não alteração do provedor. Pelo critério combinado, isso é correção de dado, não evento de histórico.

Verificação após as correções:

```
data:validate      44 ofertas, 23 fontes registradas — OK
data:build         catálogo publicado, dataAsOf 2026-08-06
typecheck / lint / format:check / build      OK
test               10 arquivos, 22 testes, 22 passaram
transição Sonnet 5   06/08 → $2  ·  31/08 → $2  ·  01/09 → $3  ·  01/01/27 → $3
```

### Pendências desta passagem

- **9 ofertas ainda não conferidas**: `gpt-4.1` e `gpt-4.1-mini` (páginas próprias), 3 da Cohere (`command-r-plus`, `command-r`, `command-r7b`) e 4 da Mistral (`mistral-large-3`, `ministral-3b`, `ministral-14b`, `codestral`). Dado o índice de 18% encontrado, é razoável esperar mais 1 ou 2 defeitos aí.
- **Os commits não puderam ser criados a partir daqui.** O `.git` da pasta montada não permite `unlink` nem `rename` sobre arquivos existentes, então `git add` falha com `index.lock`. As edições estão todas no working tree da branch `fix/auditoria-4`, prontas para revisão e commit local. Há também 4 arquivos `tmp_obj_*` órfãos em `.git/objects` e um `index.lock.bak` deixados por essas tentativas — podem ser apagados sem risco.

---

## Fontes

Auditoria executada sobre `C:\AI Cost Explorer`, branch `codex/saved-calculator-scenarios`, commit `c68e9bc`, com instalação limpa a partir de `pnpm-lock.yaml`. Correções na branch `fix/auditoria-4`.

Arquivos centrais examinados: `src/lib/calculator.ts`, `src/lib/pareto.ts`, `src/lib/scenarios.ts`, `src/lib/calculator-url-state.ts`, `src/lib/catalog-health.ts`, `src/lib/catalog.ts`, `src/app/App.tsx`, `src/styles.css`, `scripts/build-catalog.ts`, `scripts/validate-data.ts`, `scripts/check-sources.ts`, `scripts/pricing-watch.ts`, `index.html`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `pnpm-workspace.yaml`, `.github/workflows/*.yml`, `data/*/index.json`, `public/data/catalog-v1.json`, `docs/data-contract.md`, `docs/methodology.md`, `README.md`, `SECURITY.md`.

Fontes externas consultadas para conferência de preço (06/08/2026):

- [OpenAI — Models](https://developers.openai.com/api/docs/models) e [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [Anthropic — Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [DeepSeek — Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Google — Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [xAI — Pricing](https://docs.x.ai/developers/pricing)
- [Groq — Supported models](https://console.groq.com/docs/models)
- [Together AI — Serverless models](https://docs.together.ai/docs/serverless/models)
- [Cohere — Command A](https://docs.cohere.com/docs/command-a) e [Command A+](https://docs.cohere.com/docs/command-a-plus)
- [Mistral — Small 4](https://docs.mistral.ai/models/model-cards/mistral-small-4-0-26-03), [Medium 3.5](https://docs.mistral.ai/models/model-cards/mistral-medium-3-5-26-04) e [Models overview](https://docs.mistral.ai/models/overview)
- [Site publicado](https://samvale29.github.io/ai-cost-explorer/) e [`catalog-health-v1.json`](https://samvale29.github.io/ai-cost-explorer/data/catalog-health-v1.json)
