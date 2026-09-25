import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { matchesFinancialEventGroup } from '../src/utils/financialLedger.ts';
import * as client from '../src/utils/orderFinancial.ts';
import * as server from '../server/utils/orderFinancial.ts';
import { useFinancialPrivacy } from '../src/context/FinancialPrivacyContext.tsx';

let checks = 0;
function check(name: string, fn: () => void) {
  fn(); checks++; console.log(`PASS ${name}`);
}
const order = (overrides: any = {}) => ({total:300,payment:{status:'approved',paidAmount:300,gatewayFee:0},items:[{quantity:1,unitCostSnapshot:60}],...overrides});
check('shipping lifecycle object does not poison money totals', () => {
  const input = order({shipping:{status:'delivered'}});
  for(const engine of [client,server]) {
    const f=engine.calculateOrderFinancials(input);
    assert.equal(f.shippingActualCost,0); assert.equal(f.netProfit,240);
    const dre=engine.calculateFinancialDRE([input], [{amount:400,type:'out',category:'DESPESA_FIXA'}]);
    assert.equal(dre.operatingProfit,-160); assert.equal(dre.netCashFlow,-100);
  }
});
check('shipping snapshots and numeric legacy shipping agree across modules', () => {
  for(const input of [order({shipping:12}),order({shipping:'12.50'}),order({shipping:{status:'ready'},pricing:{total:300,shipping:10},shippingFinances:{shippingCharged:0,shippingActualCost:20}})]) {
    assert.deepEqual(client.getOrderShippingFinances(input),server.getOrderShippingFinances(input));
  }
  assert.deepEqual(client.getOrderShippingFinances(order({shippingFinances:{shippingCharged:0,shippingCost:0},shipping:99})),{shippingCharged:0,shippingActualCost:0,shippingSubsidy:0});
});
check('delivery/completion alone does not prove payment', () => {
  for(const status of ['completed','concluído','Concluido','delivered','Entregue']) {
    for(const engine of [client,server]) {
      const input={status,total:300};
      assert.equal(engine.getOrderPaidAmount(input),0);
      assert.equal(engine.getOrderPendingAmount(input),300);
      assert.equal(engine.getOrderPaymentStatus(input),'pending');
    }
  }
});
check('paid, partial, overdue balance mirrors, refunds and legacy aliases stay consistent', () => {
  const cases=[
    [{status:'Entregue',total:300,paidAmount:100},100,200,'partially_paid'],
    [{status:'Entregue',totalAmount:300,amountPaid:300},300,0,'approved'],
    [{status:'completed',total:300,paymentStatus:'approved',paidAmount:0,balanceDue:0},0,300,'pending'],
    [{total:300,payment:{status:'approved',paidAmount:100,pendingAmount:0}},100,200,'partially_paid'],
    [{total:300,payment:{status:'completed'}},300,0,'approved'],
    [{total:300,status:'Pagamento Aprovado'},300,0,'approved'],
    [{total:300,payment:{status:'cancelled',paidAmount:100}},100,0,'cancelled'],
    [{total:300,payment:{status:'refunded',paidAmount:300,refundedAmount:300}},300,0,'refunded'],
    [{total:300,payment:{status:'partially_refunded',paidAmount:300,refundedAmount:50}},300,0,'partially_refunded'],
  ] as const;
  for(const [input,paid,pending,status] of cases) for(const engine of [client,server]) {
    assert.equal(engine.getOrderPaidAmount(input),paid);
    assert.equal(engine.getOrderPendingAmount(input),pending);
    assert.equal(engine.getOrderPaymentStatus(input),status);
  }
});
check('invalid explicit freight is flagged instead of silently changed to zero', () => {
  assert.ok(Number.isNaN(client.getOrderShippingFinances(order({shippingCost:'invalid'})).shippingActualCost));
});
check('pending balances and settled status use whole cents in browser and server', () => {
  for (const engine of [client, server]) {
    assert.equal(engine.getOrderPendingAmount({ total: 250.90, amountPaid: 250.80 }), 0.10);
    assert.equal(engine.getOrderPendingAmount({ total: 0.30, amountPaid: 0.10 }), 0.20);
    assert.equal(engine.getOrderPendingAmount({ payment: { pendingAmount: 250.90 - 250.80 } }), 0.10);
    assert.equal(engine.getOrderPendingAmount({ balanceDue: 0.30 - 0.20 }), 0.10);
    assert.equal(engine.getOrderPendingAmount({ total: 0.1 + 0.2, amountPaid: 0.3 }), 0);
    assert.equal(engine.getOrderPaymentStatus({ total: 0.1 + 0.2, amountPaid: 0.3 }), 'approved');
  }
});
check('money/percentage presentation distinguishes invalid from zero and loss', () => {
  function Probe({value}: {value:number}) { const f=useFinancialPrivacy();return React.createElement('span',null,f.formatMoney(value,{forceShow:true})+'|'+f.formatPercent(value,{forceShow:true})); }
  for(const value of [NaN,Infinity,-Infinity]) assert.equal(renderToStaticMarkup(React.createElement(Probe,{value})),'<span>Conferir dados|Conferir dados</span>');
  assert.match(renderToStaticMarkup(React.createElement(Probe,{value:0})),/0,00\|0%/);
  assert.match(renderToStaticMarkup(React.createElement(Probe,{value:-100})),/-100,00\|-100%/);
});
check('certification database guard refuses production and unspecified environments', () => {
  for(const mode of ['production','development']) {
    const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',"import {requireIsolatedTestDb} from './scripts/requireIsolatedTestDb.ts'; requireIsolatedTestDb();"],{env:{...process.env,NODE_ENV:mode,USE_MOCK_DB:'false'},encoding:'utf8'});
    assert.notEqual(result.status,0);assert.match(result.stderr,/UNSAFE_TEST_DATABASE/);
    assert.doesNotMatch(result.stdout,/FIREBASE.*Iniciando/);
  }
});
check('certification guard accepts only the isolated in-memory implementation', () => {
  const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',"import {requireIsolatedTestDb} from './scripts/requireIsolatedTestDb.ts';const db=requireIsolatedTestDb();if(db.isIsolatedInMemoryDatabase!==true)process.exit(2);"],{env:{...process.env,NODE_ENV:'test',K_SERVICE:''},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
check('ledger filters recognize existing lowercase payment/refund/status events', () => {
  const types=['partial_payment','PAYMENT_APPROVED','refund','partial_refund','payment_status_changed','expense_created'];
  assert.equal(types.filter(t=>matchesFinancialEventGroup(t,'PAYMENT')).length,3);
  assert.equal(types.filter(t=>matchesFinancialEventGroup(t,'REFUND')).length,2);
  assert.equal(types.filter(t=>matchesFinancialEventGroup(t,'STATUS')).length,1);
  assert.equal(matchesFinancialEventGroup(undefined,'PAYMENT'),false);
});
console.log(`${checks} financial reconciliation checks passed; no production writes.`);
