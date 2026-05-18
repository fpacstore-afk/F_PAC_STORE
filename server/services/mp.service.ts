
import { MercadoPagoConfig, Payment } from "mercadopago";
import { logger } from "../utils/logger.js";

/**
 * Service to interact with Mercado Pago SDK.
 * Implements lazy loading for the SDK client.
 */
export class MercadoPagoService {
  private client: MercadoPagoConfig | null = null;
  private payment: Payment | null = null;

  /**
   * Initializes or returns the Payment instance.
   * Ensures the Access Token is present.
   */
  private getPaymentInstance() {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) {
      throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado no servidor.");
    }

    // Lazy initialization
    if (!this.client) {
      const mode = token.startsWith('APP_USR-') ? 'PRODUCTION' : 'SANDBOX';
      logger.info(`📡 [MP-SDK] Inicializando em modo ${mode}`);
      this.client = new MercadoPagoConfig({ accessToken: token });
      this.payment = new Payment(this.client);
    }
    
    return this.payment!;
  }

  /**
   * Creates a payment on Mercado Pago with idempotency support.
   */
  async createPayment(body: any, idempotencyKey: string) {
    const payment = this.getPaymentInstance();
    
    try {
      logger.info(`💳 [MP-SDK] Criando pagamento: ${body.external_reference}`);
      
      const response = await payment.create({
        body,
        requestOptions: { idempotencyKey }
      });
      
      return response;
    } catch (error: any) {
      const apiDetail = error.response || error;
      logger.error("❌ [MP-SDK] Erro na API do Mercado Pago", {
        message: error.message,
        status: error.status,
        detail: apiDetail
      });
      throw error;
    }
  }

  /**
   * Retrieves a payment by its Mercado Pago ID.
   */
  async getPayment(id: string) {
    const payment = this.getPaymentInstance();
    try {
      return await payment.get({ id });
    } catch (error: any) {
      logger.error(`❌ [MP-SDK] Erro ao buscar pagamento ${id}`, error);
      throw error;
    }
  }
}

export const mpService = new MercadoPagoService();
