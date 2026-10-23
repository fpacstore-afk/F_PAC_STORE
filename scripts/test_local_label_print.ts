import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/pages/AdminOrders.tsx', 'utf8');
const ast = ts.createSourceFile('AdminOrders.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function loadHandler(name: string, context: Record<string, unknown>) {
  let initializer: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(initializer, `${name} must exist`);
  const code = ts.transpileModule(`globalThis.handler = ${initializer.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, context);
  return context.handler as (order: any) => void;
}

const order = {
  id: 'LOCAL-123',
  customerName: 'Cliente <teste>',
  customerPhone: '(47) 99999-9999',
  address: { street: 'Rua A & B', number: '42', neighborhood: 'Centro', city: 'Joinville', state: 'SC', cep: '89200-000' },
  items: [{ name: 'Camiseta <script>alert(1)</script>', quantity: 2, color: 'Preta', size: 'M' }],
};

let html = '';
let closed = false;
let printCalled = false;
const printWindow = {
  document: { write(value: string) { html = value; }, close() { closed = true; } },
  print() { printCalled = true; },
};
const printLabel = loadHandler('handlePrintLocalLabel', {
  window: { open: () => printWindow },
  toast: { error() { throw new Error('Popup unexpectedly blocked'); } },
});
printLabel(order);
assert.equal(closed, true, 'the label document must finish loading');
assert.equal(printCalled, false, 'opening the preview must not trigger an early print job');
assert.match(html, /@page\s*\{\s*size: 100mm 150mm;/);
assert.match(html, /onclick="window\.print\(\)"/, 'the user can print the rendered preview');
assert.match(html, /\.print-actions\s*\{\s*display: none !important;/, 'preview controls must be hidden on paper');
assert.doesNotMatch(html, /window\.close\(/, 'the window must remain open until printing finishes');
assert.match(html, /CLIENTE &lt;TESTE&gt;/);
assert.match(html, /RUA A &amp; B/);
assert.match(html, /Camiseta &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);

let generatedPdf: Blob | undefined;
const downloadLabel = loadHandler('handleDownloadLocalLabelPdf', {
  Blob,
  TextEncoder,
  URL: { createObjectURL(blob: Blob) { generatedPdf = blob; return 'blob:label'; }, revokeObjectURL() {} },
  document: { createElement() { return { click() {}, remove() {} }; }, body: { appendChild() {} } },
  window: { setTimeout() {} },
  toast: { success() {} },
});
downloadLabel(order);
assert.ok(generatedPdf, 'the fallback PDF must be generated');
const pdf = new TextDecoder().decode(await generatedPdf.arrayBuffer());
assert.match(pdf, /^%PDF-1\.4/);
assert.match(pdf, /\/MediaBox \[0 0 283\.46 425\.20\]/, 'PDF page must be 100 × 150 mm');
assert.match(pdf, /CLIENTE <TESTE>/, 'PDF must contain the recipient');
assert.ok(pdf.includes('2x Camiseta <script>alert\\(1\\)</script>'), 'PDF must contain the item without duplicated escapes');
assert.ok(pdf.includes('TEL: \\(47\\) 99999-9999'), 'PDF should escape parentheses exactly once');

console.log('PASS: local label waits for the user to print its rendered preview and the 10×15 PDF contains order details.');
