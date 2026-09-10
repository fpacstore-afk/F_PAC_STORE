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

      document.querySelectorAll('b').forEach(label => {
        if (label.textContent?.trim() !== 'ÁREA MÁXIMA DE ESTAMPA') return;
        const guideText = label.parentElement;
        const box = guideText?.parentElement;
        if (!guideText || !box) return;
        guideText.style.display = 'none';
        box.style.width = '30%';
        box.style.maxWidth = '220px';
        box.style.borderColor = '#35a86b';
        box.style.boxShadow = 'none';
        box.style.background = 'transparent';
      });
    };

    applyApprovedScope();
    const observer = new MutationObserver(applyApprovedScope);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <PrimeCustomApproved />;
}