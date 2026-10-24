# Auditoria de ranking e controle de brindes

## Regras adotadas

- A identidade do comprador é resolvida por telefone, e-mail, conta ou CPF em comum. E-mails são normalizados; telefones brasileiros com DDI e celulares antigos sem o nono dígito são conciliados. Nomes iguais, sem identificador em comum, não juntam pessoas.
- Os vínculos são resolvidos antes de selecionar compras. Um cadastro sem pagamento ou de brinde pode fornecer o vínculo entre contatos, mas não ganha valor, pedido, unidades, XP ou conquistas.
- O ranking usa o valor efetivamente recebido menos estornos, com os leitores financeiros compartilhados. Cancelados, recusados, devolvidos, totalmente estornados e brindes são excluídos. Um pagamento parcial contribui somente com o recebido líquido.
- As classificações explícitas de brinde prevalecem sobre eventuais espelhos antigos de preço ou pagamento. Não se infere que um pedido seja brinde por seu nome ou por ter preço zero.
- Ranking público e gestão compartilham agregação e desempate por primeira compra. A resposta pública continua contendo apenas posição, nome protegido e nível; não publica contatos, documentos ou valores.

## Controle de brindes

`Gestão → Brindes` reúne pedidos classificados como brinde, com destinatário, itens, cor, tamanho, quantidade, observação, situação de entrega e acesso ao pedido original.

Os indicadores distinguem entregues, em aberto e cancelados. Produção concluída não é tratada como entrega confirmada. Cancelados permanecem consultáveis, mas não somam nos indicadores. O acumulado histórico de entregues permanece visível mesmo ao escolher um período.

O relatório separa custos históricos registrados de estimativas de catálogo e custos ausentes. Custo zero explicitamente registrado é diferente de custo desconhecido. O custo de frete só entra quando existe registro real; não se presume que o frete cobrado seja o frete pago pela empresa. Custos históricos divergentes e pedidos sem itens ou sem data são sinalizados.

Os filtros usam a data de cadastro no fuso de São Paulo. Registros sem data aparecem no histórico completo, sem inventar uma data. O gráfico cobre os últimos 12 meses datados e o comparativo mostra custo registrado dos entregues sobre compras com recebimento líquido do mesmo período de cadastro. Não representa conciliação de caixa nem estabelece um limite automático de gastos.

Busca e situação filtram a tabela e o CSV. A exportação inclui itens, quantidades, custos, estimativas e pendências, respeita a ocultação financeira e protege células que poderiam ser interpretadas como fórmulas.

## Achados e preservação de dados

A auditoria autenticada encontrou telefones armazenados com e sem o nono dígito, lógica de pagamento diferente entre os rankings público e administrativo, e exclusão de brindes dependente de valores zerados em vez de uma regra explícita. O financeiro existente já reconhecia custos de brindes, mas não oferecia o acompanhamento detalhado por destinatário e quantidade.

Também foi corrigida uma falha observada ao expandir pedidos com o campo legado `shipping` no formato de objeto. A exibição agora usa o leitor financeiro canônico.

As alterações são projeções de leitura. Nenhum cadastro de cliente foi fundido ou apagado; nenhum pedido, estoque, lançamento financeiro, custo histórico ou permissão foi alterado durante a auditoria. O relatório não gera uma nova saída de caixa para mercadoria já comprada.

## Validação

`test:ranking-gifts` cobre variações de nome e contato, vínculos transitivos em ordens diferentes, homônimos, telefones inválidos, compras parciais e estornos, duplicação de pedidos, brindes com espelhos financeiros antigos, XP/unidades, privacidade pública, custos confirmados/estimados/ausentes, frete, entrega, períodos, CSV e privacidade da interface.

O teste integra `test:all`. O fluxo oficial de PR exige TypeScript, regressões isoladas, regras Firestore/Storage em emuladores demo, build e preflight. A publicação segue exclusivamente o GitHub Actions oficial, com revisão sem tráfego e verificação antes da promoção.
