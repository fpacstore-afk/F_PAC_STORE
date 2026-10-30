import assert from 'node:assert/strict';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { correctRecordedPayment } from '../server/services/paymentCorrection.service';
import { paymentCorrectionRevision } from '../shared/paymentCorrection';
import { summarizeReceipts, orderReceiptHistory } from '../shared/financialReceipts';
import { financialDateKey } from '../shared/cashFlow';
import { updateOrderPaymentStatus, processOrderRefundController, reverseOrderRefundController, registerManualPaymentController, repairRefundReversalBalanceController, correctRefundReversalOrderTotalController } from '../server/controllers/admin.controller';

const db = requireIsolatedTestDb();
const actor = { uid:'isolated-owner', email:'fixture@example.invalid' };
async function call(handler: any, orderId: string, body: any, expectedStatus = 200) {
  let status = 200, result: any;
  await handler({ params:{orderId}, body, user:actor, ip:'127.0.0.1' },
    { status(code:number){status=code;return this;}, json(value:any){result=value;return this;} });
  assert.equal(status,expectedStatus,JSON.stringify(result)); return result;
}
const id = 'manual-receipt-correction-fixture';
const ref = db.collection('orders').doc(id);
await ref.set({ id, isManual:true, customerName:'Cliente de teste', total:2565, pricing:{total:2565},
  status:'received', productionStatus:'completed', shippingStatus:'delivered', items:[{id:'fixture',quantity:1}],
  amountPaid:570, balanceDue:1995, paymentStatus:'partially_paid',
  payment:{paidAmount:570,pendingAmount:1995,status:'partially_paid',method:'PIX',
    installments:[{amount:1000,paidAmount:570,status:'pending',dueDate:'2026-11-01'},{amount:1565,paidAmount:0,status:'pending',dueDate:'2026-12-01'}]},
  paymentLogs:[{id:'opening',amount:570,date:'2020-09-15T12:00:00Z',recordedBy:'fixture'}],
  history:[{type:'note',message:'preserve original audit'}] });
await call(updateOrderPaymentStatus,id,{newStatus:'approved',reason:'Fixture mistaken settlement',idempotencyKey:'fixture-full'});
await call(processOrderRefundController,id,{amount:1995,reason:'Fixture mistaken refund',idempotencyKey:'fixture-r1'});
await call(processOrderRefundController,id,{amount:570,reason:'Fixture mistaken refund',idempotencyKey:'fixture-r2'});
await call(reverseOrderRefundController,id,{reason:'Fixture reverse mistaken refunds',idempotencyKey:'fixture-reverse'});
const before = (await ref.get()).data();
const priorLedger = (await db.collection('financial_events').get()).docs.map((doc:any)=>[doc.id,JSON.stringify(doc.data())]);
const input = { orderId:id,correctedPaidAmount:570,reason:'Baixa integral registrada por engano',idempotencyKey:'fixture-correction',
  expectedRevision:paymentCorrectionRevision(before), confirmed:true, actor };
