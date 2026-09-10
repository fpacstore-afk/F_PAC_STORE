import React, { useEffect } from 'react';
import PrimeCustomApproved from './PrimeCustomApproved';

export * from './PrimeCustomApproved';

/**
 * Etapa de validação visual da PRIME Custom Oversized.
 * Nesta rodada o produto é exibido somente em preto e com as vistas Frente/Costas.
 * Mantemos PrimeCustomApproved intacto para não afetar os demais fluxos antes da aprovação.
 */
export default function PrimeCustomBuilder() {
  useEffect(() => {
    const applyApprovedScope = () => {
      document.querySelectorAll('button').forEach(button => {
        const label = button.textContent?.trim();
        if (label === 'Lado') button.style.display = 'none';
        if (['Off White', 'Cinza', 'Azul Marinho', 'Verde Militar', 'Marrom'].includes(label || '')) {
          button.style.display = 'none';
        }
      });
    };

    applyApprovedScope();
    const observer = new MutationObserver(applyApprovedScope);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <PrimeCustomApproved />;
}