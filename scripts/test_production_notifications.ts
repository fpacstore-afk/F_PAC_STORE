import assert from 'node:assert/strict';
import axios from 'axios';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
const db = requireIsolatedTestDb();
const { dispatchStageNotification, saveProductionNotificationSettings, renderStageTemplate } = await import('../server/services/productionNotification.service');
const { updateOrderProductionStatus, updateOrderShippingStatus } = await import('../server/controllers/admin.controller');
const { DEFAULT_STAGE_TEMPLATES } = await import('../shared/productionNotificationDefaults');
process.env.RESEND_API_KEY = 're_isolated_test';
process.env.EVOLUTION_API_URL = 'https://whatsapp.invalid';
process.env.EVOLUTION_API_KEY = 'isolated-test';
let waCalls=0, emailCalls=0, emailFails=true;
const waMessages: string[] = [];
axios.defaults.adapter = async config => {
  assert.match(config.url!, /^https:\/\/whatsapp\.invalid\//);
  const payload = JSON.parse(String(config.data));
  waMessages.push(payload.textMessage.text);
  waCalls++;
  return { status: 201, statusText: 'Created', data: { key: { id: 'fake-message' } }, headers: {}, config };
};
globalThis.fetch = async (input: any, init: any) => {
  assert.match(String(input), /^https:\/\/api\.resend\.com\//);
  emailCalls++;
  const sent = JSON.parse(init.body);
  assert.doesNotMatch(sent.html, /<script>/);
  return new Response(JSON.stringify(emailFails ? { name: 'validation_error', message: 'Rejected by test provider' } : { id: 'fake-email' }), { status: emailFails ? 422 : 200, headers: { 'Content-Type': 'application/json' } });
};
await saveProductionNotificationSettings({ whatsappEnabled: true, emailEnabled: true, allowResendOnStageReentry: false });
const orderId='TEST-PRODUCTION-NOTICES';
const payment={status:'partially_paid',paidAmount:25,pendingAmount:75,installments:[{amount:75,status:'pending',dueDate:'2026-11-01'}]};
await db.collection('orders').doc(orderId).set({
  status:'received',payment,paymentStatus:'partially_paid',balanceDue:75,amountPaid:25,
  customerName:'<script>test</script>',customerPhone:'47999999999',customerEmail:'client@example.invalid',
  items:[{name:'Camiseta Oversized',quantity:2,color:'Preto',size:'GG'},{name:'Boné',quantity:1},{name:'Bermuda',quantity:1}],production:{status:'embalagem'},shipping:{status:'label_created'}
});
const res=()=>({statusCode:200,body:null as any,status(n:number){this.statusCode=n;return this;},json(v:any){this.body=v;return this;}});
let response=res();
await updateOrderProductionStatus({params:{orderId},body:{newStatus:'ready'},user:{email:'operator@example.invalid'}} as any,response as any);
assert.equal(response.statusCode,200);
assert.equal(response.body.notification.whatsappSent,true);
assert.equal(response.body.notification.emailSent,false);
assert.equal(response.body.notification.emailStatus,'Erro');
let saved=(await db.collection('orders').doc(orderId).get()).data();
assert.equal(saved.production.status,'ready'); assert.deepEqual(saved.payment,payment); assert.equal(saved.balanceDue,75);
assert.equal(waCalls,1); assert.equal(emailCalls,1);
assert.ok(waMessages[0].length < 300, 'aviso de etapa precisa ser curto mesmo com vários itens');
assert.doesNotMatch(waMessages[0], /CANAIS OFICIAIS|NÃO É SÓ ROUPA/);
assert.match(waMessages[0], /\/order\/TEST-PRODUCTION-NOTICES\?token=/);
const receivedMessage = renderStageTemplate(DEFAULT_STAGE_TEMPLATES.received, { id: orderId, customerName: 'Cliente', items: saved?.items });
assert.match(receivedMessage, /Item: 2x Camiseta Oversized \(\+2 no pedido\)/);
assert.doesNotMatch(receivedMessage, /Tam\.|Estampa:|\{\{resumo_itens\}\}/);
emailFails=false;
const retry=await dispatchStageNotification({orderId,newStageId:'ready'});
assert.equal(retry.emailSent,true); assert.equal(retry.whatsappSent,true);
assert.equal(waCalls,1,'successful WhatsApp must not be sent again'); assert.equal(emailCalls,2);
await dispatchStageNotification({orderId,newStageId:'ready'});
assert.equal(waCalls,1);assert.equal(emailCalls,2,'successful email must not be sent again');
response=res();
await updateOrderProductionStatus({params:{orderId},body:{newStatus:'ready'}} as any,response as any);
assert.equal(waCalls,1);assert.equal(emailCalls,2,'same-stage update must not notify again');
response=res();
await updateOrderShippingStatus({params:{orderId},body:{newStatus:'shipped',trackingCode:'AB123456789BR',carrier:'Correios'},user:{email:'operator@example.invalid'}} as any,response as any);
assert.equal(response.statusCode,200,JSON.stringify(response.body));
saved=(await db.collection('orders').doc(orderId).get()).data();assert.deepEqual(saved.payment,payment);assert.equal(saved.balanceDue,75);
await db.collection('orders').doc('TEST-NO-CONTACT').set({production:{status:'ready'},payment:{status:'pending'}});
const missing=await dispatchStageNotification({orderId:'TEST-NO-CONTACT',newStageId:'ready'});
assert.equal(missing.whatsappStatus,'Sem Telefone'); assert.equal(missing.emailStatus,'Sem E-mail');
assert.equal(missing.whatsappSent,false);assert.equal(missing.emailSent,false);
await db.collection('orders').doc('TEST-LEASE').set({customerPhone:'47999999999',customerEmail:'client@example.invalid',sentStageNotifications:{ready:{leaseUntil:Date.now()+60000}}});
const before=[waCalls,emailCalls];
const busy=await dispatchStageNotification({orderId:'TEST-LEASE',newStageId:'ready'});
assert.equal(busy.skipped,true);assert.deepEqual([waCalls,emailCalls],before);
const { sendWhatsAppMessage } = await import('../server/services/automation.service');
for (const [kind, payload] of [
  ['payment_approved', { id: '42', customerName: 'Ana' }],
  ['manual_order_pending', { id: '42', customerName: 'Ana' }],
  ['order_shipped', { id: '42', customerName: 'Ana', trackingCode: 'BR123' }],
] as const) {
  assert.equal(await sendWhatsAppMessage('47999999999', kind, payload), true);
  assert.ok(waMessages.at(-1)!.length < 180, `${kind} deve ser curto`);
  assert.match(waMessages.at(-1)!, /#42/);
}
assert.match(waMessages.at(-1)!, /BR123/);
assert.doesNotMatch(DEFAULT_STAGE_TEMPLATES.separacao_corte,/pagamento foi confirmado/i);
assert.match(DEFAULT_STAGE_TEMPLATES.payment_approved,/Pagamento confirmado/);
assert.match(DEFAULT_STAGE_TEMPLATES.ready,/entrega ou retirada/);
assert.doesNotMatch(renderStageTemplate(DEFAULT_STAGE_TEMPLATES.ready,{id:'42',customerName:'Maria',items:[]}), /\{\{resumo_itens\}\}/);
delete process.env.EVOLUTION_API_KEY; delete process.env.RESEND_API_KEY;
await db.collection('orders').doc('TEST-NO-PROVIDER').set({customerPhone:'47999999999',customerEmail:'client@example.invalid'});
const unconfigured=await dispatchStageNotification({orderId:'TEST-NO-PROVIDER',newStageId:'ready'});
assert.equal(unconfigured.whatsappStatus,'Não configurado');assert.equal(unconfigured.emailStatus,'Não configurado');
const { resolveSavedStageTemplates } = await import('../shared/productionNotificationDefaults');
const oldFooter = '━━━━━━━━━━━━━━━━━\n🌐 www.fpacstore.com.br\n📸 @f_pac_store\n💬 WhatsApp: (47) 99746-5602\n\n🛡️ Mensagem automática de acompanhamento do pedido.';
const legacy = `F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE!\n━━━━━━━━━━━━━━━━━\n\nOlá, *{{nome_cliente}}*! 👋\n\n✂️ *SEPARAÇÃO E PREPARAÇÃO*\n\nNossa equipe está separando e preparando os itens do seu pedido.\n\nPedido: *#{{numero_pedido}}*\nItens do pedido:\n{{produto}}\n\n👉 Acompanhe o pedido: {{link_acompanhamento}}\n\n${oldFooter}`;
assert.equal(resolveSavedStageTemplates({separacao_corte:legacy}).separacao_corte,DEFAULT_STAGE_TEMPLATES.separacao_corte);
const revised = legacy.replace('Nossa equipe está separando e preparando os itens do seu pedido.', 'Nossa equipe está separando e preparando os itens do seu pedido. O prazo de entrega ou retirada segue o combinado com nossa equipe.').replace('🛡️ Mensagem automática de acompanhamento do pedido.', 'Acompanhamento do pedido • F PAC STORE');
assert.equal(resolveSavedStageTemplates({separacao_corte:revised}).separacao_corte,DEFAULT_STAGE_TEMPLATES.separacao_corte);
assert.equal(resolveSavedStageTemplates({ready:'Texto da loja'}).ready,'Texto da loja');
console.log('PASS production and shipping preserve debt; notifications dispatch after commit; provider errors, independent retries, duplicate/lease protection, missing contacts and truthful templates.');
