from pathlib import Path

PATH = Path('src/pages/AdminOrders.tsx')
source = PATH.read_text(encoding='utf-8')


def replace_exact(old: str, new: str, label: str) -> None:
    global source
    if old in source:
        source = source.replace(old, new, 1)
        print(f'patched: {label}')
        return
    if new in source:
        print(f'already patched: {label}')
        return
    raise SystemExit(f'expected pattern not found: {label}')


replace_exact(
    "import { PRODUCTION_STAGES, getStageFromStatus } from '../constants/productionStages';",
    "import { PRODUCTION_STAGES, getStageFromStatus } from '../constants/productionStages';\nimport {\n  getAdminProductionStage,\n  getAdminShippingStatus,\n  isAdminOrderCancelled,\n  isAdminOrderDelivered,\n  isAdminOrderInProduction,\n  isAdminOrderPaid,\n  isAdminOrderShipped,\n  isAdminPaymentPending,\n  matchesAdminStatusFilter\n} from '../utils/adminOrderStatus';",
    'admin status imports'
)

replace_exact(
    "  status: 'received' | 'payment_pending' | 'payment_approved' | 'Aguardando Pagamento PIX' | 'Pagamento Aprovado' | 'Pagamento Não Realizado' | 'separacao' | 'embalagem' | 'shipped' | 'delivered' | 'cancelled';\n  productionStatus?: string;\n  paymentStatus?: string;",
    "  status: string; // legado: fallback de compatibilidade; não usar como domínio único\n  productionStatus?: string;\n  paymentStatus?: string;\n  shippingStatus?: string;",
    'Order status typing'
)

replace_exact(
    "    const activeOrders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'Pagamento Não Realizado');\n    const paymentConfirmed = orders.filter(o => ['Pagamento Aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered'].includes(o.status));\n    \n    const pendingRevenue = roundMoney(activeOrders.filter(o => !['Pagamento Aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered', 'cancelled'].includes(o.status)).reduce((acc, o) => acc + (o.total || 0), 0));",
    "    const activeOrders = orders.filter(o => !isAdminOrderCancelled(o));\n    const paymentConfirmed = orders.filter(o => isAdminOrderPaid(o));\n    \n    const pendingRevenue = roundMoney(activeOrders.reduce((acc, o) => acc + getOrderPendingAmount(o), 0));",
    'financial canonical status filters'
)

replace_exact(
    "      filtered = filtered.filter(o => ['delivered', 'shipped', 'payment_approved', 'Pagamento Aprovado', 'separacao', 'embalagem', 'Pago'].includes(o.status));\n    } else if (repStatus === 'pending') {\n      filtered = filtered.filter(o => ['received', 'payment_pending', 'Aguardando Pagamento PIX', 'Aguardando Pagamento'].includes(o.status));\n    } else if (repStatus === 'cancelled') {\n      filtered = filtered.filter(o => ['cancelled', 'Cancelado', 'payment_failed', 'Pagamento Não Realizado'].includes(o.status));",
    "      filtered = filtered.filter(o => isAdminOrderPaid(o));\n    } else if (repStatus === 'pending') {\n      filtered = filtered.filter(o => isAdminPaymentPending(o));\n    } else if (repStatus === 'cancelled') {\n      filtered = filtered.filter(o => isAdminOrderCancelled(o));",
    'report status filters'
)

replace_exact(
    "    const paidFilteredOrders = filtered.filter(o => ['delivered', 'shipped', 'payment_approved', 'Pagamento Aprovado', 'separacao', 'embalagem', 'Pago'].includes(o.status));",
    "    const paidFilteredOrders = filtered.filter(o => isAdminOrderPaid(o));",
    'paid filtered orders'
)

replace_exact(
    "      const isPaid = ['delivered', 'shipped', 'payment_approved', 'Pagamento Aprovado', 'separacao', 'embalagem', 'Pago'].includes(o.status);",
    "      const isPaid = isAdminOrderPaid(o);",
    'report paid predicate'
)

