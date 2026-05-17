
import { MercadoPagoConfig, Payment } from "mercadopago";

export class MercadoPagoService {
  private client: MercadoPagoConfig;
  private payment: Payment;

  constructor() {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) throw new Error("MERCADO_PAGO_ACCESS_TOKEN is missing");
    this.client = new MercadoPagoConfig({ accessToken: token });
    this.payment = new Payment(this.client);
  }

  async createPayment(data: any, idempotencyKey: string) {
    console.log(`💳 [MP SERVICE] Creating payment for order: ${data.external_reference}`);
    try {
      const response = await this.payment.create({
        body: data,
        requestOptions: { idempotencyKey }
      });
      return response;
    } catch (error: any) {
      console.error("❌ [MP SERVICE] Error creating payment:", error.message);
      if (error.response) {
         console.error("❌ [MP SERVICE] API Response Error:", JSON.stringify(error.response, null, 2));
      }
      throw error;
    }
  }

  async getPayment(id: string) {
    try {
      return await this.payment.get({ id });
    } catch (error) {
      console.error(`❌ [MP SERVICE] Error fetching payment ${id}:`, error);
      throw error;
    }
  }
}

export const mpService = new MercadoPagoService();
