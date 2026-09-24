import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const uploader = read('src/components/admin/products/ProductMockupUploader.tsx');
const drawer = read('src/components/admin/products/ProductManagementDrawer.tsx');
const stockCenter = read('src/components/AdminStockCenter.tsx');

assert.match(uploader, /DndContext/, 'a galeria precisa suportar arrastar imagens');
assert.match(uploader, /SortableContext/, 'a ordem da galeria precisa ser ordenável');
assert.match(uploader, /arrayMove\(images, oldIndex, newIndex\)/, 'soltar uma imagem deve persistir a nova ordem');
assert.match(uploader, /aria-label=\{`Arrastar mockup/, 'o arraste precisa ter identificação acessível');
assert.doesNotMatch(drawer, /setActiveTab\('description'\)/, 'descrição não deve ocupar uma aba própria');
assert.match(drawer, /Descrição e especificações/, 'descrição deve permanecer editável em Informações');
assert.match(drawer, /waitForSaveStep/, 'salvamentos precisam ter prazo máximo');
assert.match(drawer, /pendingNewProductId/, 'repetir um cadastro após timeout não pode criar um produto duplicado');
assert.match(drawer, /savingMessage/, 'o botão deve informar a etapa de salvamento em andamento');
assert.match(drawer, /const stockWrites = changedMovements\.length > 0/, 'um produto novo com saldo precisa criar as movimentações iniciais mesmo sem evento intermediário na grade');
assert.match(drawer, /Confirmando o estoque físico/, 'o cadastro precisa deixar claro quando está confirmando o saldo');
assert.match(drawer, /movement\?\.newPhysicalQuantity/, 'o saldo retornado pela API precisa ser conferido antes de fechar o cadastro');
assert.match(drawer, /não foi confirmado/, 'uma divergência de saldo não pode fechar o cadastro como se estivesse concluído');
assert.match(drawer, /Custo é informação financeira complementar/, 'falhas no custo não podem interromper o cadastro físico');
assert.match(drawer, /Produto e estoque foram salvos\. O custo não foi atualizado/, 'uma falha de custo precisa ser comunicada sem fingir que o estoque falhou');
assert.match(stockCenter, /const getDisplayedStock/, 'a lista de estoque deve tratar a chegada assíncrona entre produto e inventário');
assert.match(stockCenter, /hasInventoryDocument/, 'o espelho do produto só pode ser usado enquanto ainda não existir inventário oficial');
assert.match(drawer, /collection: isPlainStockItem \? 'TODOS'/, 'peça lisa deve pertencer internamente à linha TODOS');
assert.match(drawer, /status: isPlainStockItem \? 'draft'/, 'peça lisa não pode ser publicada para venda');
assert.match(drawer, /price: isPlainStockItem \? 0/, 'peça lisa não deve carregar preço de venda');
assert.doesNotMatch(drawer, /Tipo do Produto no Estoque/, 'o tipo não deve ser escolhido novamente no cadastro liso');
assert.doesNotMatch(drawer, /Usar esta peça lisa como base de estoque nos pedidos PRIME/, 'a base lisa deve ser automática');
assert.match(drawer, /TECHNICAL_SPEC_OPTIONS/, 'as especificações técnicas devem ter opções padronizadas');
assert.match(drawer, /Selecionar composição/, 'tecido deve ser escolhido em lista');
assert.match(drawer, /Selecionar gramatura/, 'gramatura deve ser escolhida em lista');
assert.match(drawer, /Selecionar modelagem/, 'modelagem deve ser escolhida em lista');
assert.match(drawer, /Selecionar gola/, 'gola deve ser escolhida em lista');

console.log('Product editor reliability checks passed.');
