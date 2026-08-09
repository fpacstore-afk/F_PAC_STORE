export interface SheetSyncPayload {
  products?: Array<{
    slug?: string;
    stock?: number | string;
    price?: number | string;
    cost?: number | string;
  }>;
  orders?: Array<{
    id?: string;
    status?: string;
  }>;
  investments?: Array<{
    id?: string;
    date?: string;
    description?: string;
    category?: string;
    amount?: number | string;
  }>;
  cashflow?: Array<{
    id?: string;
    date?: string;
    type?: string;
    description?: string;
    category?: string;
    amount?: number | string;
  }>;
  traffic?: Array<{
    id?: string;
    date?: string;
    campaignName?: string;
    amountSpent?: number | string;
    clicks?: number | string;
    conversions?: number | string;
    roas?: number | string;
    lucro?: number | string;
  }>;
}

export function validateSheetSyncPayload(body: any): { isValid: boolean; sanitized?: SheetSyncPayload; error?: string } {
  if (!body || typeof body !== 'object') {
    return { isValid: false, error: "Payload do Google Sheets deve ser um objeto JSON." };
  }

  const sanitized: SheetSyncPayload = {};

  // 1. Validar produtos
  if (body.products !== undefined) {
    if (!Array.isArray(body.products)) {
      return { isValid: false, error: "O campo 'products' deve ser uma lista (array)." };
    }
    sanitized.products = body.products
      .filter((p: any) => p && typeof p === 'object' && typeof p.slug === 'string' && p.slug.trim().length > 0)
      .map((p: any) => ({
        slug: String(p.slug).trim(),
        stock: p.stock !== undefined ? Math.max(0, parseInt(String(p.stock), 10) || 0) : undefined,
        price: p.price !== undefined ? Math.max(0, parseFloat(String(p.price)) || 0) : undefined,
        cost: p.cost !== undefined ? Math.max(0, parseFloat(String(p.cost)) || 0) : undefined,
      }));
  }

  // 2. Validar pedidos
  if (body.orders !== undefined) {
    if (!Array.isArray(body.orders)) {
      return { isValid: false, error: "O campo 'orders' deve ser uma lista (array)." };
    }
    sanitized.orders = body.orders
      .filter((o: any) => o && typeof o === 'object' && typeof o.id === 'string' && o.id.trim().length > 0)
      .map((o: any) => ({
        id: String(o.id).trim(),
        status: o.status !== undefined ? String(o.status).trim() : undefined,
      }));
  }

  // 3. Validar investimentos
  if (body.investments !== undefined) {
    if (!Array.isArray(body.investments)) {
      return { isValid: false, error: "O campo 'investments' deve ser uma lista (array)." };
    }
    sanitized.investments = body.investments
      .filter((inv: any) => inv && typeof inv === 'object' && typeof inv.id === 'string')
      .map((inv: any) => ({
        id: String(inv.id).trim(),
        date: inv.date ? String(inv.date).trim() : new Date().toISOString().split('T')[0],
        description: String(inv.description || '').substring(0, 300),
        category: String(inv.category || 'fornecedores').substring(0, 100),
        amount: Math.max(0, parseFloat(String(inv.amount)) || 0)
      }));
  }

  // 4. Validar fluxo de caixa
  if (body.cashflow !== undefined) {
    if (!Array.isArray(body.cashflow)) {
      return { isValid: false, error: "O campo 'cashflow' deve ser uma lista (array)." };
    }
    sanitized.cashflow = body.cashflow
      .filter((cf: any) => cf && typeof cf === 'object' && typeof cf.id === 'string')
      .map((cf: any) => ({
        id: String(cf.id).trim(),
        date: cf.date ? String(cf.date).trim() : new Date().toISOString().split('T')[0],
        type: cf.type === 'in' ? 'in' : 'out',
        description: String(cf.description || '').substring(0, 300),
        category: String(cf.category || 'Outros').substring(0, 100),
        amount: Math.max(0, parseFloat(String(cf.amount)) || 0)
      }));
  }

  // 5. Validar tráfego
  if (body.traffic !== undefined) {
    if (!Array.isArray(body.traffic)) {
      return { isValid: false, error: "O campo 'traffic' deve ser uma lista (array)." };
    }
    sanitized.traffic = body.traffic
      .filter((tr: any) => tr && typeof tr === 'object' && typeof tr.id === 'string')
      .map((tr: any) => ({
        id: String(tr.id).trim(),
        date: tr.date ? String(tr.date).trim() : new Date().toISOString().split('T')[0],
        campaignName: String(tr.campaignName || '').substring(0, 200),
        amountSpent: Math.max(0, parseFloat(String(tr.amountSpent)) || 0),
        clicks: Math.max(0, parseInt(String(tr.clicks), 10) || 0),
        conversions: Math.max(0, parseInt(String(tr.conversions), 10) || 0),
        roas: Math.max(0, parseFloat(String(tr.roas)) || 0),
        lucro: parseFloat(String(tr.lucro)) || 0
      }));
  }

  return { isValid: true, sanitized };
}
