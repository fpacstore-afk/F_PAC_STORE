import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSiteFeatures } from '../hooks/useSiteFeatures';

export function SignupCashbackBanner({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { signupBonusEnabled } = useSiteFeatures();
  if (!signupBonusEnabled) return null;
  if (compact) return <section aria-label="Bônus de cadastro F PAC" className="border-b-2 border-[#eab308] bg-[#0b0b0b] px-4 py-3 text-white">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 text-sm">
      <p><strong className="text-[#eab308]">R$ 5 de cashback</strong> ao criar sua conta, sem vencimento. <span className="hidden sm:inline">Confirme seu e-mail para usar.</span></p>
      <Link to={user ? '/account' : '/account?mode=register'} className="min-h-11 rounded bg-[#eab308] px-4 py-2.5 font-bold text-black">{user ? 'Minha conta' : 'Criar conta'}</Link>
    </div>
  </section>;
  return <section aria-label="Bônus de cadastro F PAC" className="border-b-4 border-[#eab308] bg-[#0b0b0b] px-4 py-8 text-white sm:py-10">
    <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-[#eab308]">Seu primeiro benefício F PAC</p>
        <h2 className="mt-2 text-3xl font-black leading-tight sm:text-5xl">Crie sua conta. Ganhe <span className="text-[#eab308]">R$ 5 de cashback.</span></h2>
        <p className="mt-3 max-w-3xl text-base text-white/85">Bônus único ao criar a conta, sem prazo para usar; disponível depois de confirmar o e-mail. Cashback das compras por link somente com Pix e produtos do catálogo; liberado na entrega confirmada. Confira as regras na sua conta.</p>
      </div>
      <Link to={user ? '/account' : '/account?mode=register'} className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-lg bg-[#eab308] px-6 py-3 text-base font-black text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
        {user ? 'Ver meu cashback' : 'Criar conta e ganhar R$ 5'}
      </Link>
    </div>
  </section>;
}
