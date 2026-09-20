import assert from 'node:assert/strict';
import { calculateCashForecast } from '../shared/cashForecast';
import { calculateRecordedCashFlow, financialDateKey, scheduleOpenBalance } from '../shared/cashFlow';
import * as front from '../src/utils/orderFinancial';
import * as back from '../server/utils/orderFinancial';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';

let count = 0;
function test(name: string, run: () => void) { run(); count++; console.log(`PASS ${name}`); }
const now = new Date('2026-09-20T12:00:00Z');
const paid = { total: 300, payment: { paidAmount: 300, refundedAmount: 20, gatewayFee: 5, status: 'partially_refunded' }, shippingCost: 12, items: [] };
test('cash balances agree between overview, server and forecast on identical inputs', () => {
  const expenses = [{ type: 'in', amount: 100 }, {type:'out',amount:30}, {type:'out', amount:400,status:'cancelled'}];
  const ads = [{amountSpent:7}, {amountSpent:90,status:'cancelled'}];
  const a = front.calculateFinancialDRE([paid], expenses, [], ads);
  const b = back.calculateFinancialDRE([paid], expenses, [], ads);
  const c = calculateCashForecast([paid], [], expenses, ads, now);
  assert.equal(a.netCashFlow, 326); assert.equal(b.netCashFlow, 326); assert.equal(c.currentCashBalance, 326);
});
test('cancelled unpaid order shipping costs stay consistent across cash views', () => {
  const order={status:'Cancelado',total:100,payment:{paidAmount:0,status:'cancelled'},shippingCost:9};
  assert.equal(front.calculateFinancialDRE([order]).netCashFlow,-9);
  assert.equal(back.calculateFinancialDRE([order]).netCashFlow,-9);
  assert.equal(calculateCashForecast([order],[],[],[],now).currentCashBalance,-9);
});
test('partial payable mirroring deducts only the uncovered payment', () => {
  const entries = [{type:'out',amount:30,sourceType:'accounts_payable',sourceReferenceId:'bill'}];
  const bill = {id:'bill',amount:100,amountPaid:50,status:'partially_paid'};
  assert.equal(calculateRecordedCashFlow([],entries,[],[bill]).cashOut,50);
  assert.equal(calculateRecordedCashFlow([],[...entries,{...entries[0],amount:20}],[],[bill]).cashOut,50);
  assert.equal(calculateRecordedCashFlow([],[{...entries[0],status:'cancelled'}],[],[bill]).cashOut,50);
});
test('cancelled order keeps real captured money but has no receivable balance', () => {
  const order = {...paid,status:'Cancelado',payment:{...paid.payment,paidAmount:100,refundedAmount:0,status:'partially_paid'}};
  assert.equal(front.getOrderPendingAmount(order),0);
  assert.equal(calculateCashForecast([order],[],[],[],now).currentCashBalance,83);
});
test('payable installments enter only their own horizon, not all at next due date', () => {
  const bill={id:'bill',amount:300,amountPaid:100,amountOpen:999,status:'partially_paid',installments:[
    {amount:100,status:'paid',dueDate:'2026-09-01'},
    {amount:100,status:'pending',dueDate:'2026-09-25'},
    {amount:100,status:'pending',dueDate:'2026-11-01'}]};
  const s=calculateCashForecast([], [bill],[],[],now);
  assert.equal(s.expectedPayables7Days,100); assert.equal(s.expectedPayables30Days,100); assert.equal(s.expectedPayables60Days,200);
});
test('missing dates are unallocated, not automatically overdue or forecast', () => {
  const s=calculateCashForecast([{total:100,payment:{paidAmount:0,status:'pending'}}],[{amount:50,amountPaid:0,status:'pending'}],[],[],now);
  assert.equal(s.unscheduledReceivables,100); assert.equal(s.unscheduledPayables,50);
  assert.equal(s.overduePayablesCount,0); assert.equal(s.expectedPayables90Days,0); assert.equal(s.expectedReceivables90Days,0);
});
test('stale installment totals cannot exceed real remaining debt; paid aliases are ignored', () => {
  const plan=scheduleOpenBalance(50,[{amount:100,status:'PAGA',dueDate:'2026-09-20'},{amount:100,dueDate:'2026-09-25'},{amount:100,dueDate:'2026-10-25'}]);
  assert.deepEqual(plan,{entries:[{due:'2026-09-25',amount:50}],unscheduled:0});
});
test('receivables uses the same recorded installment due date as forecast', () => {
  const order={total:100,payment:{paidAmount:0,status:'pending'},createdAt:'2020-01-01'};
  assert.equal(front.getOrderPaymentDueDate(order),null);
  assert.equal(back.isOrderPaymentOverdue(order),false);
  assert.equal(financialDateKey(front.getOrderPaymentDueDate({...order,dueDate:'2026-09-10',payment:{paidAmount:100,status:'approved'}})),'2026-09-10');
  const installmentOrder={...order,installments:[{amount:50,status:'paid',dueDate:'2020-01-01'},{amount:50,dueDate:'2026-09-25'}]};
  assert.equal(financialDateKey(front.getOrderPaymentDueDate(installmentOrder)),'2026-09-25');
});
test('Brazilian date boundary and invalid dates are handled explicitly', () => {
  assert.equal(financialDateKey(new Date('2026-09-21T01:00:00Z')),'2026-09-20');
  assert.equal(financialDateKey('2026-02-30'),null);
  assert.equal(financialDateKey('2026-09-21'),'2026-09-21');
});
test('invalid money cannot serialize as a misleading zero forecast', () => {
  assert.throws(()=>calculateCashForecast([],[],[{type:'out',amount:'invalid'}],[],now),/inválidos/);
  assert.ok(Number.isNaN(front.calculateFinancialDRE([],[{type:'out',amount:'invalid'}]).netCashFlow));
});

async function main() {
  const db = requireIsolatedTestDb();
  const { getCashForecastController } = await import('../server/controllers/admin.controller');
  await db.collection('orders').doc('fixture-old-debt').set({total:75,payment:{paidAmount:0,status:'pending',dueDate:'2026-01-01'}});
  for (let i=0;i<60;i++) await db.collection('orders').doc(`fixture-paid-${i}`).set({total:10,payment:{paidAmount:10,status:'approved',gatewayFee:0}});
  let body: any, status=200;
  const response:any={status(code:number){status=code;return this;},json(value:any){body=value;return this;}};
  await getCashForecastController({} as any,response);
  assert.equal(status,200); assert.equal(body.success,true); assert.equal(body.summary.currentCashBalance,600);
  assert.equal(body.summary.expectedReceivables7Days,75);
  count++;console.log('PASS forecast controller reads all 61 isolated records including old debt');
  console.log(`${count} cash forecast checks passed; no production writes.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
