# Reauditoria — AI Cost Explorer (terceira passagem)

**Data:** 2026-08-04
**Estado auditado:** commit `0e9a00f` — *fix: complete audit hardening*
**Referências:** [`AUDITORIA.md`](AUDITORIA.md) (1ª passagem) · [`AUDITORIA-2-REVERIFICACAO.md`](AUDITORIA-2-REVERIFICACAO.md) (2ª passagem)

---

## Veredito

**A regressão R1 foi corrigida, e pela opção mais difícil e mais correta.** Todos os 22 achados originais e o residual estão resolvidos. Nenhuma regressão nova no código.

Restam **dois itens de higiene do repositório** — nenhum quebra nada, mas ambos são de correção rápida e um deles é de licenciamento.

| | |
|---|---|
| Achados originais resolvidos | 22 / 22 |
| Regressão R1 (CSP × fontes) | Corrigida |
| Regressões novas no código | Nenhuma |
| Itens de higiene em aberto | 2 (+ o merge para `main`) |

### O que rodou nesta passagem

```
Suíte de testes:  20 testes | 20 passaram | 0 falharam
```

Recompilei `src/lib` do zero a partir do estado atual e reexecutei todas as provas empíricas:

```
A1  OK   cenário padrão: 26/44 com custo | sem cache: 41/44 | ofertas com preço in+out: 41
A2  OK   diferentes=true  iguais=false  nulls=false  bool/null=true
A3  OK   hoje-2d=fresh  -95d=stale  -45d=aging  futuro=unknown
M1  OK   assinatura sem speed/latency; scores = a:0.744 b:0.500
M3  OK   expirada=null  futura=null  vigente=now
M4  OK   custo=null | aviso="This offer uses non-token pricing and cannot be simulated by token inputs."
REG OK   cache PEDIDO sem preço -> total=null (comportamento correto preservado)
```

`data/` e `public/data/` continuam sincronizados byte a byte nas 7 entidades. `npm audit --omit=dev` segue com os 2 avisos conhecidos do `react-router` (exceção documentada, com prazo de revisão em 2026-09-01).

**Continua sem execução aqui:** `pnpm lint`, `pnpm build`, `pnpm format:check` e `pnpm test:e2e` — limitação do sandbox (esbuild com SIGSEGV, symlinks do pnpm em pasta OneDrive), não do projeto.

---

## R1 — corrigida: fontes auto-hospedadas

Foi adotada a opção B, que era a recomendada e a mais trabalhosa. Verifiquei em profundidade, porque "adicionar arquivos de fonte" é o tipo de correção que falha em silêncio:

**Os arquivos são fontes reais, não placeholders.** Li a assinatura binária e o diretório de tabelas de cada WOFF2:

| Arquivo | Assinatura | Tabelas | Tipo |
|---|---|---|---|
| `manrope-latin.woff2` (24.836 B) | `wOF2` | 19 | **Variável** — contém `fvar`, `HVAR`, `STAT` |
| `dm-mono-400.woff2` (14.820 B) | `wOF2` | 17 | Estática |
| `dm-mono-500.woff2` (14.988 B) | `wOF2` | 17 | Estática |

**As declarações batem com o uso real.** O CSS usa os pesos 400, 500, 600, 700 e 800, e tem `font-synthesis: none` — ou seja, o navegador **não** vai simular negrito se o peso não existir no arquivo. Isso poderia ter dado errado de duas formas, e nenhuma deu:

- `Manrope` é declarada como `font-weight: 400 800`. Só é válido porque o arquivo é mesmo variável (`fvar` presente). Os cinco pesos serão renderizados de verdade.
- `DM Mono` é usada 54 vezes no CSS e tem dois arquivos estáticos, 400 e 500 — exatamente os dois pesos que o `@import` do Google Fonts pedia antes (`wght@400;500`). Paridade completa com o comportamento anterior.

**Nenhum recurso externo sobrou.** Não há mais `@import`, `googleapis` ou `gstatic` em nenhum CSS. As únicas URLs externas no `index.html` são metadados (canonical, og:image, schema.org, licença MIT) — nada que o navegador precise buscar para renderizar. A CSP permaneceu estrita (`font-src 'self' data:`) e agora é coerente: as fontes são same-origin, empacotadas pelo Vite. O hash do script inline continua conferindo.

**Achado residual também resolvido:** `standardRule` agora filtra por `unit === 'per_million_tokens'`, alinhando a exibição de preços com o simulador, e veio com teste próprio (`pricing.test.ts`).

