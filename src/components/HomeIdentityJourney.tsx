import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { StorefrontImage } from './StorefrontImage';

const fallback = '/product-visuals/fpac-products-front-v1.webp';
const details = [
  { title: 'O caimento', copy: 'Veja a peça no corpo.' },
  { title: 'De perto', copy: 'Explore os detalhes de cada modelo.' },
  { title: 'Sua identidade', copy: 'Escolha a estampa que combina com você.' },
];

export function HomeIdentityJourney({ image, detailImage }: { image?: string; detailImage?: string }) {
  return (
    <section className="fpac-detail-section" data-home-identity-journey aria-labelledby="identity-journey-title">
      <div className="fpac-detail-panel">
        <div className="fpac-detail-copy" data-motion-reveal>
          <p className="fpac-detail-eyebrow">Olhe mais de perto</p>
          <h2 id="identity-journey-title">Identidade em<br /><span>cada detalhe.</span></h2>
          <p className="fpac-detail-intro">O corte, a estampa e o jeito de vestir.<br />Descubra os detalhes da sua próxima peça.</p>
          <div className="fpac-detail-points">
            {details.map((detail, index) => <div key={detail.title}><span>0{index + 1}</span><h3>{detail.title}</h3><p>{detail.copy}</p></div>)}
          </div>
          <Link to="/catalog/all" className="fpac-detail-link">Explore as peças <ArrowUpRight size={16} /></Link>
        </div>
        <div className="fpac-detail-images" data-motion-reveal="image">
          <div className="fpac-detail-main"><StorefrontImage src={image} fallback={fallback} sizes="(max-width: 767px) 90vw, 550px" alt="Peça da coleção F PAC" loading="lazy" decoding="async" /></div>
          <figure><StorefrontImage src={image} fallback={fallback} sizes="(max-width: 767px) 43vw, 270px" alt="Aproximação da peça F PAC" loading="lazy" decoding="async" /><figcaption>Detalhe da peça</figcaption></figure>
          <figure><StorefrontImage src={detailImage || image} fallback={fallback} sizes="(max-width: 767px) 43vw, 270px" alt="Visual da coleção F PAC" loading="lazy" decoding="async" /><figcaption>Estampa em foco</figcaption></figure>
        </div>
      </div>
    </section>
  );
}
