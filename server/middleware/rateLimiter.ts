import rateLimit from "express-rate-limit";

/**
 * Limite de requisições para rotas públicas gerais
 * 100 requisições por janela de 15 minutos por IP
 */
export const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: {
    error: "Muitas requisições iniciadas. Por favor, aguarde alguns minutos e tente novamente."
  }
});

/**
 * Limite de requisições para finalização de checkout e captação de leads
 * 30 requisições por janela de 15 minutos por IP (evita spam de boletos/PIX/cartões)
 */
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: {
    error: "Limite de tentativas de checkout atingido. Aguarde 15 minutos antes de tentar novamente."
  }
});

/**
 * Limite de requisições para rotas administrativas sensíveis
 * 120 requisições por janela de 15 minutos por IP (ou ampliado em ambiente de teste automatizado)
 */
export const adminApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : (process.env.ADMIN_RATE_LIMIT ? parseInt(process.env.ADMIN_RATE_LIMIT, 10) : 120),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: {
    error: "Limite de operações administrativas atingido. Aguarde alguns minutos."
  }
});

/**
 * Limite para recebimento de webhooks de pagamento do Mercado Pago
 * 120 requisições por janela de 15 minutos por IP
 */
export const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: {
    error: "Volume de webhooks excedeu o limite temporariamente."
  }
});
