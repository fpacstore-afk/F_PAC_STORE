import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

const chapters = [
  { label: 'Caimento', title: 'Seu estilo começa no corte.', copy: 'Tradicional, oversized e outras formas de vestir a sua identidade.' },
  { label: 'Tecido', title: 'O detalhe faz a diferença.', copy: 'Conheça o tecido, as medidas e o acabamento de cada peça no catálogo.' },
  { label: 'Estampa', title: 'Presença em cada escolha.', copy: 'Do visual discreto da FORCE às estampas de presença da MARK.' },
  { label: 'Personalização', title: 'Sua assinatura. Sua PRIME.', copy: 'Combine modelo, cor e arte. Ajuste a posição e confira a prévia da sua peça.' },
];

export function HomeIdentityJourney({ image }: { image?: string }) {
  return (
    <section className="fpac-identity-journey" data-home-identity-journey data-motion-scene aria-labelledby="identity-journey-title">
      <div className="fpac-journey-heading" data-motion-reveal="title">
        <p className="fpac-motion-eyebrow">Do primeiro olhar à sua peça</p>
        <h2 id="identity-journey-title">Identidade em<br /><span>cada detalhe.</span></h2>
      </div>
      <div className="fpac-journey-layout">
        <div className="fpac-journey-visual">
          <div className="fpac-journey-orbit" aria-hidden="true"><span /><span /></div>
          <div className="fpac-journey-picture" data-motion-reveal="image">
            <img src={image || '/product-visuals/fpac-products-front-v1.webp'} alt="Peças da F PAC STORE" loading="lazy" decoding="async"
              onError={event => {
                if (!event.currentTarget.src.endsWith('/product-visuals/fpac-products-front-v1.webp')) event.currentTarget.src = '/product-visuals/fpac-products-front-v1.webp';
              }} />
          </div>
          <span className="fpac-journey-caption" aria-hidden="true">NÃO É SÓ ROUPA. É IDENTIDADE!</span>
        </div>
        <div className="fpac-journey-chapters">
          {chapters.map((chapter, index) => (
            <article key={chapter.label} className="fpac-journey-chapter" data-motion-reveal>
              <p className="fpac-motion-eyebrow"><span>{String(index + 1).padStart(2, '0')}</span> / {chapter.label}</p>
              <h3>{chapter.title}</h3>
              <p className="fpac-journey-copy">{chapter.copy}</p>
              {index === chapters.length - 1 && <Link to="/prime" className="fpac-motion-link">Criar minha PRIME <ArrowUpRight size={20} /></Link>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
