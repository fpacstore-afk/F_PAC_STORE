import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { safeStorage } from '../lib/storage';
import type { StyleType } from '../../shared/identityQuiz';

export function StyleRecommendationBanner() {
  const navigate = useNavigate();
  const [style, setStyle] = useState<StyleType | null>(null);

  useEffect(() => {
    const loadStyle = () => {
      const saved = safeStorage.getItem('fpac_user_style');
      setStyle(saved === 'force' || saved === 'mark' || saved === 'prime' ? saved : null);
    };
    loadStyle();
    window.addEventListener('fpac_style_changed', loadStyle);
    return () => window.removeEventListener('fpac_style_changed', loadStyle);
  }, []);

  if (!style) return null;

  return (
    <div className="w-full border-y border-white/10 bg-[#08080c] px-4 py-3 text-white md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 md:flex-row">
        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-4 sm:text-left">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-sm">⚡</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308]">Identidade sintonizada:</span>
            <span className="bg-[#eab308] px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-black">{style.toUpperCase()}</span>
          </div>
          <p className="line-clamp-1 max-w-xl font-sans text-[10px] font-medium italic text-white/60 md:text-xs">
            Seu perfil combina com a linha {style.toUpperCase()}. Explore os produtos e encontre sua próxima peça.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <button type="button" onClick={() => navigate(`/model/${style}`)} className="bg-[#eab308] px-4 py-2 text-center text-[9px] font-black uppercase tracking-[0.15em] text-black transition-all hover:bg-white">Ver coleção</button>
          <button type="button" onClick={() => window.dispatchEvent(new Event('fpac_open_quiz'))} className="flex items-center gap-1.5 border-0 bg-transparent text-[9px] font-black uppercase tracking-[0.15em] text-white/60 transition-all hover:text-[#eab308] hover:underline">
            <RefreshCw size={10} /> Mudar estilo
          </button>
        </div>
      </div>
    </div>
  );
}
