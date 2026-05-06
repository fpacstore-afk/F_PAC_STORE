import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export const Logo: React.FC<{ className?: string }> = ({ className = "h-12 w-auto" }) => {
  const [dynamicLogo, setDynamicLogo] = useState<string | null>(null);
  
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'config', 'brand'), (snapshot) => {
      if (snapshot.exists()) {
        setDynamicLogo(snapshot.data().logoUrl || null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Default path for the logo in the public folder as fallback
  const defaultLogoPath = '/estampas/logo-fpac.png';
  const logoSrc = dynamicLogo || defaultLogoPath;

  return (
    <div className={`flex items-center ${className}`}>
      {/* Brand Logo Image */}
      <img 
        src={logoSrc} 
        alt="F PAC STORE Logo" 
        className="h-full w-auto object-contain"
        onError={(e) => {
          // If image fails and it's not the default one, try the default one
          if (dynamicLogo && e.currentTarget.src !== window.location.origin + defaultLogoPath) {
             setDynamicLogo(null);
          } else {
            // If even default fails, show text-only logo
            e.currentTarget.style.display = 'none';
            const sibling = e.currentTarget.nextElementSibling as HTMLElement;
            if (sibling) sibling.style.display = 'flex';
          }
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