replace_exact(
    "    const stockMoveOrders = filtered.filter(o => o.status !== 'cancelled' && o.status !== 'Pagamento Não Realizado' && o.stockControl !== 'no_move');\n    const stockNoMoveOrders = filtered.filter(o => o.status !== 'cancelled' && o.status !== 'Pagamento Não Realizado' && o.stockControl === 'no_move');",
    "    const stockMoveOrders = filtered.filter(o => !isAdminOrderCancelled(o) && o.stockControl !== 'no_move');\n    const stockNoMoveOrders = filtered.filter(o => !isAdminOrderCancelled(o) && o.stockControl === 'no_move');",
    'stock report active orders'
)

replace_exact(
    "        const isAlreadyCancelled = ['cancelled', 'canceled', 'Pagamento Não Realizado'].includes(orderData.status);",
    "        const isAlreadyCancelled = isAdminOrderCancelled(orderData);",
    'delete cancellation check'
)

replace_exact(
    "      // Map manualOrderStatus friendly values\n      let firestoreStatus: string = 'Aguardando Pagamento PIX';\n      if (manualOrderStatus === 'Pago') firestoreStatus = 'Pagamento Aprovado';\n      else if (manualOrderStatus === 'Em produção') firestoreStatus = 'separacao';\n      else if (manualOrderStatus === 'Enviado') firestoreStatus = 'shipped';\n      else if (manualOrderStatus === 'Entregue') firestoreStatus = 'delivered';\n      else if (manualOrderStatus === 'Cancelado') firestoreStatus = 'cancelled';\n\n      const isInitialPaid = ['Pagamento Aprovado', 'separacao', 'embalagem', 'shipped', 'delivered'].includes(firestoreStatus);",
    "      // Mantém `status` legado para compatibilidade, mas grava os domínios canônicos separados.\n      let firestoreStatus: string = 'Aguardando Pagamento PIX';\n      let canonicalPaymentStatus: string = 'pending';\n      let canonicalProductionStatus: string = 'waiting';\n      let canonicalShippingStatus: string = 'pending';\n      if (manualOrderStatus === 'Pago') {\n        firestoreStatus = 'Pagamento Aprovado';\n        canonicalPaymentStatus = 'approved';\n      } else if (manualOrderStatus === 'Em produção') {\n        firestoreStatus = 'separacao';\n        canonicalPaymentStatus = 'approved';\n        canonicalProductionStatus = 'separacao_corte';\n      } else if (manualOrderStatus === 'Enviado') {\n        firestoreStatus = 'shipped';\n        canonicalPaymentStatus = 'approved';\n        canonicalProductionStatus = 'completed';\n        canonicalShippingStatus = 'shipped';\n      } else if (manualOrderStatus === 'Entregue') {\n        firestoreStatus = 'delivered';\n        canonicalPaymentStatus = 'approved';\n        canonicalProductionStatus = 'completed';\n        canonicalShippingStatus = 'delivered';\n      } else if (manualOrderStatus === 'Cancelado') {\n        firestoreStatus = 'cancelled';\n        canonicalPaymentStatus = 'cancelled';\n        canonicalShippingStatus = 'cancelled';\n      }\n\n      const isInitialPaid = canonicalPaymentStatus === 'approved';",
    'manual canonical status mapping'
)

replace_exact(
    "        paymentStatus: isInitialPaid ? 'approved' : 'pending',\n        paymentMethod: paymentMethodForm,\n        status: firestoreStatus,",
    "        paymentStatus: canonicalPaymentStatus,\n        productionStatus: canonicalProductionStatus,\n        shippingStatus: canonicalShippingStatus,\n        paymentMethod: paymentMethodForm,\n        status: firestoreStatus,",
    'manual payload canonical fields'
)

replace_exact(
    "        if (firestoreStatus === 'Aguardando Pagamento PIX' || manualOrderStatus === 'Aguardando Pagamento') {",
    "        if (canonicalPaymentStatus === 'pending') {",
    'manual pending whatsapp'
)

replace_exact(
    "      if (firestoreStatus !== 'cancelled' && stockControl === 'move') {",
    "      if (canonicalPaymentStatus !== 'cancelled' && stockControl === 'move') {",
    'manual stock cancellation'
)

