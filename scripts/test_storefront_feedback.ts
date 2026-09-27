import assert from 'node:assert/strict';
import { getProductSizeChart } from '../src/lib/productSizeChart';
import { getProductVisualKind } from '../src/lib/productPresentation';
import { matchesManualProduct, manualProductIdentity } from '../src/lib/manualProductIdentity';
import { resolveBrandMedia } from '../src/lib/brandMedia';
import { getCatalogSleeveSizes } from '../shared/primeArtworkSizing';
import { placePrimeArtwork, validatePrimeArtworkPlacement } from '../shared/primePlacement';
import { calculatePrimePrice } from '../shared/primePricing';

const numeric = (model: 'oversized' | 'traditional' | 'cropped') => getProductSizeChart(model).map(r => [r.size, parseFloat(r.length), parseFloat(r.width), parseFloat(r.sleeve)]);
assert.deepEqual(numeric('oversized'), [['P',71,44,22],['M',74,54,24],['G',76,61,25],['GG',79,64,26],['G1',82,71,28]]);
assert.deepEqual(numeric('traditional'), [['P',65,50,16],['M',68,52,18],['G',70,56,18],['GG',72,58,19]]);
assert.deepEqual(numeric('cropped'), [['P',55,57,18],['M',57,60,19],['G',58,61,20],['GG',62,65,21]]);
for (const kind of ['hoodie', 'shorts'] as const) assert.ok(getProductSizeChart(kind).every(r => !r.length && !r.width && !r.sleeve));
assert.deepEqual(getProductSizeChart('cap'), []);
assert.equal(getProductVisualKind({name:'Oversized Suedine Malhão'}),'oversized');
assert.equal(getProductVisualKind({name:'Cropped Oversized'}),'cropped');

const a = { id:'a', name:'Camiseta Oversized F PAC', sku:'FPAC-ÁGUIA-8X6', images:['/a.png'], collection:'FORCE' };
const b = { id:'b', name:a.name, sku:'FPAC-LOGO-30X30', images:['/b.png'], collection:'MARK' };
assert.notEqual(manualProductIdentity(a).reference, manualProductIdentity(b).reference);
assert.ok(matchesManualProduct(a,'aguia force'));
assert.ok(!matchesManualProduct(b,'aguia'));
assert.ok(matchesManualProduct(b,'logo 30x30'));
assert.equal(manualProductIdentity(a).image,'/a.png');

assert.deepEqual(getCatalogSleeveSizes(['30x40','2 × 3 cm','3x2','8x6','2x3']),['2x3','3x2']);
assert.deepEqual(getCatalogSleeveSizes(['15x15']),[]);
const art = {sourceWidth:300,sourceHeight:200,crop:{left:0,top:0,width:1,height:1}};
for (const model of ['oversized','traditional','cropped'] as const) {
  const placed = placePrimeArtwork(model,'M','sleeve','3x2',art,undefined,true);
  assert.equal(placed.widthCm,3); assert.equal(placed.heightCm,2);
  assert.equal(placed.areaWidthCm,3); assert.equal(placed.areaHeightCm,2);
  assert.deepEqual(validatePrimeArtworkPlacement(placed,model,'M','Manga Esquerda','3x2',true),placed);
  assert.throws(()=>placePrimeArtwork(model,'M','sleeve_right','3x2',art,undefined,true));
}
assert.equal(calculatePrimePrice('oversized',[{location:'Manga Esquerda',printSize:'3x2',source:'catalog'}]).total,79.9);

const config = {heroUrl:'/old.png',heroMedia:{url:'/current.png',type:'image',objectFit:'contain',active:true}};
assert.equal(resolveBrandMedia(config,'heroMedia','heroUrl')?.url,'/current.png');
assert.equal(resolveBrandMedia(config,'heroMedia','heroUrl')?.objectFit,'contain');
assert.equal(resolveBrandMedia({...config,heroMedia:{active:false}},'heroMedia','heroUrl'),null);
assert.equal(resolveBrandMedia({heroUrl:'https://drive.google.com/file/d/example/view'},'heroMedia','heroUrl')?.url,'https://lh3.googleusercontent.com/d/example');
console.log('Storefront feedback: approved measurements, pending charts, unique product identity, sleeve orientation/eligibility and canonical cover settings passed.');
