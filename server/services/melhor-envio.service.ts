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

export class MelhorEnvioService {
  private token: string;
  private baseUrl: string;

  constructor() {
    this.token = process.env.MELHOR_ENVIO_TOKEN || '';
    this.baseUrl = process.env.MELHOR_ENVIO_URL || 'https://sandbox.melhorenvio.com.br';
  }

  private async getToken(): Promise<string> {
    try {
      const db = getDb();
      const settingsSnap = await db.collection('settings').doc('melhorenvio').get();
      if (settingsSnap.exists) {
        const data = settingsSnap.data();
        if (data && data.token) {
          return data.token;
        }
      }
    } catch (e: any) {
      console.warn("⚠️ [MELHOR_ENVIO_SERVICE] Falha ao obter token do Firestore:", e.message);
    }
    return this.token || '';
  }

  private async getUrl(): Promise<string> {
    try {
      const db = getDb();
      const settingsSnap = await db.collection('settings').doc('melhorenvio').get();
      if (settingsSnap.exists) {
        const data = settingsSnap.data();
        if (data && data.baseUrl) {
          return data.baseUrl;
        }
      }
    } catch (e: any) {
      // ignore
    }
    return this.baseUrl || 'https://sandbox.melhorenvio.com.br';
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

  async createLabel(orderData: any) {
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

      return {
        ...cartResponse.data,
        redirectUrl: baseUrl.includes('sandbox')
          ? 'https://sandbox.melhorenvio.com.br/painel/envios/carrinho'
          : 'https://painel.melhorenvio.com.br/envios/carrinho'
      };
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
      console.warn('Erro ao criar etiqueta no Melhor Envio API:', errorMsg);
      
      // If error occurs, let's also support sandbox redirection as secondary fallback if they want, but raise the actual error so the UI handles it
      throw new Error(`Erro na API do Melhor Envio: ${JSON.stringify(errorMsg)}`);
    }
  }
}
