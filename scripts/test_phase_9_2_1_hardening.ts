import admin from 'firebase-admin';
import { getDb } from '../server/firebase.js';
import { deriveLedgerEventId } from '../server/services/financialLedger.service.js';
import { getOrderPaidAmount, getOrderPendingAmount, getOrderRefundedAmount, getOrderPaymentStatus, getOrderTotal } from '../server/utils/orderFinancial.js';
import { PaymentStatus } from '../server/types/order.types.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

async function runHardeningTests() {
  console.log("=================================================");
  console.log("🧪 FASE 9.2.1 — SUÍTE DE TESTES DE HARDENING FINANCEIRO");
  console.log("=================================================");

  const db = getDb();
  const results: TestResult[] = [];

  // Helper para simular a lógica do controlador de pagamento manual transacional
  async function executeManualPaymentTransaction(orderId: string, amount: number, method: string, reason: string, idempotencyKey: string, user: any = { email: 'admin@fpacstore.com.br', uid: 'admin_test' }) {
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      const err: any = new Error('A chave de idempotência (idempotencyKey) é obrigatória para registrar pagamentos.');
      err.code = 'IDEMPOTENCY_KEY_REQUIRED';
      err.status = 400;
      throw err;
    }

    const parsedAmount = Number(amount);
    if (!orderId || isNaN(parsedAmount) || parsedAmount <= 0) {
      const err: any = new Error('Valor de pagamento deve ser um número positivo maior que zero.');
      err.code = 'INVALID_PAYMENT_AMOUNT';
      err.status = 400;
      throw err;
    }

    const eventId = deriveLedgerEventId(idempotencyKey.trim());
    const eventRef = db.collection('financial_events').doc(eventId);
    const orderRef = db.collection('orders').doc(orderId);

    return await db.runTransaction(async (transaction) => {
      const eventSnap = await transaction.get(eventRef);
      if (eventSnap.exists) {
        const existingEvent = eventSnap.data() as any;
        const orderSnap = await transaction.get(orderRef);
        const orderData = orderSnap.exists ? orderSnap.data()! : {};
        return {
          idempotentReplay: true,
          success: true,
          orderId,
          paymentStatus: existingEvent.newStatus || getOrderPaymentStatus(orderData),
          paidAmount: existingEvent.newPaidAmount ?? getOrderPaidAmount(orderData),
          pendingAmount: existingEvent.newPendingAmount ?? getOrderPendingAmount(orderData),
          amountPaid: existingEvent.newPaidAmount ?? getOrderPaidAmount(orderData),
          balanceDue: existingEvent.newPendingAmount ?? getOrderPendingAmount(orderData),
          eventId: eventRef.id
        };
      }

      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        const notFoundErr: any = new Error('Pedido não encontrado.');
        notFoundErr.code = 'ORDER_NOT_FOUND';
        notFoundErr.status = 404;
        throw notFoundErr;
      }

      const orderData = orderSnap.data()!;
      const currentPaid = getOrderPaidAmount(orderData);
      const currentPending = getOrderPendingAmount(orderData);
      const currentStatus = getOrderPaymentStatus(orderData);

      if (parsedAmount > currentPending + 0.001) {
        const excessErr: any = new Error(`Valor informado (R$ ${parsedAmount.toFixed(2)}) é superior ao saldo devedor restante (R$ ${currentPending.toFixed(2)}).`);
        excessErr.code = 'EXCESS_PAYMENT_AMOUNT';
        excessErr.status = 400;
        throw excessErr;
      }

      const newPaidAmount = currentPaid + parsedAmount;
      const newPendingAmount = Math.max(0, currentPending - parsedAmount);
      const newStatus: PaymentStatus = newPendingAmount === 0 ? 'approved' : 'partially_paid';

      const timestamp = new Date().toISOString();
      const paymentMethodUsed = method ? String(method).trim().toUpperCase() : 'MANUAL';
      const effectiveReason = reason ? String(reason).trim() : `Pagamento manual de R$ ${parsedAmount.toFixed(2)} via ${paymentMethodUsed}`;

      const updatePayload: any = {
        'payment.paidAmount': newPaidAmount,
        'payment.pendingAmount': newPendingAmount,
        'payment.status': newStatus,
        'payment.method': paymentMethodUsed,
        amountPaid: newPaidAmount,
        balanceDue: newPendingAmount,
        paymentStatus: newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (newStatus === 'approved') {
        updatePayload['payment.paidAt'] = timestamp;
        updatePayload.status = 'Pagamento Aprovado';
        updatePayload.status_pedido = 'pago';
      }

      transaction.update(orderRef, updatePayload);

      const eventData = {
        id: eventRef.id,
        orderId,
        type: newStatus === 'approved' ? 'payment_approved' : 'partial_payment',
        amount: parsedAmount,
        previousStatus: currentStatus,
        newStatus,
        previousPaidAmount: currentPaid,
        newPaidAmount,
        previousPendingAmount: currentPending,
        newPendingAmount,
        previousRefundedAmount: getOrderRefundedAmount(orderData),
        newRefundedAmount: getOrderRefundedAmount(orderData),
        paymentMethod: paymentMethodUsed,
        provider: 'manual',
        actorId: user?.uid,
        actorEmail: user?.email,
        reason: effectiveReason,
        idempotencyKey: idempotencyKey.trim(),
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      transaction.set(eventRef, eventData);

      return {
        idempotentReplay: false,
        success: true,
        orderId,
        paymentStatus: newStatus,
        paidAmount: newPaidAmount,
        pendingAmount: newPendingAmount,
        amountPaid: newPaidAmount,
        balanceDue: newPendingAmount,
        eventId: eventRef.id
      };
    });
  }

  // Helper para simular a lógica do controlador de refund transacional
  async function executeRefundTransaction(orderId: string, refundAmount: number, reason: string, idempotencyKey: string, user: any = { email: 'admin@fpacstore.com.br', uid: 'admin_test' }) {
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      const err: any = new Error('A chave de idempotência (idempotencyKey) é obrigatória para processar estornos.');
      err.code = 'IDEMPOTENCY_KEY_REQUIRED';
      err.status = 400;
      throw err;
    }

    const parsedRefundAmount = Number(refundAmount);
    if (!orderId || isNaN(parsedRefundAmount) || parsedRefundAmount <= 0) {
      const err: any = new Error('Valor de reembolso deve ser um número positivo maior que zero.');
      err.code = 'INVALID_REFUND_AMOUNT';
      err.status = 400;
      throw err;
    }

    const eventId = deriveLedgerEventId(idempotencyKey.trim());
    const eventRef = db.collection('financial_events').doc(eventId);
    const orderRef = db.collection('orders').doc(orderId);

    return await db.runTransaction(async (transaction) => {
      const eventSnap = await transaction.get(eventRef);
      if (eventSnap.exists) {
        const existingEvent = eventSnap.data() as any;
        const orderSnap = await transaction.get(orderRef);
        const orderData = orderSnap.exists ? orderSnap.data()! : {};
        return {
          idempotentReplay: true,
          success: true,
          orderId,
          paymentStatus: existingEvent.newStatus || getOrderPaymentStatus(orderData),
          refundedAmount: existingEvent.newRefundedAmount ?? getOrderRefundedAmount(orderData),
          eventId: eventRef.id
        };
      }

      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        const notFoundErr: any = new Error('Pedido não encontrado.');
        notFoundErr.code = 'ORDER_NOT_FOUND';
        notFoundErr.status = 404;
        throw notFoundErr;
      }

      const orderData = orderSnap.data()!;
      const totalPaid = getOrderPaidAmount(orderData);
      const currentRefunded = getOrderRefundedAmount(orderData);
      const availableToRefund = Math.max(0, totalPaid - currentRefunded);
      const currentStatus = getOrderPaymentStatus(orderData);

      if (availableToRefund <= 0) {
        const cannotRefundErr: any = new Error('Este pedido não possui valores disponíveis para estorno/reembolso.');
        cannotRefundErr.code = 'CANNOT_REFUND';
        cannotRefundErr.status = 400;
        throw cannotRefundErr;
      }

      if (parsedRefundAmount > availableToRefund + 0.001) {
        const exceedErr: any = new Error(`Valor do estorno (R$ ${parsedRefundAmount.toFixed(2)}) é maior que o saldo disponível para reembolso (R$ ${availableToRefund.toFixed(2)}).`);
        exceedErr.code = 'REFUND_EXCEEDS_PAID';
        exceedErr.status = 400;
        throw exceedErr;
      }

      const newRefundedAmount = currentRefunded + parsedRefundAmount;
      const isTotalRefund = newRefundedAmount >= totalPaid - 0.001;
      const newStatus: PaymentStatus = isTotalRefund ? 'refunded' : 'partially_refunded';

      const timestamp = new Date().toISOString();
      const effectiveReason = reason ? String(reason).trim() : `Estorno/reembolso de R$ ${parsedRefundAmount.toFixed(2)}`;

      const updatePayload: any = {
        'payment.refundedAmount': newRefundedAmount,
        'payment.status': newStatus,
        refundedAmount: newRefundedAmount,
        paymentStatus: newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (newStatus === 'refunded') {
        updatePayload.status = 'Reembolsado';
      } else {
        updatePayload.status = 'Reembolsado Parcialmente';
      }

      transaction.update(orderRef, updatePayload);

      const eventData = {
        id: eventRef.id,
        orderId,
        type: isTotalRefund ? 'refund' : 'partial_refund',
        amount: parsedRefundAmount,
        previousStatus: currentStatus,
        newStatus,
        previousPaidAmount: totalPaid,
        newPaidAmount: totalPaid,
        previousPendingAmount: getOrderPendingAmount(orderData),
        newPendingAmount: getOrderPendingAmount(orderData),
        previousRefundedAmount: currentRefunded,
        newRefundedAmount,
        paymentMethod: orderData.payment?.method || 'MANUAL',
        provider: 'manual',
        actorId: user?.uid,
        actorEmail: user?.email,
        reason: effectiveReason,
        idempotencyKey: idempotencyKey.trim(),
        createdAt: timestamp,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      transaction.set(eventRef, eventData);

      return {
        idempotentReplay: false,
        success: true,
        orderId,
        paymentStatus: newStatus,
        refundedAmount: newRefundedAmount,
        eventId: eventRef.id
      };
    });
  }

  // --- TESTE 1: IDEMPOTENCY_KEY_REQUIRED ---
  try {
    console.log("\n[TEST 1] Validação de Idempotency Key Obrigatória...");
    const dummyOrderId = `test_order_${Date.now()}`;
    await executeManualPaymentTransaction(dummyOrderId, 50, 'PIX', 'Test', '');
    results.push({ name: 'TEST 1: Idempotency Key Obrigatória', passed: false, error: 'Deveria ter falhado por falta de idempotencyKey' });
  } catch (err: any) {
    const passed = err.code === 'IDEMPOTENCY_KEY_REQUIRED';
    results.push({ name: 'TEST 1: Idempotency Key Obrigatória', passed, error: passed ? undefined : err.message });
    console.log(`  -> ${passed ? '✅ PASSOU' : '❌ FALHOU'}: ${err.message}`);
  }

  // Criar Pedido de Teste
  const testOrderId = `test_hardening_${Date.now()}`;
  const testOrderRef = db.collection('orders').doc(testOrderId);
  await testOrderRef.set({
    customerName: 'Cliente Teste Hardening',
    customerEmail: 'cliente.teste@example.com',
    total: 300.00,
    amountPaid: 0,
    balanceDue: 300.00,
    paymentStatus: 'pending',
    productionStatus: 'waiting',
    items: [{ id: 'item1', name: 'Camisa Teste', price: 300, quantity: 1 }],
    payment: {
      total: 300.00,
      paidAmount: 0,
      pendingAmount: 300.00,
      refundedAmount: 0,
      status: 'pending',
      method: 'PIX'
    },
    createdAt: new Date().toISOString()
  });

  // --- TESTE 2: Pagamento Parcial Normal ---
  try {
    console.log("\n[TEST 2] Pagamento Parcial Normal (R$ 100 de R$ 300)...");
    const key1 = `key_pay_partial_${testOrderId}`;
    const res1 = await executeManualPaymentTransaction(testOrderId, 100, 'PIX', 'Entrada 100', key1);
    const snap1 = await testOrderRef.get();
    const data1 = snap1.data()!;

    const passed = res1.success &&
      !res1.idempotentReplay &&
      res1.paidAmount === 100 &&
      res1.pendingAmount === 200 &&
      res1.paymentStatus === 'partially_paid' &&
      data1.amountPaid === 100 &&
      data1.balanceDue === 200 &&
      data1.paymentStatus === 'partially_paid';

    results.push({ name: 'TEST 2: Pagamento Parcial Normal', passed, details: res1 });
    console.log(`  -> ${passed ? '✅ PASSOU' : '❌ FALHOU'} (Pago: R$ ${data1.amountPaid}, Devedor: R$ ${data1.balanceDue}, Status: ${data1.paymentStatus})`);
  } catch (err: any) {
    results.push({ name: 'TEST 2: Pagamento Parcial Normal', passed: false, error: err.message });
    console.log(`  -> ❌ FALHOU: ${err.message}`);
  }

  // --- TESTE 3: Duplicidade / Retry com mesma chave (Idempotência) ---
  try {
    console.log("\n[TEST 3] Duplicidade com a Mesma Chave (Replay Idempotente)...");
    const key1 = `key_pay_partial_${testOrderId}`;
    const resReplay = await executeManualPaymentTransaction(testOrderId, 100, 'PIX', 'Entrada 100 (Retry)', key1);
    const snapReplay = await testOrderRef.get();
    const dataReplay = snapReplay.data()!;

    const passed = resReplay.success &&
      resReplay.idempotentReplay === true &&
      dataReplay.amountPaid === 100 && // Não pode ter virado 200!
      dataReplay.balanceDue === 200;

    results.push({ name: 'TEST 3: Idempotência de Pagamento', passed, details: resReplay });
    console.log(`  -> ${passed ? '✅ PASSOU' : '❌ FALHOU'} (Replay detectado: ${resReplay.idempotentReplay}, Saldo mantido em R$ ${dataReplay.amountPaid})`);
  } catch (err: any) {
    results.push({ name: 'TEST 3: Idempotência de Pagamento', passed: false, error: err.message });
    console.log(`  -> ❌ FALHOU: ${err.message}`);
  }

  // --- TESTE 4: Concorrência (10 requisições simultâneas com a mesma chave) ---
  try {
    console.log("\n[TEST 4] Concorrência de 10 Requisições Simultâneas com Mesma Chave...");
    const concKey = `key_pay_conc_${testOrderId}`;
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(executeManualPaymentTransaction(testOrderId, 50, 'PIX', `Concorrência #${i}`, concKey));
    }

    const concurrentResults = await Promise.all(promises);
    const snapConc = await testOrderRef.get();
    const dataConc = snapConc.data()!;

    // Exatamente 1 deve ser idempotentReplay: false e 9 devem ser idempotentReplay: true
    const executedCount = concurrentResults.filter(r => !r.idempotentReplay).length;
    const replayCount = concurrentResults.filter(r => r.idempotentReplay).length;

    const passed = executedCount === 1 &&
      replayCount === 9 &&
      dataConc.amountPaid === 150 && // 100 anterior + 50 deste pagamento único
      dataConc.balanceDue === 150;

    results.push({ name: 'TEST 4: Concorrência de Pagamento (10 reqs simultâneas)', passed, details: { executedCount, replayCount, amountPaid: dataConc.amountPaid } });
    console.log(`  -> ${passed ? '✅ PASSOU' : '❌ FALHOU'} (Execuções novas: ${executedCount}, Replays: ${replayCount}, Saldo Pago: R$ ${dataConc.amountPaid})`);
  } catch (err: any) {
    results.push({ name: 'TEST 4: Concorrência de Pagamento', passed: false, error: err.message });
    console.log(`  -> ❌ FALHOU: ${err.message}`);
  }

  // --- TESTE 5: Tentativa de Pagamento Acima do Saldo Devedor ---
  try {
    console.log("\n[TEST 5] Rejeição de Pagamento Acima do Saldo Devedor (Saldo: 150, Tentativa: 200)...");
    const excessKey = `key_pay_excess_${testOrderId}`;
    await executeManualPaymentTransaction(testOrderId, 200, 'PIX', 'Excesso', excessKey);
    results.push({ name: 'TEST 5: Rejeição de Pagamento Excessivo', passed: false, error: 'Deveria ter rejeitado com EXCESS_PAYMENT_AMOUNT' });
  } catch (err: any) {
    const passed = err.code === 'EXCESS_PAYMENT_AMOUNT';
    const snapExcess = await testOrderRef.get();
    const dataExcess = snapExcess.data()!;
    const stateUntouched = dataExcess.amountPaid === 150 && dataExcess.balanceDue === 150;

    results.push({ name: 'TEST 5: Rejeição de Pagamento Excessivo', passed: passed && stateUntouched, error: passed ? undefined : err.message });
    console.log(`  -> ${passed && stateUntouched ? '✅ PASSOU' : '❌ FALHOU'} (${err.message})`);
  }

  // --- TESTE 6: Quitação Total (Saldo Devedor Restante R$ 150) ---
  try {
    console.log("\n[TEST 6] Quitação Total do Pedido (R$ 150 restantes)...");
    const payFullKey = `key_pay_full_${testOrderId}`;
    const resFull = await executeManualPaymentTransaction(testOrderId, 150, 'PIX', 'Quitação total', payFullKey);
    const snapFull = await testOrderRef.get();
    const dataFull = snapFull.data()!;

    const passed = resFull.success &&
      dataFull.amountPaid === 300 &&
      dataFull.balanceDue === 0 &&
      dataFull.paymentStatus === 'approved' &&
      dataFull.status_pedido === 'pago';

    results.push({ name: 'TEST 6: Quitação Total de Pedido', passed, details: resFull });
    console.log(`  -> ${passed ? '✅ PASSOU' : '❌ FALHOU'} (Pago: R$ ${dataFull.amountPaid}, Devedor: R$ ${dataFull.balanceDue}, Status: ${dataFull.paymentStatus})`);
  } catch (err: any) {
    results.push({ name: 'TEST 6: Quitação Total de Pedido', passed: false, error: err.message });
    console.log(`  -> ❌ FALHOU: ${err.message}`);
  }

  // --- TESTE 7: Reembolso Parcial Normal (R$ 50 de R$ 300) ---
  try {
    console.log("\n[TEST 7] Reembolso Parcial Normal (R$ 50 de R$ 300)...");
    const refKey1 = `key_ref_partial_${testOrderId}`;
    const resRef1 = await executeRefundTransaction(testOrderId, 50, 'Estorno parcial', refKey1);
    const snapRef1 = await testOrderRef.get();
    const dataRef1 = snapRef1.data()!;

    const passed = resRef1.success &&
      !resRef1.idempotentReplay &&
      resRef1.refundedAmount === 50 &&
      resRef1.paymentStatus === 'partially_refunded' &&
      dataRef1.refundedAmount === 50 &&
      dataRef1.paymentStatus === 'partially_refunded';

    results.push({ name: 'TEST 7: Reembolso Parcial Normal', passed, details: resRef1 });
    console.log(`  -> ${passed ? '✅ PASSOU' : '❌ FALHOU'} (Reembolsado: R$ ${dataRef1.refundedAmount}, Status: ${dataRef1.paymentStatus})`);
  } catch (err: any) {
    results.push({ name: 'TEST 7: Reembolso Parcial Normal', passed: false, error: err.message });
    console.log(`  -> ❌ FALHOU: ${err.message}`);
  }

  // --- TESTE 8: Duplicidade de Reembolso com a Mesma Chave ---
  try {
    console.log("\n[TEST 8] Duplicidade de Reembolso com a Mesma Chave (Replay Idempotente)...");
    const refKey1 = `key_ref_partial_${testOrderId}`;
    const resRefReplay = await executeRefundTransaction(testOrderId, 50, 'Estorno parcial (Retry)', refKey1);
    const snapRefReplay = await testOrderRef.get();
    const dataRefReplay = snapRefReplay.data()!;

    const passed = resRefReplay.success &&
      resRefReplay.idempotentReplay === true &&
      dataRefReplay.refundedAmount === 50; // Não pode ter virado 100!

    results.push({ name: 'TEST 8: Idempotência de Reembolso', passed, details: resRefReplay });
    console.log(`  -> ${passed ? '✅ PASSOU' : '❌ FALHOU'} (Replay detectado: ${resRefReplay.idempotentReplay}, Estorno mantido em R$ ${dataRefReplay.refundedAmount})`);
  } catch (err: any) {
    results.push({ name: 'TEST 8: Idempotência de Reembolso', passed: false, error: err.message });
    console.log(`  -> ❌ FALHOU: ${err.message}`);
  }

  // --- TESTE 9: Rejeição de Reembolso Acima do Total Pago Disponível ---
  try {
    console.log("\n[TEST 9] Rejeição de Reembolso Excessivo (Disponível: R$ 250, Tentativa: R$ 300)...");
    const refExcessKey = `key_ref_excess_${testOrderId}`;
    await executeRefundTransaction(testOrderId, 300, 'Estorno excessivo', refExcessKey);
    results.push({ name: 'TEST 9: Rejeição de Reembolso Excessivo', passed: false, error: 'Deveria ter rejeitado com REFUND_EXCEEDS_PAID' });
  } catch (err: any) {
    const passed = err.code === 'REFUND_EXCEEDS_PAID';
    const snapRefExcess = await testOrderRef.get();
    const dataRefExcess = snapRefExcess.data()!;
    const stateUntouched = dataRefExcess.refundedAmount === 50;

    results.push({ name: 'TEST 9: Rejeição de Reembolso Excessivo', passed: passed && stateUntouched, error: passed ? undefined : err.message });
    console.log(`  -> ${passed && stateUntouched ? '✅ PASSOU' : '❌ FALHOU'} (${err.message})`);
  }

  // --- TESTE 10: Reembolso Total Restante (R$ 250) ---
  try {
    console.log("\n[TEST 10] Reembolso Total Restante (R$ 250)...");
    const refTotalKey = `key_ref_total_${testOrderId}`;
    const resRefTotal = await executeRefundTransaction(testOrderId, 250, 'Estorno total restante', refTotalKey);
    const snapRefTotal = await testOrderRef.get();
    const dataRefTotal = snapRefTotal.data()!;

    const passed = resRefTotal.success &&
      dataRefTotal.refundedAmount === 300 &&
      dataRefTotal.paymentStatus === 'refunded' &&
      dataRefTotal.status === 'Reembolsado';

    results.push({ name: 'TEST 10: Reembolso Total Restante', passed, details: resRefTotal });
    console.log(`  -> ${passed ? '✅ PASSOU' : '❌ FALHOU'} (Reembolsado: R$ ${dataRefTotal.refundedAmount}, Status: ${dataRefTotal.paymentStatus})`);
  } catch (err: any) {
    results.push({ name: 'TEST 10: Reembolso Total Restante', passed: false, error: err.message });
    console.log(`  -> ❌ FALHOU: ${err.message}`);
  }

  // --- TESTE 11: Validação de Eventos Determinísticos no Ledger ---
  try {
    console.log("\n[TEST 11] Validação de Documentos Determinísticos no Ledger...");
    const expectedKeys = [
      `key_pay_partial_${testOrderId}`,
      `key_pay_conc_${testOrderId}`,
      `key_pay_full_${testOrderId}`,
      `key_ref_partial_${testOrderId}`,
      `key_ref_total_${testOrderId}`
    ];

    let allDocsValid = true;
    for (const k of expectedKeys) {
      const docId = deriveLedgerEventId(k);
      const docSnap = await db.collection('financial_events').doc(docId).get();
      if (!docSnap.exists) {
        console.log(`  ❌ Documento ${docId} derivado de ${k} não encontrado.`);
        allDocsValid = false;
      }
    }

    results.push({ name: 'TEST 11: Documentos Determinísticos no Ledger', passed: allDocsValid });
    console.log(`  -> ${allDocsValid ? '✅ PASSOU' : '❌ FALHOU'}: Todos os ${expectedKeys.length} IDs determinísticos foram encontrados com hash SHA-256 no ledger.`);
  } catch (err: any) {
    results.push({ name: 'TEST 11: Documentos Determinísticos no Ledger', passed: false, error: err.message });
    console.log(`  -> ❌ FALHOU: ${err.message}`);
  }

  // Limpeza de teste
  try {
    await testOrderRef.delete();
  } catch {}

  console.log("\n=================================================");
  console.log("📊 RESUMO DOS TESTES DA FASE 9.2.1");
  console.log("=================================================");
  const allPassed = results.every(r => r.passed);
  results.forEach(r => {
    console.log(`${r.passed ? '✅ PASS' : '❌ FAIL'}: ${r.name}`);
    if (r.error) console.log(`   Erro: ${r.error}`);
  });
  console.log("=================================================");
  console.log(`STATUS FINAL: ${allPassed ? '🎉 TODOS OS TESTES PASSARAM COM SUCESSO!' : '❌ HOUVE FALHAS NOS TESTES'}`);
  console.log("=================================================");

  if (!allPassed) {
    process.exit(1);
  }
}

runHardeningTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erro fatal no executor de testes:", err);
    process.exit(1);
  });
