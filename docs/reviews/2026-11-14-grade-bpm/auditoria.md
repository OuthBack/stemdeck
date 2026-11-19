# Auditoria adversarial — grade manual/BPM fixo

Alvo obrigatório: `/home/henrique/projects/stemdeck`. Nenhum código ou teste do alvo foi editado nesta etapa. As alterações locais anteriores devem ser preservadas. Baseline do coordenador: `/tmp/stemdeck-adversarial-review/baseline-sha256.json` e `baseline.patch` (16 arquivos).

Foram lidos `.codex/AGENTS.md`, os diffs dos arquivos da funcionalidade, o leitor compartilhado novo, testes JS e partes dos testes Python/E2E. Skills consultadas: clean-code e verification-before-completion; using-superpowers dispensa subagentes de seu fluxo inicial. Revisão focada em comportamento, sem recomendações cosméticas.

## Achado confirmado 1 — P1: falha na única grade manual vira ausência e autoriza sobrescrita

Local: `app/core/beat_grid.py:60–69`; propagação em `app/api/jobs.py:1698–1704` e `static/js/player.js:1204`.

Reprodução isolada: `PYTHONPATH=/home/henrique/projects/stemdeck /home/henrique/.codex/worktrees/1e5c/stemdeck/.venv/bin/python /tmp/stemdeck-adversarial-review/probe-reader.py`.

Com diretório temporário sem `beats.json`, criar `beats.user.json` com JSON truncado. `read_beat_grid()` retorna `None`. Repetir com arquivo válido mas `Path.read_text` lançando PermissionError: também retorna `None`. A rota GET transforma ambos em404, exatamente como a ausência real; o frontend abre editor vazio e um novo PATCH pode substituir a única grade que existia. O probe confirmou também que edições inválidas com grade automática válida fazem fallback automático.

Esperado: ausência real de ambos os arquivos pode permitir editor vazio; falha de leitura/validação da única grade existente precisa causar erro500 e bloquear esse caminho. Edição deliberadamente vazia é um caso diferente e deve continuar ignorada conforme os requisitos.

Proposta mínima: quando a leitura de edições falha e não há grade automática utilizável, propagar OSError/ValueError para a rota existente responder500. Preservar a precedência de edições não vazias válidas, os metadados da automática e o fallback automático compatível já existente para edições inválidas. Não transformar esse conserto numa mudança silenciosa da política de fallback. Adicionar regressões de ausência, vazio válido, JSON inválido e erro de I/O manual-only; a rota deve distinguir404 de500. GET/export continuam usando leitor comum (export atualmente trata falha retornando None).

## Achado confirmado 2 — P2: reset falho elimina o único mecanismo de salvar uma edição pendente

Local: `static/js/beatgrid.js:298–304`, `312–313` e `333–336`.

Reprodução isolada: `node /tmp/stemdeck-adversarial-review/probe-reset.mjs`.

Inicializar grade vazia, aplicar120BPM (edita e agenda debounce), chamar Reset antes do debounce, fazer DELETE retornar500. A grade permanece na memória e erro fica visível, mas o timer foi cancelado. Depois chamar `flushBeatGrid()`, destruir editor e aguardar novo flush. Resultado comprovado: somente DELETE foi emitido; nenhum PATCH. Ao trocar de faixa, a edição visível desaparece sem ter sido salva. Não é o caso do reset bem-sucedido, onde cancelar a gravação é correto.

Esperado: falha no reset preserva uma edição pendente como efetivamente salvável; fechar/trocar de faixa deve poder persistir o estado que ficou na tela. A recuperação não deve ressuscitar a grade após reset bem-sucedido, duplicar escritas já enfileiradas ou permitir que resultados de outra sessão alterem a atual.

