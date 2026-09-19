import axios from 'axios';
import { getDb } from '../firebase.js';

export interface ShippingItem {
  id: string;
  width: number;
  height: number;
  length: number;
  weight: number;
  insurance_value: number;
  quantity: number;
}

export interface ShippingCalculationRequest {
  from: string;
  to: string;
  items: ShippingItem[];
}

const ALLOWED_MELHOR_ENVIO_URLS = [
  'https://www.melhorenvio.com.br',
  'https://sandbox.melhorenvio.com.br',
  'https://melhorenvio.com.br'
];

export function sanitizeSecrets(data: any): any {
  if (!data) return data;
  if (typeof data === 'string') {
    return data
      .replace(/Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/token[":=]\s*["']?[A-Za-z0-9\-\._~\+\/]+["']?/gi, 'token: "[REDACTED]"')
      .replace(/client_secret[":=]\s*["']?[A-Za-z0-9\-\._~\+\/]+["']?/gi, 'client_secret: "[REDACTED]"')
      .replace(/MELHOR_ENVIO_TOKEN[":=]\s*["']?[A-Za-z0-9\-\._~\+\/]+["']?/gi, 'MELHOR_ENVIO_TOKEN: "[REDACTED]"');
  }
  if (typeof data === 'object') {
    try {
      const jsonStr = JSON.stringify(data);
      const sanitized = sanitizeSecrets(jsonStr);
      return JSON.parse(sanitized);
    } catch (e) {
      return '[REDACTED_OBJECT]';
    }
  }
  return data;
}

export class MelhorEnvioService {
  private token: string;
  private baseUrl: string;
  private storedTokenCache: { token: string; expiresAt: number } | null = null;

  constructor() {
    this.token = process.env.MELHOR_ENVIO_TOKEN || '';
    this.baseUrl = process.env.MELHOR_ENVIO_URL
      ? this.sanitizeBaseUrl(process.env.MELHOR_ENVIO_URL)
      : '';
  }

  private sanitizeBaseUrl(url?: string): string {
    if (!url) return 'https://sandbox.melhorenvio.com.br';
    const trimmed = String(url).trim().replace(/\/+$/, '') === 'https://www.melhorenvio.com.br'
      ? 'https://melhorenvio.com.br'
      : String(url).trim().replace(/\/+$/, '');
    if (ALLOWED_MELHOR_ENVIO_URLS.includes(trimmed)) {
      return trimmed;
    }
    throw new Error('MELHOR_ENVIO_URL não autorizada pela allowlist.');
  }

