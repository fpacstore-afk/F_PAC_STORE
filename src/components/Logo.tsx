import React from 'react';

// Attempt to import the logo. If it fails to compile because the file is missing,
// we will handle it with a fallback in the component.
// NOTE: Since static imports throw build errors if missing, we use a relative path
// and a try-catch pattern or just a conditional check if we knew it was there.
// To fix the immediate build error, I will use a safe approach.

export const Logo: React.FC<{ className?: string }> = ({ className = "h-12 w-auto" }) => {
  // Path for the logo in the public folder
  const logoPath = '/estampas/logo-fpac.png';

  return (
    <div className={`flex items-center ${className}`}>
      {/* Brand Logo Image */}
      <img 
        src={logoPath} 
        alt="F PAC STORE Logo" 
        className="h-full w-auto object-contain"
        onError={(e) => {
          // If image fails, show text-only logo
          e.currentTarget.style.display = 'none';
          const sibling = e.currentTarget.nextElementSibling as HTMLElement;
          if (sibling) sibling.style.display = 'flex';
        }}
      />
      
      {/* Fallback Text Logo - Hidden by default if image loads */}
      <div className="hidden flex-col leading-none" translate="no" style={{ display: 'none' }}>
        <span className="text-xl md:text-2xl font-heading font-black tracking-tighter text-[#eab308] italic">F PAC</span>
        <span className="text-xs font-heading font-bold tracking-[0.3em] text-white/50 -mt-0.5">STORE</span>
      </div>
    </div>
  );
};