---

## Em aberto

### H1 — Licença OFL das fontes não acompanha os arquivos (baixo, mas é licenciamento)

`src/assets/fonts/README.md` identifica corretamente Manrope v20 e DM Mono v16 sob SIL Open Font License 1.1 e aponta para o Google Fonts. Mas **o texto da licença não está no repositório** — não existe `OFL.txt` nem equivalente.

A OFL 1.1 exige que o aviso de copyright e a própria licença acompanhem qualquer redistribuição do font software. E aqui há redistribuição em dois lugares: os `.woff2` estão versionados no Git e são servidos pelo site publicado.

Correção: criar `src/assets/fonts/OFL.txt` com o texto da OFL 1.1 e as linhas de copyright de cada família (`Copyright 2019 The Manrope Project Authors`, `Copyright 2014 The DM Mono Project Authors` — confirme as linhas exatas nos repositórios upstream), e referenciá-lo no `README.md` das fontes. É uma correção de cinco minutos, e num projeto que tem `SECURITY.md`, `AUTHORS.md`, `CODE_OF_CONDUCT.md` e uma metodologia inteira sobre proveniência, deixar isso de fora destoa do resto.

### H2 — Falta `.gitattributes`: `data/` aparece modificado para sempre (baixo)

`git status` mostra os 7 arquivos de `data/` como modificados mesmo logo após o commit. A causa não é o conteúdo:

```
conteúdo JSON idêntico semanticamente: True
versão commitada:    ...prices."},\n      (LF)
versão no disco:     ...prices."},\r\n    (CRLF)
```

O OneDrive/Windows converteu os finais de linha para CRLF, o repositório não tem `.gitattributes` e `core.autocrlf` não está configurado. O `.editorconfig` até declara `end_of_line = lf`, mas o EditorConfig só age no editor — não normaliza o que o Git grava.

Resultado prático: um diff fantasma de 4.779 linhas que reaparece sempre e vai sujar toda revisão de PR. Já são 13 arquivos versionados em CRLF no working tree.

Correção:

```gitattributes
* text=auto eol=lf
*.woff2 binary
*.png binary
*.mp4 binary
```

Depois: `git add --renormalize . && git commit -m "chore: normalize line endings"`.

### M7 — o trabalho ainda não está em `main` (continua aberto)

Melhorou: as correções foram commitadas em `0e9a00f`. Mas o branch continua sendo `codex/saved-calculator-scenarios`, agora **8 commits à frente e 1 atrás** de `origin/main`, e o `pages.yml` só publica em push para `main`.

O site no ar ainda é a versão anterior a tudo isso.

Uma observação sobre o commit: `0e9a00f` juntou 40+ arquivos misturando correções de cálculo, SEO, CSP, fontes, formatação e os próprios relatórios de auditoria. Funciona, mas se um dos itens precisar de `git revert` depois, vem tudo junto. Para as próximas rodadas, vale separar por tema.

Um detalhe a decidir: `AUDITORIA.md` e `AUDITORIA-2-REVERIFICACAO.md` entraram no commit e serão publicados no repositório público. Num projeto cuja tese é transparência isso pode até ser proposital — mas é bom que seja uma escolha, não um efeito colateral do `git add .`.

---

## Prioridade

1. **M7** — merge em `main` e deploy. É o único item que separa o usuário de todas as correções.
2. **H2** — `.gitattributes` + renormalize, de preferência **antes** do merge, para o PR não vir com 4.779 linhas de ruído.
3. **H1** — adicionar `OFL.txt`.
4. Rodar localmente `pnpm format:check`, `pnpm lint`, `pnpm build` e `pnpm test:e2e` — os quatro que o sandbox não executa.
5. Quando houver folga: separar as páginas de `App.tsx` (M8), `activeFilterCount` com `0` (B5), `aria-sort` nos cabeçalhos ordenáveis (B6).

---

## Fontes

Verificação sobre `C:\Users\r2m9\OneDrive\Documentos\AI Cost Explorer` no commit `0e9a00f`. Arquivos centrais desta passagem: `src/assets/fonts/*.woff2`, `src/assets/fonts/README.md`, `src/styles.css`, `index.html`, `src/lib/pricing.ts`, `src/lib/pricing.test.ts`, `src/lib/*.test.ts`, `.prettierignore`, `.editorconfig`, `data/*/index.json`, `public/data/catalog-v1.json`.