const result = await correctRecordedPayment(input,db);
assert.equal(result.order.payment.paidAmount,570); assert.equal(result.order.balanceDue,1995);
let saved = (await ref.get()).data();
assert.equal(saved.payment.status,'partially_paid'); assert.equal(saved.paymentStatus,'partially_paid');
assert.equal(saved.total,2565); assert.deepEqual(saved.pricing,before.pricing);
for(const field of ['status','productionStatus','shippingStatus','items','paymentLogs','refundLogs']) assert.deepEqual(saved[field],before[field]);
assert.deepEqual(saved.payment.installments.map((item:any)=>item.paidAmount),[570,0]);
assert.deepEqual(saved.payment.installments.map((item:any)=>item.status),['pending','pending']);
assert.equal(saved.payment.installments[0].dueDate,'2026-11-01');
assert.equal(saved.payment.refundedAmount,0);
assert.equal(saved.history.length,before.history.length+1);
const event = (await db.collection('financial_events').doc(result.eventId).get()).data();
assert.equal(event.type,'payment_correction');assert.equal(event.amount,-1995);assert.equal(event.newPendingAmount,1995);
for(const [eventId,value] of priorLedger) assert.equal(JSON.stringify((await db.collection('financial_events').doc(eventId).get()).data()),value);
assert.equal(summarizeReceipts([saved]).netReceived,570);
assert.equal(summarizeReceipts([saved],{start:'2020-09-01',end:'2020-09-30'}).netReceived,570);
assert.equal(orderReceiptHistory(saved).conflict,false);
assert.equal((await correctRecordedPayment(input,db)).idempotentReplay,true);
console.log('PASS mistaken settlement/refunds/reversal correct to actual partial receipt, preserve total, original events, delivery, installment dates and original receipt date.');
const protectedSnapshot = JSON.stringify(saved);
for (const handler of [repairRefundReversalBalanceController,correctRefundReversalOrderTotalController]) {
  await call(handler,id,{correctedTotal:570,idempotencyKey:'obsolete-repair'},409);
}
assert.equal(JSON.stringify((await ref.get()).data()),protectedSnapshot,'obsolete repair endpoints cannot erase debt or change the sale total');

await call(registerManualPaymentController,id,{amount:100,method:'PIX',reason:'Fixture next payment',idempotencyKey:'fixture-next'});
saved=(await ref.get()).data();
assert.equal(summarizeReceipts([saved]).netReceived,670);
assert.equal(summarizeReceipts([saved],{start:'2020-09-01',end:'2020-09-30'}).netReceived,570);
const laterDate = financialDateKey(saved.paymentLogs.at(-1).date)!;
assert.equal(summarizeReceipts([saved],{start:laterDate,end:laterDate}).netReceived,100);
assert.equal((await correctRecordedPayment(input,db)).order.payment.paidAmount,670,'replay returns current financial truth');
await assert.rejects(correctRecordedPayment({...input,idempotencyKey:'fixture-stale'},db),(error:any)=>error.code==='PAYMENT_CORRECTION_STALE');
const retry = await call(registerManualPaymentController,id,{amount:100,method:'PIX',reason:'Fixture next payment',idempotencyKey:'fixture-next'});
assert.equal(retry.order.payment.paidAmount,670);
assert.equal(retry.order.balanceDue,1895);
console.log('PASS later receipts add once at their own date, correction replay stays current, payment replay stays current, and stale corrections are refused.');

for(const changes of [{correctedPaidAmount:-1},{correctedPaidAmount:NaN},{correctedPaidAmount:Infinity},{correctedPaidAmount:1.001},{correctedPaidAmount:670},{correctedPaidAmount:3000},{reason:''},{confirmed:false}]) {
  await assert.rejects(correctRecordedPayment({...input,expectedRevision:paymentCorrectionRevision(saved),idempotencyKey:'invalid-'+String(Object.keys(changes)),...changes},db));
}
await assert.rejects(correctRecordedPayment({...input,reason:'Different request'},db),(error:any)=>error.code==='IDEMPOTENCY_CONFLICT');
const protectedId='provider-correction-fixture';
await db.collection('orders').doc(protectedId).set({...saved,id:protectedId,payment:{...saved.payment,providerPaymentId:'external-fixture'}});
const protectedOrder=(await db.collection('orders').doc(protectedId).get()).data();
await assert.rejects(correctRecordedPayment({...input,orderId:protectedId,idempotencyKey:'provider-correction',expectedRevision:paymentCorrectionRevision(protectedOrder)},db),(error:any)=>error.code==='PAYMENT_CORRECTION_NOT_ALLOWED');
await assert.rejects(correctRecordedPayment({...input,orderId:protectedId},db),(error:any)=>error.code==='IDEMPOTENCY_CONFLICT');
await call(reverseOrderRefundController,protectedId,{reason:'Fixture provider reversal must fail',idempotencyKey:'provider-reverse'},409);
await call(processOrderRefundController,id,{amount:20,reason:'Fixture real refund',idempotencyKey:'real-refund'});
saved=(await ref.get()).data();
await assert.rejects(correctRecordedPayment({...input,idempotencyKey:'active-refund',expectedRevision:paymentCorrectionRevision(saved)},db),(error:any)=>error.code==='PAYMENT_CORRECTION_NOT_ALLOWED');
await call(reverseOrderRefundController,id,{reason:'Fixture correction',idempotencyKey:'reverse-partial'});
saved=(await ref.get()).data();assert.equal(saved.payment.status,'partially_paid');assert.equal(saved.balanceDue,1895);
console.log('PASS invalid amounts, missing confirmation/reason, cross-order replay, provider payments and active refunds cannot be silently changed; reversal of partial refund preserves unpaid debt.');