Proposta: restaurar estado de salvamento pendente no caminho de falha da mesma sessão/revisão, ou fazer flush considerar dirty com controle explícito das revisões já enfileiradas e de reset em andamento. O planejador deve escolher a menor solução que preserve a serialização atual. Cobrir DELETE500 e, se aplicável, DELETE bem-sucedido seguido de GET falho; confirmar edição nova durante reset e troca de faixa. Não basta chamar `_save()` de dentro da própria promise aguardada sem analisar auto-dependência/fila.

## Itens examinados sem achado adicional confirmado

- Geração fixa começa na primeira batida existente ou0, limita30–300, duração, precisão persistida e20mil; não cria barras automaticamente; refatoração atual dos helpers deve ser preservada.
- Toggle começa desligado e é reiniciado por indisponibilidade/teardown; desligar mantém grade e campo de Compasso continua independente. Ambos inputs têm72px/13px no CSS.
- Callback central cria/liga metrônomo nas primeiras batidas e o destrói no vazio; editor permanece disponível no vazio; exportação recebe duração do job quando manual-only.
- Cargas assíncronas do player verificam token/engine/multitrack; gravações e reset verificam sessão/revisão; a fila evita reset seguido por PATCH antigo.
- Undo/redo/reset vazio estão cobertos pelos testes existentes; edição vazia persistida é intencionalmente ignorada pelo leitor conforme requisito (não reportada como bug).
- Nenhuma suspeita não demonstrada foi elevada a achado. Não foi feita revisão geral do repositório ou biblioteca real.

## Verificação executada nesta etapa

- Os dois probes acima passaram e confirmaram os comportamentos atuais.
- `node tests/js/beatgrid-fixed-bpm.test.mjs`: passou.
- `node tests/js/beatgrid-persistence.test.mjs`: passou.
- Iniciei `pytest tests/test_beats_api.py tests/test_click_render.py -q` com Python reutilizável e a suíte JS inteira em Bash fail-fast. Ambas ficaram sem saída por vários ciclos e foram interrompidas (exit130) para encadear a revisão focada. Não são evidência de aprovação ou falha da funcionalidade. O aplicador deve rodar testes afetados com permissões necessárias; o alvo não tem pytest na própria venv.
- Não executei E2E nesta etapa. Se executado depois, usar `STEMDECK_E2E_PORT` e `STEMDECK_E2E_DIR` exclusivos e jamais servidor/biblioteca real.
- Evidência prévia fornecida pelo coordenador:135 Python afetados,40Playwright e regressõesJS passaram; suíte Python completa anterior2472pass/4skip com1falha externa de fpcalc/FFmpeg option algorithm. Não atribuir essa falha à mudança.

## Restrições para próximas etapas

Planejador verifica cada achado, cria `plano.md`, então cria aplicador com relatório+plano. Autorização explícita para continuar sem aprovação de plano. Alvo sempre `/home/henrique/projects/stemdeck`, workdir explícito. Não alterar worktree herdado. Respeitar sandbox: alvo é fora writable roots e escritas podem precisar de escalonamento. Não contornar aprovação por outro mecanismo. Sem commits/push/PR, sem reinício do servidor real, preservar todas mudanças locais e helpers refatorados. Python reutilizável: `/home/henrique/.codex/worktrees/1e5c/stemdeck/.venv/bin/python`. Relatar evidências reais e limitações ao coordenador `/root`.

## Requisito adicional explícito do usuário recebido após auditoria

O coordenador comunicou: “quando o bpm fixo é ativado sempre que for mover uma barra o tempo entre elas permanece igual e fixo, é uma é movida todas são movidas”. Toggle ligado deve arrastar qualquer linha/batida deslocando a grade inteira rigidamente e preservando todos os intervalos iguais, independentemente de Ripple/Alt; toggle desligado conserva movimentos individuais/ripple atuais. Hoje o toggle somente habilita input, portanto isso é requisito funcional novo autorizado, não uma suspeita da auditoria. Grade vazia ainda exige BPM manual explícito. Planejador deve definir ligação do modo ao drag, limites/clamps, undo/redo e troca/reset. A mudança deve preservar refatoração existente e testes relevantes.
