# Modelos físicos e separação por fornecedor — 27/10/2026

O proprietário autorizou a atualização do site, catálogo e Estúdio de Mockups. Confirmou ZIMM com gola alta/fechada e Tiggas com gola mais baixa/aberta nas tradicionais e oversized. Confirmou que os saldos anteriores estão misturados: não é possível atribuir as 52 tradicionais e 39 oversized disponíveis a fornecedores sem contagem física.

O contrato `shared/garmentModels.ts` é utilizado pelo backend, catálogo público, custos, pedidos e propostas. Uma cópia idêntica é compilada no Estúdio de Mockups privado, que também consulta o contrato público em `/api/garment-models` ao abrir. A resposta usa projeção explícita de dados técnicos, sem fornecedores, custos, margens ou contatos internos. A permissão CORS adicional se limita à leitura desse endpoint pelo domínio do app.

## Fichas e medidas

As imagens fornecidas pelo proprietário em 27/10 confirmam:

| Ficha | P (C×L) | M (C×L) | G (C×L) | GG (C×L) | Manga P/M/G/GG |
|---|---|---|---|---|---|
| ZIM-004 Tradicional Suedine | 65×50 | 68×52 | 70×56 | 72×58 | 16/18/18/19 |
| ZIM-009 Oversized Suedine | 71×52 | 73×55 | 75×58 | 77×61 | 24/25/26/27 |
| ZIM-010 Regata | 65×53 | 67×55 | 69×57 | 71×59 | Sem mangas |

Valores em cm. Suedine tradicional/oversized: algodão e poliéster 30.1, 250 g/m², ribana 3 cm, zero encolhimento conforme catálogo. Regata: 100% algodão 30.1, 160 g/m². A cor Areia não aparece na ficha oversized Suedine enviada e deixa de ser oferecida como cor dessa ficha. Nenhum preço de compra foi modificado.

As medidas Tiggas permanecem na ficha correspondente. Não há fallback de medidas entre fornecedores. As imagens de estampa/mockup continuam ilustrativas enquanto não houver fotografias exatas de cada peça. Regatas são reconhecidas como peças sem mangas e têm estrutura própria no cadastro e no mockup; a personalização PRIME de regatas não é publicada sem um perfil comercial e de aplicação aprovado.

## Ativação e contagem

Na gestão de estoque, abrir **Modelos e fornecedores** e usar **Preparar bases separadas sem copiar saldos**. Operação autenticada e idempotente:

- Atualiza somente dados técnicos dos três registros ZIMM, mantendo preços e guardando versão/histórico.
- Cria uma base lisa vazia por ficha exata de fornecedor. Não copia estoque legado.
- Marca as tradicionais/oversized/regatas anteriores para separação física. Não apaga estoque, produtos, pedidos, reservas ou históricos.
- Saldos misturados permanecem na gestão, sem serem apresentados ao cliente como peças de um fornecedor conhecido.

Contar por fornecedor, cor e tamanho e usar **Transferir peças conferidas**. A transação subtrai da origem e soma ao destino, conserva o total e registra eventos/movimentos relacionados. Recusa saldo desatualizado, quantidade acima do disponível, destino de outra família e reuso de chave com conteúdo diferente. Reservas antigas permanecem na origem para não alterar pedidos em andamento.

Catálogo e página do produto permitem escolher a ficha exata antes de cor e tamanho. PRIME exige uma base específica quando há várias fichas. Sacola e checkout validam o pool selecionado; nomes, IDs e alocações de fornecedor são preservados no pedido. O backend rejeita uma escolha incompatível e nunca usa saldo de outro modelo como substituto. Pedidos manuais prontos/montados e personalizados preservam a mesma identificação.

## Validação

### Cadastros confirmados como a mesma peça

Em **Modelos e fornecedores**, escolher a base antiga e a ficha exata, e usar **Unificar cadastros da mesma peça**. A operação autenticada `/api/admin/garment-models/unify` exige que o cadastro adicional esteja sem saldo e sem reservas, confere o saldo esperado e mantém o produto e o documento de estoque originais. Não soma nem movimenta unidades. Mantém cores, tamanhos, variantes inativas, reservas e históricos; identifica a base original pelo modelo e arquiva o duplicado com referência ao registro preservado. Vínculos futuros apontam para a base sobrevivente. Uma confirmação explícita de compatibilidade mantém o vínculo dos nomes antigos do modelo. Repetições da mesma solicitação não duplicam a auditoria. Os testes incluem saldo alterado, duplicado com reserva, conservação integral do estoque, seleção pública única e transferências futuras.

`test:garment-models` usa banco isolado: identidade, tabelas, privacidade, criação de saldos vazios, transferência conservativa/idempotente, reservas, concorrência por saldo esperado, checkout autoritativo e sacola. A suíte completa anterior foi executada. TypeScript, build e preflight em ambiente production também são obrigatórios antes do merge. Nenhuma simulação cria pagamento ou notificação real.