const concurrentId='concurrent-receipt-correction-fixture';
await db.collection('orders').doc(concurrentId).set({id:concurrentId,isManual:true,total:100,payment:{paidAmount:100,status:'approved',installments:[]},installments:[],status:'received',paymentLogs:[{id:'a',amount:100,date:'2026-09-01'}]});
const concurrentOrder=(await db.collection('orders').doc(concurrentId).get()).data();
const outcomes=await Promise.allSettled([20,40].map((target,index)=>correctRecordedPayment({...input,orderId:concurrentId,correctedPaidAmount:target,idempotencyKey:'concurrent-'+index,expectedRevision:paymentCorrectionRevision(concurrentOrder)},db)));
assert.equal(outcomes.filter(outcome=>outcome.status==='fulfilled').length,1);
assert.equal(outcomes.filter(outcome=>outcome.status==='rejected').length,1);
const current=(await db.collection('orders').doc(concurrentId).get()).data();
assert.deepEqual(current.payment.installments,[]);
assert.deepEqual(current.installments,[]);
await correctRecordedPayment({...input,orderId:concurrentId,correctedPaidAmount:0,idempotencyKey:'zero-correction',expectedRevision:paymentCorrectionRevision(current)},db);
const zero=(await db.collection('orders').doc(concurrentId).get()).data();
assert.equal(zero.balanceDue,100);assert.equal(zero.payment.status,'pending');assert.equal(summarizeReceipts([zero]).netReceived,0);
console.log('PASS concurrent corrections cannot overwrite each other, and a mistaken full payment can return to zero received with the full debt intact.');

const unknownId='undated-correction-fixture';
await db.collection('orders').doc(unknownId).set({id:unknownId,isManual:true,total:100,status:'received',payment:{paidAmount:100,status:'approved'}});
let unknown=(await db.collection('orders').doc(unknownId).get()).data();
await correctRecordedPayment({...input,orderId:unknownId,correctedPaidAmount:40,idempotencyKey:'undated-first',expectedRevision:paymentCorrectionRevision(unknown)},db);
await call(registerManualPaymentController,unknownId,{amount:20,method:'PIX',reason:'Fixture dated receipt',idempotencyKey:'dated-after-undated'});
unknown=(await db.collection('orders').doc(unknownId).get()).data();
assert.equal(summarizeReceipts([unknown]).netReceived,60);
assert.equal(summarizeReceipts([unknown]).undatedReceived,40);
await correctRecordedPayment({...input,orderId:unknownId,correctedPaidAmount:30,idempotencyKey:'undated-second',expectedRevision:paymentCorrectionRevision(unknown)},db);
unknown=(await db.collection('orders').doc(unknownId).get()).data();
assert.equal(summarizeReceipts([unknown]).netReceived,30);
assert.equal(summarizeReceipts([unknown]).undatedReceived,10);
assert.equal(orderReceiptHistory(unknown).incoming.movements.reduce((total,item)=>total+item.amount,0),20);
assert.equal(unknown.paymentCorrections.length,2);
console.log('PASS repeated corrections preserve later dated receipts and keep missing historical dates explicitly unallocated.');

// Exercise the real admin route without external services or real customer data.
const { default:app }=await import('../server.ts');
const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
try {
  const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/admin/orders/${id}/payment-correction`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  assert.equal(response.status,401);
} finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
console.log('PASS anonymous requests cannot use the correction endpoint; all fixtures stayed in the isolated database.');