replace_exact(
    "      const isPaidStatus = ['Pagamento Aprovado', 'separacao', 'embalagem', 'shipped', 'delivered'].includes(firestoreStatus);",
    "      const isPaidStatus = canonicalPaymentStatus === 'approved';",
    'manual payment ledger predicate'
)

replace_exact(
    "    const stageObj = getStageFromStatus(order.status);\n    const matchesStatus = statusFilter === 'all' || \n      order.status === statusFilter || \n      stageObj.id === statusFilter;",
    "    const matchesStatus = matchesAdminStatusFilter(order, statusFilter);",
    'central order status filter'
)

replace_exact(
    "                  <span className=\"text-xl font-black font-mono tracking-tight mt-0.5 block text-emerald-700\">{orders.filter(o => o.status === 'delivered' || o.status === 'shipped').length}</span>",
    "                  <span className=\"text-xl font-black font-mono tracking-tight mt-0.5 block text-emerald-700\">{orders.filter(o => isAdminOrderShipped(o) || isAdminOrderDelivered(o)).length}</span>",
    'shipping KPI'
)

replace_exact(
    "                  <span className=\"text-xl font-black font-mono tracking-tight mt-0.5 block text-amber-600\">{orders.filter(o => ['received', 'payment_pending', 'Aguardando Pagamento PIX'].includes(o.status)).length}</span>",
    "                  <span className=\"text-xl font-black font-mono tracking-tight mt-0.5 block text-amber-600\">{orders.filter(o => isAdminPaymentPending(o)).length}</span>",
    'pending KPI'
)

replace_exact(
    "                  <span className=\"text-xl font-black font-mono tracking-tight mt-0.5 block text-blue-700\">{orders.filter(o => ['payment_approved', 'Pagamento Aprovado', 'separacao', 'embalagem'].includes(o.status)).length}</span>",
    "                  <span className=\"text-xl font-black font-mono tracking-tight mt-0.5 block text-blue-700\">{orders.filter(o => isAdminOrderInProduction(o)).length}</span>",
    'production KPI'
)

replace_exact(
    "                    const count = orders.filter(o => getStageFromStatus(o.status).id === stage.id).length;",
    "                    const count = orders.filter(o => getAdminProductionStage(o).id === stage.id).length;",
    'production stage counts'
)

replace_exact(
    "          {orders.filter(o => ['received', 'payment_pending', 'Aguardando Pagamento PIX'].includes(o.status) && (Date.now() - (o.createdAt?.toMillis ? o.createdAt.toMillis() : new Date(o.createdAt).getTime())) > 3600000).length > 0 && (",
    "          {orders.filter(o => isAdminPaymentPending(o) && (Date.now() - (o.createdAt?.toMillis ? o.createdAt.toMillis() : new Date(o.createdAt).getTime())) > 3600000).length > 0 && (",
    'abandoned cart section predicate'
)

source = source.replace(
    "orders.filter(o => ['received', 'payment_pending', 'Aguardando Pagamento PIX'].includes(o.status) && (Date.now() - (o.createdAt?.toMillis ? o.createdAt.toMillis() : new Date(o.createdAt).getTime())) > 3600000)",
    "orders.filter(o => isAdminPaymentPending(o) && (Date.now() - (o.createdAt?.toMillis ? o.createdAt.toMillis() : new Date(o.createdAt).getTime())) > 3600000)"
)

