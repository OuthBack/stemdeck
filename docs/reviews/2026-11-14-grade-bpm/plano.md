# Correções da grade manual e arraste com BPM fixo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. A cadeia auditor → planejador → aplicador foi explicitamente autorizada; não pedir aprovação deste plano e não criar commits.

**Goal:** Distinguir grade manual ilegível de ausência, preservar salvamento após reset falho e deslocar toda a grade quando BPM fixo estiver ligado.

**Architecture:** Manter o leitor compartilhado e a fila serial de persistência existentes. Acrescentar modo transitório de arraste ao núcleo e ligá-lo ao toggle da toolbar, preservando helpers refatorados e formatos persistidos.

**Tech Stack:** Python/FastAPI/Pydantic; ES modules JavaScript; pytest, Node, Playwright.

**Spec:** `auditoria.md` (ler integralmente, inclusive requisito novo final).

## Global Constraints

- ALVO exclusivo `/home/henrique/projects/stemdeck`; usar workdir explícito. Worktree herdado não é alvo.
- Preservar os 16 arquivos preexistentes registrados em `baseline-sha256.json`/`baseline.patch`, sem reverter alterações do usuário. Ambos artefatos permanecem intactos.
- Alvo está fora writable roots: usar ferramenta de escalonamento para qualquer escrita nele. Não contornar sandbox escrevendo por outra ferramenta. Leitura e artefatos /tmp permitidos.
- Sem commit/push/PR, sem reiniciar servidor real, sem bibliotecas/dados reais.
- Python reutilizável `/home/henrique/.codex/worktrees/1e5c/stemdeck/.venv/bin/python`; venv do alvo não tem pytest.
- Grades deliberadamente vazias continuam ignoradas; inválida manual com automática válida continua fallback automático. Grade vazia no editor só ganha batidas mediante BPM digitado explicitamente.
- Toggle inicia desligado, desligar não altera grade; Compasso independente; BPM 30–300; limite 20 mil; precisão persistida e sem criar marcações de compasso automaticamente.

## Review Focus

1. Ausência real versus JSON truncado/I/O/validação manual-only: 404 apenas para ausência/vazio válido; erro500 para falha.
2. Reset falho enquanto teardown/troca de faixa acontece: salvar snapshot da faixa original sem callbacks sobre sessão nova.
3. Reset bem-sucedido enquanto gravação antiga ou edição nova está pendente: serialização, nenhuma ressurreição antiga, última revisão preservada.
4. Drag fixo com Snap, Alt, Ripple e extremos da faixa: deslocamento único, sem recorte de batidas ou deformação dos intervalos.
5. Ativação em grade irregular, undo/reset e troca: não gerar grade vazia implicitamente; modo nunca vaza entre faixas.

## Confirmação independente do planejador

Ambos probes originais rodados com exit0 e reproduziram integralmente os achados. Leitor engole OSError/ValueError em manual-only; GET já mapeia exceções a500. Reset cancela timer antes de DELETE e flush só inspeciona timer, eliminando PATCH após falha. Nenhum achado foi rejeitado. Baseline original foi lido e preservado. Nenhum código foi implementado nesta etapa.

### Task 1: Erros do leitor compartilhado

**Files:** `app/core/beat_grid.py`, `tests/test_beats_api.py`, `tests/test_click_render.py` se necessário para leitor/export.
**Interfaces:** `read_beat_grid(stems: Path) -> dict | None` permanece; OSError/ValueError propagam somente quando manual falha sem automática utilizável.

- [ ] Acrescentar regressões no leitor/GET: ausente404; manual vazio válido404; JSON truncado manual-only500; schema/ordem inválida500; PermissionError manual-only500. Monkeypatch apenas Path.read_text do arquivo de beats do fixture.
- [ ] Assegurar testes preservam manual válida e metadata automática; manual inválida/ilegível com automática válida retorna automática200; manual vazia continua ignorada. Falha computed existente não deve mudar.
- [ ] Executar novos testes e registrar RED.
- [ ] No except atual, relançar quando `grid is None`; manter fallback caso automática válida exista. Ajustar docstring para distinguir computed/manual-only. Não mudar rotas/export além do necessário.
- [ ] Executar testes novos e módulo afetado; export continua leitor comum e comportamento de erro anterior documentado no relatório.

