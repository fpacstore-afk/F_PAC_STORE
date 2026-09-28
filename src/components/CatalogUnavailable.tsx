import React from 'react';

export function CatalogUnavailable() {
  return (
    <div role="alert" className="mx-auto my-6 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-black">
      <h2 className="text-lg font-black">Catálogo temporariamente indisponível</h2>
      <p className="mt-2 text-sm">Não foi possível consultar os produtos agora. Tente novamente em instantes ou fale com a F PAC.</p>
      <a href="https://wa.me/5547997465602" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-black px-5 text-sm font-bold text-white">Falar com a F PAC</a>
    </div>
  );
}
