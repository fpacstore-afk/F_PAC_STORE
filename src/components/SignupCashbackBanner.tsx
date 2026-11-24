import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSiteFeatures } from '../hooks/useSiteFeatures';

const SESSION_KEY = 'fpac_signup_cashback_closed';
const OPT_OUT_KEY = 'fpac_signup_cashback_do_not_show';

export function SignupCashbackBanner() {
  const { user, loading: authLoading } = useAuth();
  const { signupBonusEnabled, loading: featuresLoading } = useSiteFeatures();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (authLoading || featuresLoading || !signupBonusEnabled) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(OPT_OUT_KEY)) return;
    } catch { /* Keep the invitation available when storage is blocked. */ }
    setOpen(true);
  }, [authLoading, featuresLoading, signupBonusEnabled]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const close = (remember = false) => {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
      if (remember) localStorage.setItem(OPT_OUT_KEY, '1');
    } catch { /* Closing must work even if storage is blocked. */ }
    setOpen(false);
  };

  if (!open || !signupBonusEnabled) return null;
  return <dialog ref={dialogRef} aria-labelledby="cashback-welcome-title" aria-describedby="cashback-welcome-description"
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-[#eab308]/50 bg-[#0b0b0b] p-0 text-white shadow-2xl backdrop:bg-black/75">
    <div className="relative p-6 pt-14 sm:p-9 sm:pt-14">
      <button type="button" onClick={() => close()} aria-label="Fechar aviso de cashback" autoFocus
        className="absolute right-3 top-3 grid size-11 place-items-center rounded-full text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#eab308]">
        <X size={22} aria-hidden="true" />
      </button>
      <p className="text-sm font-bold uppercase tracking-widest text-[#eab308]">Seu primeiro benefício F PAC</p>
      <h2 id="cashback-welcome-title" className="mt-3 text-3xl font-black leading-tight sm:text-4xl">{user ? <>Seu cashback está na <span className="text-[#eab308]">sua conta.</span></> : <>Crie sua conta. Ganhe <span className="text-[#eab308]">R$ 5 de cashback.</span></>}</h2>
      <p id="cashback-welcome-description" className="mt-4 text-base leading-relaxed text-white/85">{user ? 'Veja seu saldo e os benefícios disponíveis. O bônus de abertura de conta não tem prazo para usar.' : 'Bônus único, sem prazo para usar. Confirme seu e-mail para liberar o saldo.'}</p>
      <p className="mt-3 text-sm leading-relaxed text-white/70">Nas compras por link, o cashback vale para produtos do catálogo pagos por Pix e fica disponível após a entrega confirmada. Consulte as regras na sua conta.</p>
      <Link to={user ? '/account' : '/account?mode=register'} onClick={() => close()}
        className="mt-6 flex min-h-12 w-full items-center justify-center rounded-lg bg-[#eab308] px-5 py-3 text-center text-base font-black text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{user ? 'Ver meu cashback' : 'Criar conta e ganhar R$ 5'}</Link>
      <button type="button" onClick={() => close(true)}
        className="mt-3 min-h-11 w-full rounded-lg px-4 py-2 text-sm font-semibold text-white/80 underline underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-[#eab308]">Não mostrar novamente</button>
    </div>
  </dialog>;
}
