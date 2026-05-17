
import { MercadoPagoConfig, Payment } from "mercadopago";

export class MercadoPagoService {
  private client: MercadoPagoConfig | null = null;
  private payment: Payment | null = null;

  private getPaymentInstance() {
    if (this.payment) return this.payment;

    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) {
      throw new Error("MERCADO_PAGO_ACCESS_TOKEN is missing in server environment");
    }

    this.client = new MercadoPagoConfig({ accessToken: token });
    this.payment = new Payment(this.client);
    return this.payment;
  }

  async createPayment(data: any, idempotencyKey: string) {
    const payment = this.getPaymentInstance();
    console.log(`💳 [MP SERVICE] Creating payment for order: ${data.external_reference}`);
    
    // Safety check: log payload structure (sensitive data omitted)
    const tokenPrefix = data.token ? String(data.token).substring(0, 10) + '...' : 'NONE';
    
    console.log("🛠️ [MP SERVICE] Charging payload:", {
      amount: data.transaction_amount,
      method: data.payment_method_id,
      installments: data.installments,
      tokenPrefix: tokenPrefix,
      email: data.payer?.email
    });

    try {
      const response = await payment.create({
        body: data,
        requestOptions: { idempotencyKey }
      });
      return response;
    } catch (error: any) {
      const errorData = error.response || error;
      console.error("❌ [MP SERVICE] Critical Payment Failure:", {
        message: error.message,
        status: error.status,
        apiResponse: errorData
      });
      
      // Specifically log the MP error codes if available
      if (errorData?.errors) {
        console.error("❌ [MP SERVICE] MP API Errors:", JSON.stringify(errorData.errors, null, 2));
      }
      
      throw error;
    }
  }

  async getPayment(id: string) {
    const payment = this.getPaymentInstance();
    try {
      return await payment.get({ id });
    } catch (error) {
      console.error(`❌ [MP SERVICE] Error fetching payment ${id}:`, error);
      throw error;
    }
  }
}

export const mpService = new MercadoPagoService();
