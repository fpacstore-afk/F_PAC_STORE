import { useEffect, useState } from 'react';
import { privacyChoice, savePrivacyChoice, type PrivacyChoice, PRIVACY_EVENT } from '../services/privacyPreferences';

export function PrivacyPreferences() {
  const [visible, setVisible] = useState(() => privacyChoice() === null);
  useEffect(() => {
    const open = () => setVisible(true);
    const changed = () => setVisible(privacyChoice() === null);
    window.addEventListener('fpac:open-privacy', open);
    window.addEventListener(PRIVACY_EVENT, changed);
    window.addEventListener('storage', changed);
    return () => { window.removeEventListener('fpac:open-privacy', open); window.removeEventListener(PRIVACY_EVENT, changed); window.removeEventListener('storage', changed); };
  }, []);
  const choose = (choice: PrivacyChoice) => { savePrivacyChoice(choice); setVisible(false); };
  if (!visible) return null;
  return <section aria-label="Preferências de privacidade" className="fixed inset-x-3 bottom-3 z-[150] mx-auto max-w-3xl rounded-2xl border border-black/15 bg-white p-4 text-black shadow-2xl md:flex md:items-center md:gap-5">
    <div className="flex-1"><p className="text-sm font-black">Sua privacidade</p><p className="mt-1 text-xs leading-relaxed text-black/70">A sacola e o acesso à conta são essenciais. Você escolhe se permite estatísticas opcionais de navegação para melhorar a loja. Altere sua escolha no rodapé a qualquer momento.</p></div>
    <div className="mt-3 grid grid-cols-2 gap-2 md:mt-0 md:w-72"><button onClick={() => choose('essential')} className="min-h-11 rounded-lg border border-black px-3 py-2 text-xs font-bold">Somente essenciais</button><button onClick={() => choose('analytics')} className="min-h-11 rounded-lg border border-black px-3 py-2 text-xs font-bold">Permitir estatísticas</button></div>
  </section>;
}
