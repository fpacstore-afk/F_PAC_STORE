import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Pause, Play } from 'lucide-react';
import { productMatchesCommercialLine, productMatchesStorefrontCategory } from '../lib/catalogProducts';
import { getDisplayPrices } from '../lib/utils';
import { formatBRL } from '../lib/money';

const lines = [
  { label: 'PRIME', detail: 'Personalize sua peça', to: '/prime' },
  { label: 'MARK', detail: 'Estampas maiores', to: '/catalog/all?line=mark' },
  { label: 'FORCE', detail: 'Estampas pequenas', to: '/catalog/all?line=force' },
];

export function HomeCollectionStrip({ products = [] }: { products?: any[] }) {
  const [paused, setPaused] = useState(false);
  // Compare the same garment model across lines; a mixed-category minimum would mislead.
  const oversized = products.filter(product => productMatchesStorefrontCategory(product, 'oversized'));
  const startingPrice = (line: 'mark' | 'force') => {
    const prices = oversized
      .filter(product => productMatchesCommercialLine(product, line))
      .map(product => getDisplayPrices(product).effectivePrice)
      .filter(price => Number.isFinite(price) && price > 0);
    return prices.length ? Math.min(...prices) : null;
  };
  const markPrice = startingPrice('mark');
  const forcePrice = startingPrice('force');
  const comparablePrices = markPrice !== null && forcePrice !== null;
  return (
    <section id="collections" data-home-collections className="fpac-lines" aria-labelledby="home-lines-title">
      <div className="fpac-lines-heading">
        <h2 id="home-lines-title">Escolha sua linha.</h2>
        <button type="button" className="fpac-lines-toggle" aria-pressed={paused} aria-label={paused ? 'Retomar movimento das coleções' : 'Pausar movimento das coleções'} onClick={() => setPaused(value => !value)}>
          {paused ? <Play size={16} /> : <Pause size={16} />}<span>{paused ? 'Retomar' : 'Pausar'}</span>
        </button>
      </div>
      <div className="fpac-lines-viewport" data-paused={paused}>
        <div className="fpac-lines-track">
          {[0, 1, 2].map(copy => (
            <div key={copy} className="fpac-lines-group" aria-hidden={copy > 0 ? true : undefined}>
              {lines.map((line, index) => (
                <Link key={line.label} to={line.to} tabIndex={copy > 0 ? -1 : undefined} className={`fpac-line-card ${line.label === 'PRIME' ? 'fpac-line-prime' : ''}`}>
                  <span className="fpac-line-number">0{index + 1} / Coleção</span>
                  <strong>{line.label}</strong><span className="fpac-line-detail">{line.detail}</span>
                  <span className="fpac-line-price">{line.label === 'PRIME' ? 'Confira o preço ao personalizar' : comparablePrices ? `Oversized a partir de ${formatBRL(line.label === 'MARK' ? markPrice! : forcePrice!)}` : 'Ver produtos e preços'}</span>
                  <ArrowUpRight size={24} aria-hidden="true" />
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
