import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { SizeChart } from '../src/components/SizeChart';
import { getProductDetailLabels } from '../src/lib/productPresentation';
import assert from 'node:assert/strict';
import { categoryCatalogView } from '../src/lib/categoryCatalog';
import { buildSellableCatalog, getProductCommercialLines } from '../src/lib/catalogProducts';
import { STOCK_FAMILIES } from '../shared/stockFamilies';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { loadPublicCatalog } from '../server/services/publicCatalog.service';
import { calculateOrderPricing } from '../server/services/pricing.service';
import { checkStock, reserveStock, releaseStockReservation } from '../server/services/store.service';

const db = requireIsolatedTestDb();
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('No external purchases, shipping or messages in catalog certification'); };
try {
  for (const family of STOCK_FAMILIES) {
    const entry = (id: string, extra: any = {}) => ({ id, slug:id, name:family.label, stockFamily:family.id, productType:family.productType, productFinish:'printed', status:'active', images:['/product-visuals/shorts-front-v1.webp'], price:59, ...extra });
    const products = buildSellableCatalog([], [entry('universal',{collection:'TODOS'}),entry('force',{slug:'force-item',collection:'FORCE'}),entry('mark',{slug:'mark-item',collection:'MARK'}),entry('no-line'),entry('multi',{collections:['FORCE','MARK']}),entry('draft',{status:'draft'}),entry('inactive',{status:'inactive'}),entry('base',{status:'active',productFinish:'plain'})]);
    for (const request of [null,'','all','todos','invalid']) {
      const view = categoryCatalogView(products,family.id,request,true);
      assert.equal(view.selectedLine,'all');
      assert.deepEqual(view.filteredProducts.map(p=>p.id),['universal','force','mark','no-line','multi'],`${family.id}: every published product remains discoverable`);
      assert.equal(view.lineCounts.all,5);
    }
    assert.deepEqual(categoryCatalogView(products,family.id,'force',true).filteredProducts.map(p=>p.id),['force','multi']);
    assert.deepEqual(categoryCatalogView(products,family.id,'mark',true).filteredProducts.map(p=>p.id),['mark','multi']);
    assert.equal(categoryCatalogView(products,family.id,'prime',true).selectedLine,'prime');
    assert.equal(categoryCatalogView(products,family.id,'prime',false).selectedLine,'all');
    const universal = [products[0]];
    assert.deepEqual(categoryCatalogView(universal,family.id,null).visibleLines,['all']);
    const explicit = categoryCatalogView(universal,family.id,'force');
    assert.equal(explicit.filteredProducts.length,0);
    assert.equal(explicit.categoryProducts.length,1,'an empty line is not an empty category');
    assert.equal(categoryCatalogView(products,'missing',null).filteredProducts.length,0);
  }
  const expectedSizeLabels = { oversized:'Tamanho da camiseta',traditional:'Tamanho da camiseta',cropped:'Tamanho do cropped',hoodie:'Tamanho do casaco',shorts:'Tamanho da bermuda',regata:'Tamanho da regata',cap:'Tamanho do boné' };
  for (const [kind, label] of Object.entries(expectedSizeLabels)) {
    const labels = getProductDetailLabels({ name: kind, productType:kind, baseModel:kind });
    assert.equal(labels.sizeHeading,label);
    assert.equal(labels.showCollar,!['shorts','regata','cap'].includes(kind));
  }
  const chart = renderToStaticMarkup(React.createElement(StaticRouter, {location:'/product/cargo'}, React.createElement(SizeChart, {model:'shorts',customData:[{size:'M',length:'50 cm',width:'40 cm',sleeve:'20 cm'}],availableSizes:['M']})));
  assert.match(chart,/50 cm/);
  assert.doesNotMatch(chart,/<svg|De uma axila|Do ombro|MANGA:/i,'shorts never borrow a shirt drawing or measuring instructions');
  const cargo = { id:'cargo', slug:'cargo-live-shape', name:'Bermuda de Linho Cargo', status:'active', category:'Bermuda de Linho Cargo', productType:'shorts', collection:'TODOS', baseModel:'Bermuda Linho Cargo', productFinish:'printed', stockBaseSlug:'cargo-base', stockMode:'shared', price:69, promotionalPrice:59, is_prime:false, images:['/product-visuals/shorts-front-v1.webp'], colors:[{name:'Off White'},{name:'Bege'},{name:'Preto'}], sizes:['M','G','GG'] };
  const base = { ...cargo, id:'cargo-base', slug:'cargo-base', name:'Bermuda de Linho Cargo lisa', status:'draft', productFinish:'plain', stockBaseSlug:undefined };
  await db.collection('products').doc(cargo.id).set(cargo);
  await db.collection('products').doc(base.id).set(base);
  const quantities:Record<string,number> = { 'Off White_M':4,'Off White_G':7,'Off White_GG':1,Bege_M:0,Bege_G:1,Bege_GG:1,Preto_M:3,Preto_G:4,Preto_GG:4 };
  await db.collection('inventory').doc(base.slug).set({ available:true, variants:Object.fromEntries(Object.entries(quantities).map(([key,n])=>[key,{physicalQuantity:n,reservedQuantity:0,available:n>0}])) });
  const publicCatalog = await loadPublicCatalog(db);
  const view = categoryCatalogView(buildSellableCatalog([],publicCatalog.products), 'bermudas',null,true);
  assert.equal(view.filteredProducts.length,1,'active TODOS cargo must appear in its default category');
  assert.equal(view.filteredProducts[0].stockBaseSlug,base.slug);
  assert.deepEqual(getProductCommercialLines(view.filteredProducts[0]),['todos'],'discovery never rewrites the registered commercial line');
  assert.equal(publicCatalog.availability[cargo.slug].availableQuantity,25);
  let purchases = 0;
  for (const [key, quantity] of Object.entries(quantities)) {
    const index = key.lastIndexOf('_');
    const item = { productId:cargo.id,slug:cargo.slug,color:key.slice(0,index),size:key.slice(index+1),quantity:1,price:1 };
    const quote = await calculateOrderPricing({items:[item],customerInfo:{}},{priceOnly:true});
    assert.equal(quote.verifiedItems[0].price,59,'catalog promotional price remains authoritative');
    assert.equal((await checkStock(quote.verifiedItems)).isAvailable,quantity>0);
    if (!quantity) continue;
    const id = `CARGO-ISOLATED-${purchases++}`;
    await reserveStock(id,quote.verifiedItems,undefined,{items:quote.verifiedItems});
    const saved = (await db.collection('orders').doc(id).get()).data();
    assert.equal(saved.items[0].inventoryAllocations[0].productSlug,base.slug);
    await releaseStockReservation(id,quote.verifiedItems); await releaseStockReservation(id,quote.verifiedItems);
  }
  assert.equal(purchases,8);
  const balance = (await db.collection('inventory').doc(base.slug).get()).data();
  assert.equal(Object.values(balance.variants).reduce((sum:number,v:any)=>sum+v.physicalQuantity,0),25);
  assert.equal(Object.values(balance.variants).reduce((sum:number,v:any)=>sum+v.reservedQuantity,0),0);
  assert.equal((await db.collection('financial_events').get()).size,0);
  console.log('PASS discovery in all seven categories, TODOS/unclassified/multiple lines, explicit filters, unpublished exclusion, cargo authoritative pricing, eight isolated purchase reservations and idempotent cancellations.');
} finally { globalThis.fetch = originalFetch; }