replace_exact(
    "  const handleStatusUpdate = async (order: Order, status: string) => {\n    await updateStatus(order.id, status);\n    // WhatsApp manual\n    if (status === 'payment_approved' || status === 'Pagamento Aprovado') notifyCustomer(order, 'aprovado');\n    if (status === 'separacao') notifyCustomer(order, 'preparando');\n    if (status === 'shipped') notifyCustomer(order, 'enviado');\n  };",
    "  const handleStatusUpdate = async (order: Order, status: string) => {\n    if (['approved', 'payment_approved', 'Pagamento Aprovado'].includes(status)) {\n      await updateStatus(order.id, 'approved');\n      notifyCustomer(order, 'aprovado');\n      return;\n    }\n\n    if (status === 'cancelled') {\n      await updateStatus(order.id, 'cancelled');\n      return;\n    }\n\n    if (['shipped', 'delivered'].includes(status)) {\n      const response = await authenticatedFetch(`/api/admin/orders/${order.id}/shipping-status`, {\n        method: 'PUT',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ newStatus: status })\n      });\n      if (!response.ok) {\n        const err = await response.json().catch(() => ({}));\n        throw new Error(err.message || err.error || 'Erro ao atualizar expedição.');\n      }\n      triggerStatusEmail(order, status);\n      await addAuditLog('Alteração de Expedição', `Pedido #${order.id} atualizado para envio: ${status}`);\n      if (status === 'shipped') notifyCustomer(order, 'enviado');\n      toast.success(status === 'delivered' ? 'Pedido marcado como entregue.' : 'Pedido marcado como enviado.');\n      return;\n    }\n\n    const productionStage = getStageFromStatus(status).id;\n    await updateProductionStatus(order.id, productionStage, user?.email || 'Admin');\n    triggerStatusEmail(order, productionStage);\n    await addAuditLog('Alteração de Produção', `Pedido #${order.id} atualizado para produção: ${productionStage}`);\n    if (productionStage === 'separacao_corte') notifyCustomer(order, 'preparando');\n    toast.success(`Produção atualizada para: ${getStageFromStatus(productionStage).label}`);\n  };",
    'domain-aware status updater'
)

replace_exact(
    "                        {['payment_pending', 'Aguardando Pagamento PIX', 'received'].includes(order.status) && (",
    "                        {isAdminPaymentPending(order) && (",
    'quick approve predicate'
)

replace_exact(
    "                            onClick={() => handleStatusUpdate(order, 'Pagamento Aprovado')} ",
    "                            onClick={() => handleStatusUpdate(order, 'approved')} ",
    'quick approve canonical action'
)

replace_exact(
    "                        {['payment_approved', 'Pagamento Aprovado'].includes(order.status) && (",
    "                        {isAdminOrderPaid(order) && getAdminProductionStage(order).id === 'waiting' && getAdminShippingStatus(order) === 'pending' && (",
    'start production predicate'
)

replace_exact(
    "                            onClick={() => handleStatusUpdate(order, 'separacao')} ",
    "                            onClick={() => handleStatusUpdate(order, 'separacao_corte')} ",
    'start production canonical action'
)

replace_exact(
    "                        {order.status === 'separacao' && (",
    "                        {getAdminProductionStage(order).id === 'separacao_corte' && (",
    'separation predicate'
)

replace_exact(
    "                        {order.status === 'embalagem' && (() => {",
    "                        {getAdminProductionStage(order).id === 'embalagem' && (() => {",
    'packaging predicate'
)

replace_exact(
    "                        {order.status === 'shipped' && (",
    "                        {isAdminOrderShipped(order) && (",
    'shipped predicate'
)

replace_exact(
    "                        {order.status === 'delivered' && (",
    "                        {isAdminOrderDelivered(order) && (",
    'delivered predicate'
)

replace_exact(
    "                                triggerStatusEmail(order, order.status),",
    "                                triggerStatusEmail(order, order.shipping?.status || order.shippingStatus || order.production?.status || order.productionStatus || order.paymentStatus || order.status),",
    'resend contextual status email'
)

replace_exact(
    "                        {['payment_pending', 'Aguardando Pagamento PIX', 'received', 'pending'].includes(order.status) && order.gateway === 'mercadopago' && (",
    "                        {isAdminPaymentPending(order) && order.gateway === 'mercadopago' && (",
    'Mercado Pago sync predicate'
)

replace_exact(
    "                        {order.status !== 'cancelled' && order.status !== 'delivered' && (",
    "                        {!isAdminOrderCancelled(order) && !isAdminOrderDelivered(order) && (",
    'cancel action predicate'
)

PATH.write_text(source, encoding='utf-8')
print('AdminOrders status standardization patch complete')
