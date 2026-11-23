import { useEffect, useState } from 'react';
import { authenticatedFetch, getPublicApiUrl } from '../../lib/api';
import { ManualProductPicker } from './ManualProductPicker';

export function AdminCheckoutLinkBuilder() {
  const [products, setProducts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [color, setColor] = useState(''), [size, setSize] = useState(''), [quantity, setQuantity] = useState(1);
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  useEffect(() => { fetch(getPublicApiUrl('/api/products')).then(r => r.json()).then(data => setProducts(Array.isArray(data.products) ? data.products : [])).catch(() => setError('Catálogo indisponível.')); }, []);
  const colors = (selected?.colors || []).map((item: any) => typeof item === 'string' ? item : item.name).filter(Boolean);
  const sizes = selected?.sizes || [];
  const productChoices = products.flatMap(product => Array.isArray(product.garmentOptions) && product.garmentOptions.length
    ? product.garmentOptions.map((option: any) => ({ ...product, garmentModelId: option.garmentModelId, garmentModelName: option.garmentModelName,
      colors: option.colors, sizes: option.sizes, name: `${product.name} · ${option.garmentModelName || option.name || 'Modelo'}` })) : [product]);
  const create = async () => {
    if (!selected || !color || !size) return setError('Escolha o produto, a cor e o tamanho.');
    setSaving(true); setError(''); setUrl('');
    try {
      const response = await authenticatedFetch('/api/admin/checkout-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        items: [{ slug: selected.slug || selected.id, garmentModelId: selected.garmentModelId, color, size, quantity }], customer,
      }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível gerar o link.');
      setUrl(`${window.location.origin}/pedido-link#id=${data.id}&token=${data.token}`);
    } catch (reason: any) { setError(reason.message); }
    finally { setSaving(false); }
  };
  return <section className="border border-black/10 bg-white p-5" aria-labelledby="link-title">
    <h2 id="link-title" className="text-lg font-black">Gerar link de pedido</h2>
    <p className="mt-1 text-sm text-gray-600">Escolha a peça do catálogo. Nome, e-mail e telefone são opcionais e adiantam o preenchimento do cliente. O preço e o estoque são conferidos novamente no pagamento. Link válido por 7 dias e para uma compra.</p>
    <div className="mt-4"><ManualProductPicker products={productChoices} selected={selected} onSelect={product => { setSelected(product); setColor(''); setSize(''); setUrl(''); }} formatPrice={value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} /></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <label className="text-sm font-bold">Cor<select value={color} onChange={e => setColor(e.target.value)} className="mt-1 min-h-11 w-full border p-2"><option value="">Escolha</option>{colors.map((value: string) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="text-sm font-bold">Tamanho<select value={size} onChange={e => setSize(e.target.value)} className="mt-1 min-h-11 w-full border p-2"><option value="">Escolha</option>{sizes.map((value: string) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="text-sm font-bold">Quantidade<input type="number" min="1" max="30" value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="mt-1 min-h-11 w-full border p-2" /></label>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">{(['name', 'email', 'phone'] as const).map(field => <label key={field} className="text-sm font-bold">{field === 'name' ? 'Nome' : field === 'email' ? 'E-mail' : 'WhatsApp'}<input type={field === 'email' ? 'email' : 'text'} value={customer[field]} onChange={e => setCustomer({ ...customer, [field]: e.target.value })} className="mt-1 min-h-11 w-full border p-2" /></label>)}</div>
    <button type="button" disabled={saving} onClick={() => void create()} className="mt-4 min-h-11 rounded bg-black px-5 font-bold text-[#eab308] disabled:opacity-50">{saving ? 'Conferindo…' : 'Gerar link'}</button>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {url && <div className="mt-4 rounded border border-emerald-400 p-3"><label className="text-sm font-bold">Link para enviar ao cliente<input readOnly value={url} onFocus={e => e.currentTarget.select()} className="mt-2 min-h-11 w-full border p-2 text-xs" /></label><button type="button" onClick={() => void navigator.clipboard.writeText(url)} className="mt-2 min-h-11 rounded bg-[#eab308] px-4 font-bold">Copiar link</button></div>}
  </section>;
}
