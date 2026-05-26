import axios from 'axios';

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

  async calculateShipping(request: ShippingCalculationRequest) {
    if (!this.token) {
      throw new Error('MELHOR_ENVIO_TOKEN não configurado');
    }

    try {
      const fromCep = String(request.from).replace(/\D/g, '');
      const toCep = String(request.to).replace(/\D/g, '');
      
      const response = await axios.post(`${this.baseUrl}/api/v2/me/shipment/calculate`, {
        from: { postal_code: fromCep },
        to: { postal_code: toCep },
        products: request.items
      }, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'F-PAC-STORE (fpacstore@gmail.com)'
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('Erro ao calcular frete no Melhor Envio:', error.response?.data || error.message);
      throw error;
    }
  }

  async createLabel(orderData: any) {
    // Implementação básica para adicionar ao carrinho do Melhor Envio
    if (!this.token) throw new Error('MELHOR_ENVIO_TOKEN não configurado');

    try {
      // 1. Adicionar ao carrinho
      const cartResponse = await axios.post(`${this.baseUrl}/api/v2/me/cart`, {
        service: orderData.serviceId, // ID do serviço (Sedex, PAC, etc)
        agency: orderData.agencyId, // Opcional para alguns serviços
        from: orderData.from,
        to: orderData.to,
        products: orderData.items,
        volumes: orderData.volumes,
        options: {
          insurance_value: orderData.totalValue,
          receipt: false,
          own_hand: false,
          reverse: false,
          non_commercial: true // Geralmente true para MEI/Pessoa Física sem NF
        }
      }, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      return cartResponse.data;
    } catch (error: any) {
      console.error('Erro ao criar etiqueta no Melhor Envio:', error.response?.data || error.message);
      throw error;
    }
  }
}
