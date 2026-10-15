import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

const fallback = '/product-visuals/fpac-products-front-v1.webp';
const details = [
  { title: 'O caimento', copy: 'Veja a peça no corpo.' },
  { title: 'De perto', copy: 'Explore os detalhes de cada modelo.' },
  { title: 'Sua identidade', copy: 'Escolha a estampa que combina com você.' },
];

export function HomeIdentityJourney({ image, detailImage }: { image?: string; detailImage?: string }) {
  const handleError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    if (!event.currentTarget.src.endsWith(fallback)) event.currentTarget.src = fallback;
  };
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
          <img className="fpac-detail-main" src={image || fallback} alt="Peça da coleção F PAC" loading="lazy" decoding="async" onError={handleError} />
          <figure><img src={image || fallback} alt="Aproximação da peça F PAC" loading="lazy" decoding="async" onError={handleError} /><figcaption>Detalhe da peça</figcaption></figure>
          <figure><img src={detailImage || image || fallback} alt="Visual da coleção F PAC" loading="lazy" decoding="async" onError={handleError} /><figcaption>Estampa em foco</figcaption></figure>
        </div>
      </div>
    </section>
  );
}
