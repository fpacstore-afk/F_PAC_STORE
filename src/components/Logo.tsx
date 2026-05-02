import React from 'react';

// Attempt to import the logo. If it fails to compile because the file is missing,
// we will handle it with a fallback in the component.
// NOTE: Since static imports throw build errors if missing, we use a relative path
// and a try-catch pattern or just a conditional check if we knew it was there.
// To fix the immediate build error, I will use a safe approach.

export const Logo: React.FC<{ className?: string }> = ({ className = "h-12 w-auto" }) => {
  const [imgError, setImgError] = React.useState(false);
  
  // We'll use the path directly. Vite will resolve it if the file exists.
  // Using a string path instead of a static import prevents the build from breaking 
  // if the file is missing during development/build.
  const logoPath = '/src/estampas/f-pac-color.png';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Brand Logo Image with Fallback */}
      {!imgError ? (
        <img 
          src={logoPath} 
          alt="F PAC STORE Logo" 
          className="h-full w-auto"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="h-full aspect-square bg-[#eab308] flex items-center justify-center rounded-sm">
          <span className="text-black font-black text-xs">F</span>
        </div>
      )}
      
      {/* Text Logo */}
      <div className="flex flex-col leading-none" translate="no">
        <span className="text-xl md:text-2xl font-heading font-black tracking-tighter text-[#eab308] italic">F PAC</span>
        <span className="text-xs font-heading font-bold tracking-[0.3em] text-white/50 -mt-0.5">STORE</span>
      </div>
    </div>
  );
};
