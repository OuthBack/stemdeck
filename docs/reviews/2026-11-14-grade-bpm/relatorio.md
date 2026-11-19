# Auditoria e aplicação — grade manual e BPM fixo

Alvo: `/home/henrique/projects/stemdeck`.

## Cadeia executada

1. Auditor adversarial: [achados e reproduções](auditoria.md).
2. Planejador: [plano de correção](plano.md).
3. Aplicador: [mudanças, decisões e evidências](implementacao.md).

O coordenador executou as escritas escalonadas preparadas pelo aplicador e a validação final no alvo, pois a pasta principal fica fora da área de escrita do worktree.

## Resultado

- A única grade manual ilegível ou inválida agora gera erro de carregamento, em vez de permitir sobrescrevê-la como se estivesse ausente. Ausência real e edição vazia válida continuam distintas; a grade automática válida mantém o fallback existente.
- Restaurar malsucedido preserva a possibilidade de salvar as edições, inclusive com PATCH enfileirado, troca de faixa e falha da própria recuperação. As requisições continuam serializadas e dirigidas à faixa original.
- Com BPM fixo ligado, arrastar qualquer linha desloca a grade inteira sem variar o intervalo, independentemente de Ripple ou Alt. Snap posiciona a linha selecionada. Ao cruzar as bordas, linhas fora da faixa saem e novas linhas entram mantendo o pulso; marcações manuais sobreviventes são remapeadas e Desfazer restaura o estado anterior.
- Uma grade inicialmente irregular é uniformizada no primeiro arraste fixo pelo intervalo mediano, mantendo a linha selecionada sob o cursor. Uma grade vazia continua exigindo BPM informado explicitamente.
- Desligar o modo mantém a grade. Fechar/reabrir o editor mantém o modo; trocar de faixa ou restaurar com sucesso o desliga. A dica do editor descreve o novo comportamento.

## Verificação final

- Testes específicos Node e suíte JavaScript completa com fail-fast: passaram.
- Testes Python afetados: **140 passaram**.
- Playwright de metrônomo/grade e exportação: **41 passaram**.
- Sintaxe, Ruff e verificação de espaços do diff: passaram.
- Oito arquivos de código/testes foram alterados nesta revisão; os demais arquivos preexistentes foram preservados.

A suíte Python completa não foi repetida nesta etapa. Uma execução anterior apresentou uma falha externa de fpcalc/FFmpeg, documentada na implementação. A suspeita de exportação antes do debounce não foi reproduzida nem tratada como achado confirmado. Não houve commit ou publicação.
