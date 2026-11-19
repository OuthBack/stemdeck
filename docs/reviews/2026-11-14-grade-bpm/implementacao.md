# Implementação — grade manual e BPM fixo

Alvo: `/home/henrique/projects/stemdeck`. Escritas executadas pelo coordenador com escalonamento. Sem commit/push/PR/restart real ou alterações no worktree herdado.

## Correções e decisões

1. **Leitura:** ausência/vazio manual válido continuam404; JSON/schema/I/O inválido na única grade manual causam500. Automática válida continua fallback e preserva metadados. Export mantém catch existente.
2. **Reset/persistência:** snapshot captura job/session/revision/body; fila serial não aguarda a si mesma. Snapshot enfileirado conserva resultado da gravação. Reset falho recupera edição não salva ou removida peloDELETE antesGETfalho, inclusive após teardown, sem callbacks na faixa nova. PATCH bem-sucedido não é duplicado quandoDELETEfalha. PATCH de recuperação falho reativa dirty apenas na mesma sessão/revisão, permitindo retry porflush.
3. **Dragfixo:** toggle só liga modo e preserva grade. Primeiro drag uniformiza irregular pelo intervalo mediano; origem=target−selectedIndex×intervalo mantém linha agarrada sobcursor. Uma batida pode transladar; vazio só cria batidas com BPM explicitamente digitado. Ripple/Alt não mudam comportamento fixo; Snap escolhe alvo da linha agarrada e translada lattice inteira. ModoOFF mantém comportamentos antigos.
4. **Bordas/histórico:** lattice recorta linhas fora[0,duration] e estende nas bordas mantendo intervalo, com limite20mil/precisão persistida. Novas linhas não ganham marcações; barras/anchors sobreviventes remapeiam índices. Voltar no mesmo gesto recupera marcas pelo snapshot; undo único restaura grade inteira. Fechar/reabrir mesma faixa conserva modo; troca/init/destroy e reset bem-sucedido desligam. Reset falho conserva.
5. **Ajuda:** Move no modo fixo tem dica i18nEN/PT coerente com arraste de toda grade; vazio mantém dica manual. Toggle atualiza dica. Teste real de reabertura usa openClickOptions, semforceclick.

## Preservação e revisão

Todos16 arquivos baseline reconstruídos em `baseline-files/` e verificados exatamente contra SHA256 original; baseline.patch/json intactos. Helpers getBeatGridBpm/applyFixedBpm e refatoração preexistente preservados por comparação exata do trecho. Delta limitado a leitor/editor/UI/i18n e regressões. Demais arquivos anteriores permanecem iguais ao baseline.

Revisão independente do coordenador encontrou dica incorreta e doisedges de recuperação de PATCHenfileirado; todos consolidados nos scripts idempotentes `fix-queued-recovery.py` e `fix-fixed-hint.py`. Nenhuma revisão geral adicional necessária.

## Evidências reais

- RED persistência principal:0PATCH vs1 apósreset500. RED fixed com baseline verificado: setterausente.
- REDqueued principal: primeiroPATCH500→DELETE500 durante teardown emitiu1PATCH vs2. Probe `probe-queued-failure.mjs`.
- REDdirty no staging: primeiraPATCHsucesso→DELETE200/GET500→recoveryPATCH500 não era reenviada (2vs3). Probe `probe-recovery-dirty.mjs`. Fix consolidado e persistência inteira stagingGREEN.
- Primeira aplicação principal: Nodefixed/persistence, sintaxe core/UI e diffcheckGREEN; Pythonfocado140passed em2.23s; JSamplo failfastGREEN.
- E2E inicial: nova regressão passou drag/Alt/intervalos/undo e falhou ao reabrir botão oculto apósDone. Teste corrigido para abrir popover real antesclick. Não alegar aprovação inicial desseE2E.
- Sintaxe UI/i18n/E2E do batchfinal verificada em staging; persistência ampliada stagingGREEN. Coordenador executa verificação final no principal e acrescentará resultados abaixo.

## Limites

SuítePython completa não executada nesta correção. Falha histórica externa fpcalc/FFmpegalgorithm não foi usada como evidência de aprovação. Suspeita export antesdebounce não foi investigada sem reprodução, preservando escopo.

## Verificação final pelo coordenador

Executada no alvo /home/henrique/projects/stemdeck após os dois ajustes finais:

- Testes Node de BPM fixo e persistência: passaram, incluindo recuperação de gravações enfileiradas e nova tentativa após recuperação falha.
- Sintaxe dos módulos: passou; Ruff e git diff --check passaram.
- Python (API de batidas, renderização, paridade e exportação): 140 passaram.
- JavaScript completo com loop Bash fail-fast: passou.
- Playwright (metrônomo/grade e menu de exportação): 41 passaram.
- E2E isolado na porta 8138 e em /tmp/stemdeck-adversarial-final-8138, sem biblioteca real.

Comparação SHA256 com baseline confirmou mudanças desta etapa em oito arquivos de código/testes; os demais oito arquivos locais anteriores permaneceram intactos. Nenhum commit, push ou PR.
