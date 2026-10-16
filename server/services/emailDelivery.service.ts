import { Resend } from 'resend';
import { getDb } from '../firebase.js';
import { emailDeliveryLabel } from '../../shared/emailDelivery.js';

let lastCheck = 0;
let inFlight: Promise<any> | null = null;

async function readHistory() {
  const snapshot = await getDb().collection('email_delivery_status').orderBy('createdAt', 'desc').limit(20).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/** Authenticated admin read, cached to respect provider limits. Never sends an email. */
export async function getEmailDeliveryHistory() {
  if (inFlight) return inFlight;
  if (Date.now() - lastCheck < 60_000) return { deliveries: await readHistory(), checkedAt: new Date(lastCheck).toISOString() };
  inFlight = (async () => {
    let warning = '';
    let checkedAt = '';
    if (!process.env.RESEND_API_KEY) warning = 'O provedor de e-mail não está configurado.';
    else {
      try {
        const result = await new Resend(process.env.RESEND_API_KEY).emails.list({ limit: 20 });
        if (result.error || !Array.isArray(result.data?.data)) throw new Error('Provider history unavailable');
        checkedAt = new Date().toISOString();
        const previous = new Map((await readHistory()).map((email: any) => [email.id, email]));
        for (const email of result.data.data) {
          if (!/(?:^|[<\s])atendimento@fpacstore\.com\.br>?$/i.test(email.from || '') || !/^[\w-]{1,100}$/.test(email.id)) continue;
          const prior: any = previous.get(email.id);
          if (prior?.event === email.last_event && prior?.subject === email.subject && prior?.recipient === (email.to || []).join(', ')) continue;
          await getDb().collection('email_delivery_status').doc(email.id).set({
            createdAt: email.created_at, recipient: (email.to || []).join(', '), subject: email.subject,
            event: email.last_event, status: emailDeliveryLabel(email.last_event), checkedAt,
          }, { merge: true });
        }
        lastCheck = Date.now();
      } catch {
        warning = 'Não foi possível consultar a entrega no provedor. Confira a conexão e a permissão de leitura da integração.';
      }
    }
    return { deliveries: await readHistory(), checkedAt, warning };
  })();
  try { return await inFlight; } finally { inFlight = null; }
}
