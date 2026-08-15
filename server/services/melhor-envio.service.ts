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

  constructor() {
    this.token = process.env.MELHOR_ENVIO_TOKEN || '';
    this.baseUrl = this.sanitizeBaseUrl(process.env.MELHOR_ENVIO_URL || 'https://sandbox.melhorenvio.com.br');
  }

  private sanitizeBaseUrl(url?: string): string {
    if (!url) return 'https://sandbox.melhorenvio.com.br';
    const trimmed = String(url).trim().replace(/\/+$/, '');
    if (ALLOWED_MELHOR_ENVIO_URLS.includes(trimmed)) {
      return trimmed;
    }
    console.warn(`⚠️ [MELHOR_ENVIO_SERVICE] URL não autorizada (${url}), utilizando fallback seguro sandbox.`);
    return 'https://sandbox.melhorenvio.com.br';
  }

  private getToken(): string {
    return process.env.MELHOR_ENVIO_TOKEN || this.token || '';
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
      // ignore
    }
    return this.baseUrl;
  }

  async calculateShipping(request: ShippingCalculationRequest) {
    const token = this.getToken();
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
      console.warn('Erro ao calcular frete via Melhor Envio API, ativando fallback regional inteligente:', error.message);
      
      const toCep = String(request.to).replace(/\D/g, '');
      const cepNum = parseInt(toCep.substring(0, 5), 10) || 89210;
      
      let state = 'SC';
      if (cepNum >= 1000 && cepNum <= 19999) state = 'SP';
      else if (cepNum >= 20000 && cepNum <= 28999) state = 'RJ';
      else if (cepNum >= 29000 && cepNum <= 29999) state = 'ES';
      else if (cepNum >= 30000 && cepNum <= 39999) state = 'MG';
      else if (cepNum >= 40000 && cepNum <= 48999) state = 'BA';
      else if (cepNum >= 80000 && cepNum <= 87999) state = 'PR';
      else if (cepNum >= 88000 && cepNum <= 89999) state = 'SC';
      else if (cepNum >= 90000 && cepNum <= 99999) state = 'RS';

      let pacPrice = 28.50;
      let sedexPrice = 45.90;
      let pacTime = 7;
      let sedexTime = 3;

      if (state === 'SC') {
        pacPrice = 14.90;
        sedexPrice = 22.50;
        pacTime = 4;
        sedexTime = 2;
      } else if (['PR', 'RS', 'SP'].includes(state)) {
        pacPrice = 22.90;
        sedexPrice = 33.50;
        pacTime = 6;
        sedexTime = 3;
      } else if (['RJ', 'MG', 'ES'].includes(state)) {
        pacPrice = 26.90;
        sedexPrice = 41.50;
        pacTime = 8;
        sedexTime = 4;
      } else {
        pacPrice = 34.90;
        sedexPrice = 59.90;
        pacTime = 12;
        sedexTime = 5;
      }

      const totalQuantity = (request.items || []).reduce((acc, item) => acc + (item.quantity || 1), 0);
      const quantityMultiplier = Math.min(2.5, 1 + (totalQuantity - 1) * 0.15);
      
      const pPrice = Number((pacPrice * quantityMultiplier).toFixed(2));
      const sPrice = Number((sedexPrice * quantityMultiplier).toFixed(2));

      return [
        {
          id: 1,
          name: "Correios PAC",
          price: String(pPrice),
          custom_price: String(pPrice),
          discount: "0.00",
          currency: "R$",
          delivery_time: pacTime,
          delivery_range: {
            min: Math.max(1, pacTime - 2),
            max: pacTime + 2
          },
          custom_delivery_time: pacTime,
          custom_delivery_range: {
            min: Math.max(1, pacTime - 2),
            max: pacTime + 2
          },
          packages: [],
          additional_services: {
            receipt: false,
            own_hand: false,
            collect: false
          },
          error: null
        },
        {
          id: 2,
          name: "Correios SEDEX",
          price: String(sPrice),
          custom_price: String(sPrice),
          discount: "0.00",
          currency: "R$",
          delivery_time: sedexTime,
          delivery_range: {
            min: Math.max(1, sedexTime - 1),
            max: sedexTime + 1
          },
          custom_delivery_time: sedexTime,
          custom_delivery_range: {
            min: Math.max(1, sedexTime - 1),
            max: sedexTime + 1
          },
          packages: [],
          additional_services: {
            receipt: false,
            own_hand: false,
            collect: false
          },
          error: null
        }
      ];
    }
  }

  async addToCart(orderData: any) {
    const token = this.getToken();
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
    const token = this.getToken();
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
    const token = this.getToken();
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
    const token = this.getToken();
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
    const token = this.getToken();
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