### Task 2: Reset falho conserva persistência pendente

**Files:** `static/js/beatgrid.js`, `tests/js/beatgrid-persistence.test.mjs`.
**Interfaces:** `resetBeatGrid(): Promise<grid|null>`, `flushBeatGrid(): Promise<void>` e fila `_saving` continuam públicos/serializados.

- [ ] Escrever regressões: edit→reset DELETE500→flush salva edição exatamente uma vez; mesmo caso com destroy/init antes de resposta não escreve em job novo; DELETE200/GET500 conserva edição pendente; PATCH já enfileirado não é duplicado; reset sucesso não revive nada; edição nova durante reset persiste última revisão. Registrar RED nos casos novos.
- [ ] Escolha mínima: capturar em reset o snapshot cujo timer foi cancelado (job/session/revision/body), como obrigação de recuperação. Dentro do catch da operação serial, persistir diretamente esse snapshot em caso de falha se ele ainda representa a edição cancelada e não houver revisão mais nova da mesma sessão com salvamento agendado/enfileirado. Não chamar `_save()` dentro da promise que ela mesma aguardaria. Encapsular request PATCH em helper compartilhado se necessário para evitar duplicar semântica/callbacks. Capturar snapshot permite concluir salvamento após teardown com destino job original, sem atualizar sessão nova.
- [ ] Se preferir gestão explícita de revisões pendentes/enfileiradas, manter os mesmos testes e justificar complexidade; apenas restaurar timer no catch é insuficiente se teardown já ocorreu. Nenhuma recuperação no sucesso completo de reset.
- [ ] Tratar falha da recuperação como erro salvável em sessão atual e visível; flush/teardown devem poder tentar novamente sem duplicar PATCH que já teve sucesso. Não limpar dirty de revisão diferente.
- [ ] Executar persistência e fixed-bpm Node; conferir inexistência de auto-dependência/promises penduradas e destinos das URLs nos testes.

### Task 3: Toggle BPM fixo liga deslocamento rígido

**Files:** `static/js/beatgrid.js`, `static/js/beatgridUi.js`, `tests/js/beatgrid-fixed-bpm.test.mjs`, `tests/e2e/click-track.spec.mjs`; textos i18n somente se descrição existente ficar incorreta.
**Interfaces:** adicionar `setBeatGridFixedBpm(on: boolean)` e `getBeatGridFixedBpm(): boolean` no núcleo; estado transitório `_fixedBpm = false`, não persistido.

