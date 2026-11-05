import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';

type InstallEvent = Event & {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PdvMobileInstall() {
  const [prompt, setPrompt] = useState<InstallEvent>();
  const [installed, setInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const syncDisplay = () => {
      const appleStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
      setInstalled(displayMode.matches || appleStandalone === true);
    };
    const offerInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const finishInstall = () => { setInstalled(true); setPrompt(undefined); };
    syncDisplay();
    displayMode.addEventListener('change', syncDisplay);
    window.addEventListener('beforeinstallprompt', offerInstall);
    window.addEventListener('appinstalled', finishInstall);
    if ('serviceWorker' in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register('/gestao/pdv-worker.js', { scope: '/gestao/' }).catch(() => {});
    }
    return () => {
      displayMode.removeEventListener('change', syncDisplay);
      window.removeEventListener('beforeinstallprompt', offerInstall);
      window.removeEventListener('appinstalled', finishInstall);
    };
  }, []);

  const install = async () => {
    if (!prompt) {
      setShowInstructions(previous => !previous);
      return;
    }
    setPrompt(undefined);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
    } catch {
      setShowInstructions(true);
    }
  };

  return (
    <>
      <Helmet>
        <link rel="manifest" href="/gestao/pdv.webmanifest" />
        <link rel="apple-touch-icon" href="/gestao/pdv-192.png" />
      </Helmet>
      {!installed && (
        <aside aria-label="Instalação do F PAC PDV" className="bg-black px-4 py-3 text-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold">F PAC PDV</span>
            <button type="button" onClick={install} aria-expanded={!prompt ? showInstructions : undefined}
              className="min-h-10 border border-[#eab308] px-3 py-1 text-xs font-bold text-[#eab308]">
              {prompt ? 'Instalar PDV' : 'Adicionar à tela inicial'}
            </button>
          </div>
          {showInstructions && (
            <p className="mx-auto mt-2 max-w-7xl text-xs text-white/80">
              No Android, abra esta página no Chrome e use o menu ⋮ para instalar ou adicionar à tela inicial.
              No iPhone, abra no Safari, toque em Compartilhar e escolha Adicionar à Tela de Início.
            </p>
          )}
        </aside>
      )}
    </>
  );
}
