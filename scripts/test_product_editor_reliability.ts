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

console.log('Product editor reliability checks passed.');
