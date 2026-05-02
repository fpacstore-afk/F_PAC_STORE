import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "h-12 w-auto" }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Hexagonal Crest Icon */}
      <svg 
        viewBox="0 0 100 115" 
        className="h-full w-auto"
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path 
          d="M50 0L93.3013 25V75L50 100L6.69873 75V25L50 0Z" 
          fill="#111" 
          className="stroke-[#eab308] stroke-[5px]"
        />
        {/* Stylized 'F' */}
        <path 
          d="M35 30H65V40H45V50H60V60H45V75H35V30Z" 
          fill="white" 
        />
        {/* Stylized 'P' overlapping (simplified) */}
        <path 
          d="M55 45H75C80 45 83 48 83 52.5C83 57 80 60 75 60H55V45ZM62 50V55H75C77 55 78 54 78 52.5C78 51 77 50 75 50H62Z" 
          fill="#eab308" 
        />
      </svg>
      {/* Text Logo */}
      <div className="flex flex-col leading-none" translate="no">
        <span className="text-xl md:text-2xl font-heading font-black tracking-tighter text-[#eab308] italic">F PAC</span>
        <span className="text-xs font-heading font-bold tracking-[0.3em] text-white/50 -mt-0.5">STORE</span>
      </div>
    </div>
  );
};
