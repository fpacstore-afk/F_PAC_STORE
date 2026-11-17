import { Link } from 'react-router-dom';

const values = [
  ['Identidade própria', 'Valorizamos a liberdade de escolher como se vestir e o que cada peça comunica.'],
  ['Cuidado no acabamento', 'Conferimos a peça, a estampa e o acabamento em cada etapa da produção.'],
  ['Clareza na compra', 'Explicamos as opções, medidas e prazos para você decidir com segurança.'],
  ['Respeito no atendimento', 'Ouvimos, cumprimos o combinado e tratamos cada pedido com responsabilidade.'],
];

export default function About() {
  return <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-16">
    <header className="grid items-center gap-8 border-b border-black/15 pb-10 md:grid-cols-2">
      <div>
        <p className="text-sm font-black uppercase tracking-wider text-neutral-600">Sobre a F PAC STORE · Joinville, SC</p>
        <h1 className="mt-3 text-4xl font-black uppercase leading-none tracking-tight text-black sm:text-6xl">Vista sua identidade.</h1>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-neutral-700 sm:text-lg">A F PAC STORE cria roupas streetwear e peças personalizadas para quem quer expressar seu estilo. Do caimento à estampa, cada detalhe faz parte da escolha.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/produtos" className="inline-flex min-h-11 items-center bg-[#eab308] px-5 font-black text-black">Ver produtos</Link>
          <Link to="/prime" className="inline-flex min-h-11 items-center border border-black px-5 font-black text-black">Personalizar uma peça</Link>
        </div>
      </div>
      <img src="/product-visuals/fpac-products-front-v1.webp" alt="Peças de vestuário da F PAC STORE" className="aspect-[4/3] w-full bg-neutral-100 object-contain" />
    </header>
    <div className="grid gap-6 py-10 md:grid-cols-2">
      <section className="border-l-4 border-[#eab308] pl-4"><h2 className="text-xl font-black text-black">Missão</h2><p className="mt-2 leading-relaxed text-neutral-700">Criar roupas streetwear e personalizadas que expressem a identidade de quem veste, com cuidado na escolha das peças, na aplicação das estampas e no atendimento.</p></section>
      <section className="border-l-4 border-[#eab308] pl-4"><h2 className="text-xl font-black text-black">Visão</h2><p className="mt-2 leading-relaxed text-neutral-700">Ser reconhecida como uma marca de streetwear e personalização de Joinville, com uma experiência de compra online confiável e capacidade de atender clientes em outras regiões.</p></section>
    </div>
    <section className="border-t border-black/15 pt-8" aria-labelledby="brand-values">
      <h2 id="brand-values" className="text-2xl font-black text-black">Valores</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{values.map(([title, detail]) =>
        <div key={title} className="bg-neutral-100 p-4"><dt className="font-black text-black">{title}</dt><dd className="mt-1 text-sm leading-relaxed text-neutral-700">{detail}</dd></div>
      )}</dl>
    </section>
  </div>;
}
