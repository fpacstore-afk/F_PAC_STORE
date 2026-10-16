import { JOINVILLE_NEIGHBORHOOD_TIERS, DEFAULT_SHIPPING_PRICE } from '../../src/data/shipping.js';
import { shippingParcel, type ShippingParcelSource } from '../../shared/shippingParcel.js';
import { MelhorEnvioService } from './melhor-envio.service.js';

export type CheckoutDestination = { city: string; state: string; neighborhood: string };
export type DeliveryDependencies = {
  lookupPostcode: (cep: string) => Promise<CheckoutDestination>;
  calculateShipping: (input: { from: string; to: string; items: ReturnType<typeof shippingParcel>[] }) => Promise<any>;
};
export async function lookupCheckoutPostcode(cep: string): Promise<CheckoutDestination> {
  if (!/^\d{8}$/.test(cep)) throw new Error('CEP inválido para cálculo de frete.');
  const response = await fetch('https://viacep.com.br/ws/' + cep + '/json/', { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Não foi possível consultar o CEP. Tente novamente.');
  const data = await response.json() as any;
  if (data.erro || typeof data.localidade !== 'string' || !data.localidade.trim() || !/^[A-Z]{2}$/.test(String(data.uf || ''))) throw new Error('CEP inválido para cálculo de frete.');
  return { city: data.localidade.trim(), state: data.uf, neighborhood: String(data.bairro || '').trim() };
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export async function quoteCheckoutDelivery(
  customer: { cep?: string; shippingServiceId?: number }, items: ShippingParcelSource[],
  overrides: Partial<DeliveryDependencies> = {},
) {
  const cep = String(customer.cep || '').replace(/\D/g,'');
  if (!/^\d{8}$/.test(cep)) throw new Error('CEP inválido para cálculo de frete.');
  const destination = await (overrides.lookupPostcode || lookupCheckoutPostcode)(cep);
  const local = Number(cep) >= 89200000 && Number(cep) <= 89239999 && normalize(destination.city) === 'joinville';
  if (local) {
    const key = Object.keys(JOINVILLE_NEIGHBORHOOD_TIERS).find(key => normalize(key) === normalize(destination.neighborhood));
    return { destination, shipping: key ? JOINVILLE_NEIGHBORHOOD_TIERS[key] : DEFAULT_SHIPPING_PRICE };
  }
  const calculate = overrides.calculateShipping || (input => new MelhorEnvioService().calculateShipping(input));
  const response = await calculate({ from: String(process.env.ORIGIN_CEP || '89234100').replace(/\D/g,''), to: cep, items: items.map(shippingParcel) });
  const options = Array.isArray(response) ? response.filter(option => option && !option.error && (typeof option.price === 'number' || (typeof option.price === 'string' && option.price.trim() !== '')) && Number.isFinite(Number(option.price)) && Number(option.price) >= 0 && Number.isInteger(Number(option.id)) && Number(option.id) > 0).sort((a,b) => Number(a.price) - Number(b.price)) : [];
  const requested = customer.shippingServiceId;
  const selected = requested == null ? options[0] : options.find(option => Number(option.id) === Number(requested));
  if (!selected) throw new Error('A opção de entrega não está disponível. Calcule o frete novamente na sacola.');
  return { destination, shipping: Number(Number(selected.price).toFixed(2)) };
}
