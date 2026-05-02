import React from 'react';

type LogoProps = {
  className?: string;
};

export const Logo: React.FC<LogoProps> = ({ className = "h-12 w-auto" }) => {
  const [imgError, setImgError] = React.useState(false);

  // Caminho correto (imagem deve estar em /public/estampas/)
  const logoPath = '/estampas/f-pac-color.png';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      
      {/* Logo com fallback */}
      {!imgError ? (
        <img
          src={logoPath}
          alt="F PAC STORE Logo"
          className="h-full w-auto"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="h-full aspect-square bg-[#eab308] flex items-center justify-center rounded-sm">
          <span className="text-black font-black text-xs">F</span>
        </div>
      )}

      {/* Texto da marca */}
      <div className="flex flex-col leading-none" translate="no">
        <span className="text-xl md:text-2xl font-heading font-black tracking-tighter text-[#eab308] italic">
          F PAC
        </span>
        <span className="text-xs font-heading font-bold tracking-[0.3em] text-white/50 -mt-0.5">
          STORE
        </span>
      </div>

    </div>
  );
};
