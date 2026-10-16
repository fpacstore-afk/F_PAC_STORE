import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { calculateOrderPricing } from '../server/services/pricing.service';
import { quoteCheckoutDelivery } from '../server/services/checkoutDelivery.service';
import { calculateStorefrontTotals, selectActivePromotion } from '../shared/storefrontTotals';
import { shippingParcel } from '../shared/shippingParcel';
import { getDailyPromoCode } from '../src/lib/promo';
import { getFlashSaleInfo } from '../src/lib/flashSale';
import type { WeeklyPromotion } from '../src/types/promotions';

const db = requireIsolatedTestDb();
const now = new Date('2026-10-16T01:00:00Z').getTime();
const item = { id: 'shirt', slug: 'shirt', name: 'Fixture', price: 79.90, originalPrice: 89.90, quantity: 1, color: 'Preto', size: 'M', image: '', category: 'Camisetas' };
const local = { city: 'Joinville', state: 'SC', neighborhood: 'Itaum' };
const delivery = { lookupPostcode: async () => local };
const campaignRef = db.collection('weekly_promotions').doc('fixture-promotion');
await db.collection('products').doc('shirt').set({ ...item, price: 89.90, promotionalPrice: 79.90, status: 'active', costPrice: 34 });
const campaign = (fields: Partial<WeeklyPromotion>): WeeklyPromotion => ({
  id: 'fixture-promotion', active: true, title: 'Fixture', description: '', banner_image: '',
  discount_type: 'percentage', discount_value: 10, start_date: '', end_date: '',
  countdown_enabled: false, product_ids: [], ...fields,
});
let checks = 0;
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  await fn(); checks++; console.log('PASS ' + name);
}
await check('local freight follows the postcode neighborhood table, including accents and unknown neighborhoods', async () => {
  for (const [neighborhood, expected] of [['Itaum', 11.40], ['AMÉRICA',16.40],['Guanabara',15.90],['Unknown',15.90]] as const) {
    const result = await quoteCheckoutDelivery({ cep: '89234-100' }, [item], { lookupPostcode: async () => ({ ...local, neighborhood }) });
    assert.equal(result.shipping, expected);
  }
});
await check('a remote postcode cannot select local delivery and catalog parcel defaults are shared', async () => {
  let requests = 0;
  const result = await quoteCheckoutDelivery({ cep:'01001000', shippingServiceId: 2 }, [item], {
    lookupPostcode: async () => ({city:'São Paulo',state:'SP',neighborhood:'Sé'}),
    calculateShipping: async input => { requests++; assert.deepEqual(input.items,[shippingParcel(item)]); return [{id:2,price:'25.60'}]; },
  });
  assert.equal(result.shipping,25.60); assert.equal(requests,1);
  assert.deepEqual(shippingParcel(item),{id:'shirt',width:17,height:5,length:11,weight:.3,insurance_value:79.90,quantity:1});
});
await check('invalid, failed and unavailable carrier services cannot become free shipping or a different service', async () => {
  const remote = { lookupPostcode: async () => ({city:'São Paulo',state:'SP',neighborhood:'Sé'}) };
  for (const options of [[{id:1,price:''}],[{id:1,price:null}],[{id:1,price:-1}],[{id:1,price:'0',error:'unavailable'}],[]]) {
    await assert.rejects(quoteCheckoutDelivery({cep:'01001000'},[item],{...remote,calculateShipping:async()=>options}));
  }
  await assert.rejects(quoteCheckoutDelivery({cep:'01001000',shippingServiceId:2},[item],{...remote,calculateShipping:async()=>[{id:1,price:10}]}));
  assert.equal((await quoteCheckoutDelivery({cep:'01001000',shippingServiceId:1},[item],{...remote,calculateShipping:async()=>[{id:1,price:'0.00'}]})).shipping,0);
  await assert.rejects(quoteCheckoutDelivery({cep:'123'},[item],remote),/CEP inválido/);
});
await check('authoritative checkout uses the displayed catalog promotional price and rejects forged line prices', async () => {
  const result = await calculateOrderPricing({ items: [{...item,price:.01}], customerInfo:{cep:'89234100'} }, {...delivery,now});
  assert.equal(result.verifiedItems[0].price,79.90);
  assert.equal(result.verifiedItems[0].originalPrice,89.90);
  assert.equal(result.pricing.shipping,11.40);
});
await check('cart and checkout agree in cents for every supported monetary campaign and both payment methods', async () => {
  const campaigns: Array<WeeklyPromotion|null> = [
    null, campaign({}), campaign({discount_type:'fixed_amount',discount_value:7}),
    campaign({discount_type:'combo',combo_qty:2,combo_discount_percent:15}),
    campaign({discount_type:'progressive',progressive_rules:[{qty:2,discount_percent:12}]}),
    campaign({discount_type:'buy3get2'}), campaign({discount_type:'pix_discount',pix_discount:12}),
    campaign({discount_type:'pix_discount',pix_discount:null,discount_value:null}),
    campaign({discount_type:'cupom',coupon_code:'TESTE',discount_value:8}),
    campaign({discount_type:'category',categories_participating:['Camisetas']}),
    campaign({discount_type:'percentage',product_ids:['shirt']}),
    campaign({discount_type:'free_shipping_regional',allowed_regions:['Joinville']}),
  ];
  for (const promotion of campaigns) {
    if (promotion) await campaignRef.set(promotion); else await campaignRef.delete();
    for (const method of ['pix','visa']) for (const quantity of [1,2,3]) {
      const coupon = promotion?.discount_type === 'cupom' ? 'TESTE' : getDailyPromoCode(new Date(now));
      const items = [{...item,quantity}];
      const front = calculateStorefrontTotals({items,promotion,shipping:11.40,coupon,pixEnabled:method==='pix',city:'Joinville',now});
      const back = await calculateOrderPricing({ items,customerInfo:{cep:'89234100'},couponCode:coupon,paymentMethodId:method },{...delivery,now});
      assert.equal(back.pricing.total,front.total);
      assert.equal(back.pricing.shipping,front.shipping);
      assert.equal(back.pricing.couponDiscount,front.couponDiscount);
      assert.equal(back.pricing.pixDiscount,front.pixDiscount);
      assert.equal(back.pricing.promotionalDiscount,Number((front.promotionDiscount+front.flashSaleDiscount).toFixed(2)));
    }
  }
  await campaignRef.delete();
});
await check('promotion membership uses canonical product identity and category', async () => {
  const promotion=campaign({product_ids:['other-product'],discount_value:80});
  await campaignRef.set(promotion);
  const result=await calculateOrderPricing({items:[{...item,id:'other-product'}],customerInfo:{cep:'89234100'}},{...delivery,now});
  assert.equal(result.pricing.promotionalDiscount,0);
  await campaignRef.delete();
});
await check('expired and future campaigns are excluded and priority matches the storefront', () => {
  const valid=campaign({id:'active'});
  const expired=campaign({id:'expired',priority:100,end_date:new Date(now-1).toISOString()});
  const future=campaign({id:'future',priority:100,start_date:new Date(now+1).toISOString()});
  assert.equal(selectActivePromotion([expired,future,valid],now)?.id,'active');
  assert.equal(selectActivePromotion([valid,campaign({id:'priority',priority:20})],now)?.id,'priority');
});
await check('daily coupon date is Brasília even on a server running UTC and flash boundaries update immediately', () => {
  assert.equal(getDailyPromoCode(new Date('2026-10-16T01:00:00Z')),getDailyPromoCode(new Date('2026-10-15T15:00:00Z')));
  assert.notEqual(getDailyPromoCode(new Date('2026-10-16T03:00:00Z')),getDailyPromoCode(new Date('2026-10-16T01:00:00Z')));
  const anchor=new Date('2024-01-01T16:00:00-03:00').getTime();
  const active=calculateStorefrontTotals({items:[item],promotion:null,shipping:11.40,pixEnabled:false,city:'Joinville',now:anchor});
  const expired=calculateStorefrontTotals({items:[item],promotion:null,shipping:11.40,pixEnabled:false,city:'Joinville',now:anchor+30*60*1000});
  assert.equal(active.flashSaleDiscount,getFlashSaleInfo(anchor).discountValue);
  assert.equal(expired.flashSaleDiscount,0);
});
await check('both payment payloads send the coupon and changed quotes require reviewing the bag', () => {
  const form=readFileSync('src/components/PaymentForm.tsx','utf8');
  assert.equal((form.match(/couponCode: coupon/g)||[]).length,2);
  assert.match(form,/CHECKOUT_TOTAL_CHANGED/);
  assert.match(form,/navigate\('\/bag'\)/);
});
console.log(checks+' storefront/checkout pricing regressions passed; isolated database and fake shipping only.');