- [ ] Escrever testes de pointer handlers reais com canvas mock existente e E2E de toggle: toggleON+grade uniforme desloca TODAS batidas pelo mesmo delta com Ripple on/off e Alt; barras mantêm índices; callbacks e PATCH recebem grade deslocada; toggleOFF conserva single/ripple atuais. Registrar RED.
- [ ] Ligar mudança do toggle ao setter, disponibilidade falsa ao setter(false), init/destroy resetam modo false. Fechar/reabrir editor na mesma faixa conserva toggle; troca de faixa desliga. Reset bem-sucedido desliga modo/toggle para não apresentar automática irregular como fixa; falho conserva modo. Undo/redo restauram grades sem regeneração automática e modo continua toggle da faixa.
- [ ] Ativação apenas liga modo e sincroniza campo, sem redistribuir nem gerar batidas: requisito existente de toggle preservar grade. Para grade inicialmente irregular, primeiro drag fixo deve uniformizar pelo BPM mediano mostrado e então transladar, como uma única operação de undo; usar intervalo `60 / getBeatGridBpm()` e primeira batida original como origem. Gerar lattice uniforme apenas dentro da duração, no máximo20mil; remapear marcas manuais dos índices originais ao índice correspondente da lattice e descartar somente marcas de batidas que saíram da faixa. Não comprimir intervalo. Não inventar BPM em grade vazia/uma batida: vazio sem drag e uma batida pode transladar sem intervalo. Se requisito uniforme exigir decisão adicional, reportar escolha ao coordenador sem interromper trabalho independente.
- [ ] No começo do drag capturar snapshot base e modo fixo para o gesto. Após snap do alvo, calcular delta em relação à batida selecionada no snapshot. Transladar lattice inteira por delta, recortar apenas batidas que saem de [0,duration] e estender nas bordas com o mesmo intervalo quando houver espaço. Isto evita congelar grade que já cobre0..duration. Gerar tempos por índice inteiro a partir da origem deslocada (não por soma acumulada), respeitar20mil e timestamps<86400; rejeitar gesto que excederia limite em vez de truncar silenciosamente. Remapear barras/anchors pelo deslocamento inteiro de índices criado pelo recorte/extensão, mantendo marcas manuais das batidas sobreviventes e não criando marcas nas batidas estendidas. Snapshot por gesto evita cumulatividade/índice mudando quando cruza borda e permite voltar integralmente ao estado inicial.
- [ ] Uma ação undo por drag; undo/redo restaura grade inteira e barras; salvar/callback pelo caminho existente de pointerup. Testar primeiro/meio/último beat, esquerda/direita, Snap e bordas, intervalo constante e BPM igual; grade que ocupa0..duration consegue alinhamento inicial sem congelar, marcas sobreviventes são remapeadas corretamente e undo restaura as descartadas.
- [ ] Atualizar teste/comentário E2E antigo que afirma que BPM fixo não trava drag. Manter inserção/deleção fora do escopo; após essas operações próximo drag pode uniformizar novamente. Testar reset/troca isolados e grade vazia continua sem geração até entrada explícita de BPM.

### Task 4: Verificação e relatório

- [ ] Reexecutar novos testes e Node dos dois módulos; `node --check static/js/beatgrid.js` e `static/js/beatgridUi.js`; diff check.
- [ ] Python focado: `PYTHONPATH=. /home/henrique/.codex/worktrees/1e5c/stemdeck/.venv/bin/python -m pytest tests/test_beats_api.py tests/test_click_render.py tests/test_click_parity.py tests/test_transpose_export.py -q` com workdir ALVO, permissões conforme sandbox. Se ficar sem saída investigar diagnóstico/tempo sem alegar passou.
- [ ] JS amplo via Bash fail-fast como AGENTS; E2E click-track e export-menu com port exclusivo e `STEMDECK_E2E_DIR` único em /tmp, conferir config antes. Sem servidor real. Necessita escalonamento para artefatos no alvo e servidor sandbox se negado.
- [ ] Probes antigos têm asserts do bug e DEVEM falhar após conserto; criar probes de expectativa corrigida em /tmp ou usar regressões como evidência, não interpretar falha antiga como regressão.
- [ ] Revisar delta contra baseline.patch e preservar mudanças anteriores. Não afirmar hashes dos arquivos alterados continuam iguais; baseline serve comparação, não restauração.
- [ ] Reportar diretamente a `/root`: arquivos alterados, comportamento, comandos/resultados reais, limitações e decisões de uniformização. Auditoria anterior só rodou dois Node+probes; tentativas amplas interrompidas exit130 não passaram. Evidência histórica 135Python/40E2E é anterior, não desta correção. Falha histórica fpcalc/FFmpeg algorithm é externa.

## Observação adicional do coordenador

Suspeita não confirmada: export antes do debounce pode ler grade antiga. Não ampliar escopo sem reprodução; avaliar apenas se houver tempo após prioridades, registrar evidência/limitação. Prioridades são os dois achados e drag fixo solicitado.
