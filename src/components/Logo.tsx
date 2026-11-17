import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { StorefrontImage } from './StorefrontImage';

export const Logo: React.FC<{ className?: string }> = ({ className = "h-12 w-auto" }) => {
  const [dynamicLogo, setDynamicLogo] = useState<string | null>(null);
  
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'config', 'brand'), (snapshot) => {
      if (snapshot.exists()) {
        setDynamicLogo(snapshot.data().logoUrl || null);
      }
    }, () => setDynamicLogo(null));
    return () => unsubscribe();
  }, []);

  // Default path for the logo in the public folder as fallback
  const defaultLogoPath = '/estampas/logo-fpac-192.webp';
  const logoSrc = dynamicLogo || defaultLogoPath;

  if (!logoSrc) return null;

  return (
    <div className={`flex items-center ${className}`}>
      {/* Brand Logo Image */}
      <StorefrontImage
        src={logoSrc} 
        sizes="80px"
        fallback={defaultLogoPath}
        alt="F PAC STORE Logo" 
        className="h-full w-auto object-contain"
        onError={(e) => {
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