  public invalidateTokenCache(): void {
    this.storedTokenCache = null;
  }

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this.storedTokenCache && this.storedTokenCache.expiresAt > now) {
      return this.storedTokenCache.token;
    }

    try {
      const db = getDb();
      const secretSnap = await db.collection('server_secrets').doc('melhorenvio').get();
      const storedToken = secretSnap.exists ? String(secretSnap.data()?.token || '').trim() : '';
      if (storedToken) {
        this.storedTokenCache = { token: storedToken, expiresAt: now + 60_000 };
        return storedToken;
      }
    } catch {
      // O fallback de ambiente mantém instalações antigas funcionando.
    }

    return process.env.MELHOR_ENVIO_TOKEN || this.token || '';
  }

  public async hasConfiguredToken(): Promise<{ hasToken: boolean; source: 'site' | 'environment' | 'none'; updatedAt?: any }> {
    try {
      const db = getDb();
      const secretSnap = await db.collection('server_secrets').doc('melhorenvio').get();
      if (secretSnap.exists && String(secretSnap.data()?.token || '').trim()) {
        return {
          hasToken: true,
          source: 'site',
          updatedAt: secretSnap.data()?.updatedAt || null
        };
      }
    } catch {
      // Continua para o fallback sem expor detalhes internos.
    }

    if (process.env.MELHOR_ENVIO_TOKEN || this.token) {
      return { hasToken: true, source: 'environment' };
    }
    return { hasToken: false, source: 'none' };
  }

  public async validateCredentials(token: string, baseUrl: string): Promise<void> {
    const normalizedToken = String(token || '').trim().replace(/^Bearer\s+/i, '');
    const normalizedUrl = this.sanitizeBaseUrl(baseUrl);
    if (normalizedToken.length < 80 || normalizedToken.length > 8192 || !/^[A-Za-z0-9._~-]+$/.test(normalizedToken)) {
      throw new Error('Token inválido. Copie o token completo gerado pelo Melhor Envio.');
    }

    try {
      await axios.post(`${normalizedUrl}/api/v2/me/shipment/calculate`, {
        from: { postal_code: '89201300' },
        to: { postal_code: '01001000' },
        products: [{
          id: 'FPAC-CONNECTION-TEST',
          width: 12,
          height: 4,
          length: 16,
          weight: 0.3,
          insurance_value: 1,
          quantity: 1
        }]
      }, {
        timeout: 15_000,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${normalizedToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'F-PAC-STORE (fpacstore@gmail.com)'
        }
      });
    } catch (error: any) {
      const status = Number(error?.response?.status || 0);
      if (status === 401 || status === 403) {
        throw new Error('Token recusado pelo Melhor Envio. Confirme se ele pertence ao ambiente selecionado e possui permissão de cotação.');
      }
      if (error?.code === 'ECONNABORTED') {
        throw new Error('O Melhor Envio demorou para responder. Tente novamente.');
      }
      const providerMessage = sanitizeSecrets(error?.response?.data?.message || error?.message || 'falha desconhecida');
      throw new Error(`Não foi possível validar a conexão com o Melhor Envio: ${providerMessage}`);
    }
  }

  public async getUrl(): Promise<string> {
    try {
      const db = getDb();
      const settingsSnap = await db.collection('settings').doc('melhorenvio').get();
      if (settingsSnap.exists) {
        const data = settingsSnap.data();
        if (data && data.baseUrl) {
          return this.sanitizeBaseUrl(data.baseUrl);
        }
      }
    } catch (e: any) {
      // Do not silently fall back to sandbox when configuration lookup fails.
    }

    if (this.baseUrl) {
      return this.baseUrl;
    }

    throw new Error('MELHOR_ENVIO_URL não configurada ou indisponível.');

  }

  async calculateShipping(request: ShippingCalculationRequest) {
    const token = await this.getToken();
    const baseUrl = await this.getUrl();

    try {
      if (!token) {
        throw new Error('MELHOR_ENVIO_TOKEN não configurado');
      }

      const fromCep = String(request.from).replace(/\D/g, '');
      const toCep = String(request.to).replace(/\D/g, '');
      
      const response = await axios.post(`${baseUrl}/api/v2/me/shipment/calculate`, {
        from: { postal_code: fromCep },
        to: { postal_code: toCep },
        products: request.items
      }, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'F-PAC-STORE (fpacstore@gmail.com)'
        }
      });

      return response.data;
    } catch (error: any) {
      console.warn('Erro ao calcular frete via Melhor Envio API:', sanitizeSecrets(error?.message || error));
      throw new Error('Não foi possível obter cotação do Melhor Envio.');
    }
  }

  async addToCart(orderData: any) {
    const token = await this.getToken();
    const baseUrl = await this.getUrl();

    if (!token) {
      throw new Error('MELHOR_ENVIO_TOKEN não configurado');
    }

    try {
      const cartResponse = await axios.post(`${baseUrl}/api/v2/me/cart`, {
        service: orderData.serviceId,
        agency: orderData.agencyId,
        from: orderData.from,
        to: orderData.to,
        products: orderData.items,
        volumes: orderData.volumes,
        options: {
          insurance_value: orderData.totalValue,
          receipt: false,
          own_hand: false,
          reverse: false,
          non_commercial: true
        }
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const data = cartResponse.data;
      const cartId = data?.id || (Array.isArray(data) ? data[0]?.id : null);

      return {
        cartId: cartId ? String(cartId) : null,
        data,
        protocol: data?.protocol || null
      };
    } catch (error: any) {
      let errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
      const sanitizedErr = sanitizeSecrets(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : String(errorMsg));
      console.warn('Erro ao adicionar ao carrinho no Melhor Envio API:', sanitizedErr);

      if (typeof errorMsg === 'string' && (errorMsg.includes('Unauthenticated') || errorMsg.includes('unauthenticated'))) {
        errorMsg = `Token do Melhor Envio ausente, inválido ou expirado para o ambiente correspondente (${baseUrl.includes('sandbox') ? 'Sandbox' : 'Produção'}). Por favor, verifique ou reinstale o token nas configurações do Melhor Envio (no topo da aba Gestão).`;
      }

      const errObj: any = new Error(`Erro na API do Melhor Envio (Carrinho): ${sanitizeSecrets(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)}`);
      errObj.status = error.response?.status;
      errObj.code = error.code;
      throw errObj;
    }
  }

  async checkoutShipment(cartId: string) {
    const token = await this.getToken();
    const baseUrl = await this.getUrl();

    if (!token) {
      throw new Error('MELHOR_ENVIO_TOKEN não configurado');
    }

    try {
      const response = await axios.post(`${baseUrl}/api/v2/me/shipment/checkout`, {
        orders: [cartId]
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      let errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
      const sanitizedErr = sanitizeSecrets(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : String(errorMsg));
      console.warn('Erro ao comprar frete no Melhor Envio API:', sanitizedErr);

      const errObj: any = new Error(`Erro na API do Melhor Envio (Checkout): ${sanitizeSecrets(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)}`);
      errObj.status = error.response?.status;
      errObj.code = error.code;
      throw errObj;
    }
  }

  async generateLabel(cartId: string) {
    const token = await this.getToken();
    const baseUrl = await this.getUrl();

    if (!token) {
      throw new Error('MELHOR_ENVIO_TOKEN não configurado');
    }

    try {
      const response = await axios.post(`${baseUrl}/api/v2/me/shipment/generate`, {
        orders: [cartId]
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      let errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
      const sanitizedErr = sanitizeSecrets(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : String(errorMsg));
      console.warn('Erro ao gerar etiqueta no Melhor Envio API:', sanitizedErr);

      const errObj: any = new Error(`Erro na API do Melhor Envio (Geração): ${sanitizeSecrets(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)}`);
      errObj.status = error.response?.status;
      errObj.code = error.code;
      throw errObj;
    }
  }

  async printLabel(cartId: string) {
    const token = await this.getToken();
    const baseUrl = await this.getUrl();

    if (!token) {
      throw new Error('MELHOR_ENVIO_TOKEN não configurado');
    }

    try {
      const response = await axios.post(`${baseUrl}/api/v2/me/shipment/print`, {
        mode: 'public',
        orders: [cartId]
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      return response.data;
    } catch (error: any) {
      return null;
    }
  }

  async createLabel(orderData: any): Promise<any> {
    const baseUrl = await this.getUrl();

    // Step 1: Add to cart
    const cartRes = await this.addToCart(orderData);
    const cartId = cartRes.cartId;

    if (!cartId) {
      throw new Error('Erro na API do Melhor Envio: ID de carrinho não retornado');
    }

    // Step 2: Checkout / Purchase shipment
    const checkoutRes = await this.checkoutShipment(cartId);
    const checkoutId = String(checkoutRes?.purchase?.id || checkoutRes?.id || cartId);

    // Step 3: Generate label
    const generateRes = await this.generateLabel(cartId);

    // Step 4: Print URL (optional/public)
    let printUrl: string | null = null;
    try {
      const printRes = await this.printLabel(cartId);
      printUrl = printRes?.url || null;
    } catch (e) {
      // Non-fatal
    }

    const redirectUrl = printUrl || (baseUrl.includes('sandbox')
      ? 'https://sandbox.melhorenvio.com.br/painel/envios/carrinho'
      : 'https://painel.melhorenvio.com.br/envios/carrinho');

    return {
      id: cartId,
      labelId: cartId,
      cartId,
      checkoutId,
      shipmentId: cartId,
      protocol: cartRes.protocol || cartId,
      status: 'generated',
      operationalState: 'generated',
      redirectUrl,
      url: printUrl,
      rawCart: cartRes.data,
      rawCheckout: checkoutRes,
      rawGenerate: generateRes
    };
  }

  async reconcileLabelWithProvider(orderId: string, labelOperationId?: string, externalCartId?: string): Promise<{
    found: boolean;
    labelId?: string;
    trackingCode?: string | null;
    redirectUrl?: string;
    providerReference?: string;
  }> {
    if (!externalCartId) {
      return { found: false };
    }
    const ordersToCheck = [externalCartId];

    const trackingRes = await this.getTracking(ordersToCheck);
    if (!trackingRes.available) {
      throw new Error(trackingRes.message || 'Erro de comunicação ao consultar rastreamento do provedor');
    }

    if (trackingRes.data) {
      const data = trackingRes.data;
      const orderEntry = data[externalCartId];
      if (orderEntry && (orderEntry.id || orderEntry.protocol)) {
        const baseUrl = await this.getUrl();
        const foundId = String(orderEntry.id || externalCartId || orderEntry.protocol);
        return {
          found: true,
          labelId: foundId,
          trackingCode: orderEntry.tracking || orderEntry.tracking_code || null,
          redirectUrl: baseUrl.includes('sandbox')
            ? 'https://sandbox.melhorenvio.com.br/painel/envios/carrinho'
            : 'https://painel.melhorenvio.com.br/envios/carrinho',
          providerReference: String(orderEntry.protocol || foundId)
        };
      }
    }
    return { found: false };
  }

  async getTracking(orders: string[]) {
    const token = await this.getToken();
    const baseUrl = await this.getUrl();

    if (!token) {
      return {
        available: false,
        message: 'Rastreamento temporariamente indisponível'
      };
    }

    try {
      const response = await axios.post(`${baseUrl}/api/v2/me/shipment/tracking`, {
        orders
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      return {
        available: true,
        data: response.data
      };
    } catch (error: any) {
      const sanitizedMsg = sanitizeSecrets(error.response?.data?.message || error.message || 'Erro de comunicação');
      console.warn(`⚠️ [MELHOR_ENVIO_TRACKING_ERR] ${sanitizedMsg}`);
      return {
        available: false,
        message: 'Rastreamento temporariamente indisponível'
      };
    }
  }
}

export const melhorEnvio = new MelhorEnvioService();
