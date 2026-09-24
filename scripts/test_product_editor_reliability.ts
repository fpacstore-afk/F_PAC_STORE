import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const uploader = read('src/components/admin/products/ProductMockupUploader.tsx');
const drawer = read('src/components/admin/products/ProductManagementDrawer.tsx');

assert.match(uploader, /DndContext/, 'a galeria precisa suportar arrastar imagens');
assert.match(uploader, /SortableContext/, 'a ordem da galeria precisa ser ordenável');
assert.match(uploader, /arrayMove\(images, oldIndex, newIndex\)/, 'soltar uma imagem deve persistir a nova ordem');
assert.match(uploader, /aria-label=\{`Arrastar mockup/, 'o arraste precisa ter identificação acessível');
assert.doesNotMatch(drawer, /setActiveTab\('description'\)/, 'descrição não deve ocupar uma aba própria');
assert.match(drawer, /Descrição e especificações/, 'descrição deve permanecer editável em Informações');
assert.match(drawer, /waitForSaveStep/, 'salvamentos precisam ter prazo máximo');
assert.match(drawer, /pendingNewProductId/, 'repetir um cadastro após timeout não pode criar um produto duplicado');
assert.match(drawer, /savingMessage/, 'o botão deve informar a etapa de salvamento em andamento');
assert.match(drawer, /collection: isPlainStockItem \? 'TODOS'/, 'peça lisa deve pertencer internamente à linha TODOS');
assert.match(drawer, /status: isPlainStockItem \? 'draft'/, 'peça lisa não pode ser publicada para venda');
assert.match(drawer, /price: isPlainStockItem \? 0/, 'peça lisa não deve carregar preço de venda');
assert.doesNotMatch(drawer, /Tipo do Produto no Estoque/, 'o tipo não deve ser escolhido novamente no cadastro liso');
assert.doesNotMatch(drawer, /Usar esta peça lisa como base de estoque nos pedidos PRIME/, 'a base lisa deve ser automática');

console.log('Product editor reliability checks passed.');
