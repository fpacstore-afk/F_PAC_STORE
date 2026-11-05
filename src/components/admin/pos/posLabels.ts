import { toCanvas } from 'bwip-js/browser';
import { PDFDocument } from 'pdf-lib';

export type LabelVariant = { name: string; color: string; size: string; neckline: string; finish: string; code: string };
const mmToPoints = 72 / 25.4;

export async function createPosLabel(variant: LabelVariant, format: 'pdf' | 'png', copies: number) {
  const sheet = document.createElement('canvas');
  sheet.width = 800;
  sheet.height = 1200;
  const ctx = sheet.getContext('2d');
  if (!ctx) throw new Error('O navegador não conseguiu preparar a etiqueta.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText('F PAC STORE', 64, 140, 672);
  ctx.fillRect(64, 172, 672, 4);
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(variant.name, 64, 260, 672);
  ctx.font = '30px sans-serif';
  ctx.fillText([variant.color, variant.size, variant.neckline].filter(Boolean).join(' / '), 64, 324, 672);
  ctx.fillText(variant.finish === 'plain' ? 'Peça lisa' : 'Peça pronta', 64, 372, 672);
  const bars = document.createElement('canvas');
  toCanvas(bars, { bcid: 'code128', text: variant.code, scale: 2, height: 26, paddingwidth: 12, backgroundcolor: 'FFFFFF' });
  if (bars.width > 672) throw new Error('Código longo demais para este perfil de etiqueta.');
  ctx.drawImage(bars, Math.round((800 - bars.width) / 2), 520);
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px monospace';
  ctx.fillText(variant.code, 400, 740, 672);
  const png = await new Promise<Blob>((resolve, reject) => sheet.toBlob(blob => {
    if (blob) resolve(blob); else reject(new Error('Falha ao gerar a imagem da etiqueta.'));
  }, 'image/png'));
  if (format === 'png') return new File([png], variant.code + '.png', { type: png.type });
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(await png.arrayBuffer());
  const width = 100 * mmToPoints, height = 150 * mmToPoints;
  for (let copy = 0; copy < copies; copy++) {
    const page = pdf.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }
  return new File([(await pdf.save()).slice().buffer], variant.code + '.pdf', { type: 'application/pdf' });
}
