import { ArrowRight, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CAMPAIGN_1111_COMBO_SAVING, CAMPAIGN_1111_PRICES, CAMPAIGN_1111_URL } from '../../shared/campaign1111';
import { formatBRL, fromCents } from '../lib/money';

const { traditionalSmall, traditionalLarge, oversizedSmall, oversizedLarge } = CAMPAIGN_1111_PRICES;
const whatsapp = `https://wa.me/5547997465602?text=${encodeURIComponent('Olá! Quero consultar as camisetas tradicionais de estampa pequena e os combos da campanha 11.11 da F PAC STORE.')}`;
const combos = [
  { name: '2 tradicionais', price: traditionalSmall * 2 - CAMPAIGN_1111_COMBO_SAVING },
  { name: '2 oversized', price: oversizedSmall * 2 - CAMPAIGN_1111_COMBO_SAVING },
  { name: '1 tradicional + 1 oversized', price: traditionalSmall + oversizedSmall - CAMPAIGN_1111_COMBO_SAVING },
];

const price = (cents: number) => formatBRL(fromCents(cents));

export function Campaign1111({ full = false }: { full?: boolean }) {
  if (!full) {
    return (
      <section className="bg-zinc-950 text-white border-b border-amber-400/30">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-6 md:px-8">
          <div>
            <h2 className="text-2xl font-black italic tracking-tight md:text-3xl"><span className="text-amber-400">11.11</span> F PAC STORE</h2>
            <p className="mt-1 text-sm text-zinc-300">Ofertas em camisetas e combos. Só hoje, enquanto houver estoque.</p>
          </div>
          <Link to={CAMPAIGN_1111_URL} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-black text-black hover:bg-amber-300">
            Ver ofertas <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-zinc-950 px-4 py-7 text-white sm:px-8 md:py-10">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-wider text-amber-400">F PAC STORE</p>
        <h1 className="mt-1 text-4xl font-black italic tracking-tight md:text-6xl"><span className="text-amber-400">11.11</span> Ofertas especiais</h1>
        <p className="mt-2 text-sm text-zinc-300">Só em 11/11, até 23h59, no horário de Brasília. Estoque limitado.</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-white/15 p-4">
            <h2 className="mb-3 font-black">Camisetas tradicionais</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-2"><dt>Estampa pequena <span className="block text-xs text-zinc-400">Consulte pelo WhatsApp</span></dt><dd className="shrink-0 font-black text-amber-400">{price(traditionalSmall)}</dd></div>
              <div className="flex items-baseline justify-between gap-2"><dt>Estampa grande</dt><dd className="shrink-0 font-black text-amber-400">{price(traditionalLarge)}</dd></div>
            </dl>
          </div>
          <div className="rounded-xl border border-white/15 p-4">
            <h2 className="mb-3 font-black">Camisetas oversized</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-2"><dt>Estampa pequena</dt><dd className="shrink-0 font-black text-amber-400">{price(oversizedSmall)}</dd></div>
              <div className="flex items-baseline justify-between gap-2"><dt>Estampa grande</dt><dd className="shrink-0 font-black text-amber-400">{price(oversizedLarge)}</dd></div>
            </dl>
          </div>
          <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 sm:col-span-2 lg:col-span-1">
            <h2 className="mb-3 font-black text-amber-400">Combos 11.11</h2>
            <dl className="space-y-2 text-sm">
              {combos.map(combo => (
                <div key={combo.name} className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <dt>{combo.name}</dt><dd className="shrink-0 text-xs text-zinc-300">a partir de <strong className="text-sm text-amber-400">{price(combo.price)}</strong></dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <p className="mt-4 max-w-3xl text-sm text-zinc-300">Na sacola, cada dupla de camisetas participantes ganha {price(CAMPAIGN_1111_COMBO_SAVING)} de desconto sobre os preços da oferta. Os menores valores dos combos usam estampas pequenas e dependem da disponibilidade.</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-black text-black hover:bg-amber-300">
            <MessageCircle size={17} aria-hidden="true" /> Consultar pelo WhatsApp
          </a>
          <details className="text-sm text-zinc-300">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">Ver arte da campanha</summary>
            <img src="/campanhas/11-11-2026.jpg" alt="Arte 11.11 F PAC STORE com os preços de camisetas e combos informados acima" width={864} height={1536} loading="lazy" className="mt-2 h-auto w-full max-w-sm rounded-xl" />
          </details>
        </div>
      </div>
    </section>
  );
}
