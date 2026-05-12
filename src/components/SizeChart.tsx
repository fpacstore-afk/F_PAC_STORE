import React from 'react';

interface SizeData {
  size: string;
  height: number;
  width: number;
  sleeve: number;
}

const sizes: SizeData[] = [
  { size: 'P', height: 71, width: 44, sleeve: 22 },
  { size: 'M', height: 74, width: 54, sleeve: 24 },
  { size: 'G', height: 76, width: 61, sleeve: 25 },
  { size: 'GG', height: 79, width: 64, sleeve: 26 },
];

interface ShirtDrawingProps {
  data: SizeData;
}

const ShirtDrawing: React.FC<ShirtDrawingProps> = ({ data }) => {
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-[260px]">
      <div className="relative w-full aspect-[4/5] bg-white border border-black/10 p-6 flex items-center justify-center shadow-md">
        <svg viewBox="0 0 100 120" className="w-full h-full text-black fill-none stroke-black stroke-[2.5]">
          {/* T-Shirt Shape - Oversized Look */}
          <path d="
            M 38 10 
            Q 50 14 62 10 
            L 80 20 
            L 96 45 
            L 86 52 
            L 80 48 
            L 80 110 
            L 20 110 
            L 20 48 
            L 14 52 
            L 4 45 
            L 20 20 
            Z
          " strokeLinejoin="round" />
          
          {/* Height Line (Altura) */}
          <g className="stroke-[#eab308] stroke-[2] stroke-dasharray-[2,2]">
            <path d="M50 12 L50 110" />
            <path d="M46 12 L54 12" className="stroke-dasharray-none stroke-[2.5]" />
            <path d="M46 110 L54 110" className="stroke-dasharray-none stroke-[2.5]" />
          </g>
          
          {/* Width Line (Largura) */}
          <g className="stroke-[#eab308] stroke-[2] stroke-dasharray-[2,2]">
            <path d="M20 70 L80 70" />
            <path d="M20 65 L20 75" className="stroke-dasharray-none stroke-[2.5]" />
            <path d="M80 65 L80 75" className="stroke-dasharray-none stroke-[2.5]" />
          </g>
          
          {/* Sleeve Line (Manga) */}
          <g className="stroke-[#eab308] stroke-[2] stroke-dasharray-[2,2]">
            <path d="M62 10 L96 45" /> 
            <circle cx="62" cy="10" r="2.5" fill="#eab308" className="stroke-none" />
            <circle cx="96" cy="45" r="2.5" fill="#eab308" className="stroke-none" />
          </g>
 
          {/* Value Labels with background */}
          <g className="font-black font-sans uppercase">
            {/* Height label */}
            <rect x="38" y="52" width="24" height="12" rx="2" fill="white" fillOpacity="0.95" stroke="#eab308" strokeWidth="1" />
            <text x="50" y="61" textAnchor="middle" className="fill-[#eab308] text-[10px]" stroke="none">{data.height}cm</text>
            
            {/* Width label */}
            <rect x="38" y="72" width="24" height="12" rx="2" fill="white" fillOpacity="0.95" stroke="black" strokeWidth="1" />
            <text x="50" y="81" textAnchor="middle" className="fill-black text-[10px]" stroke="none">{data.width}cm</text>
            
            {/* Sleeve label */}
            <rect x="74" y="24" width="24" height="12" rx="2" fill="white" fillOpacity="0.95" stroke="#eab308" strokeWidth="1" />
            <text x="86" y="33" textAnchor="middle" className="fill-[#eab308] text-[10px]" stroke="none">{data.sleeve}cm</text>
          </g>
        </svg>
      </div>
      <div className="text-center">
        <span className="text-2xl font-black uppercase text-black italic tracking-tighter">{data.size}</span>
      </div>
    </div>
  );
};

export function SizeChart() {
  return (
    <div className="mt-12 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-4 mb-8">
        <div className="h-px bg-black/10 flex-1" />
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-black">Tabela de Medidas</h3>
        <div className="h-px bg-black/10 flex-1" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 justify-items-center mb-8">
        {sizes.map((item) => (
          <ShirtDrawing key={item.size} data={item} />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[11px] uppercase font-bold tracking-widest text-gray-500 text-center">
        <div className="flex flex-col gap-2 items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-[#eab308]" />
            <span>ALTURA: Do ombro até a barra</span>
        </div>
        <div className="flex flex-col gap-2 items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-[#eab308]" />
            <span>LARGURA: De uma axila a outra</span>
        </div>
        <div className="flex flex-col gap-2 items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-[#eab308]" />
            <span>MANGA: Do ombro até o punho</span>
        </div>
      </div>
      
      <p className="mt-8 text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest">
        * As medidas podem variar até 2cm para mais ou para menos.
      </p>
    </div>
  );
}

export function MiniSizeChart() {
  return (
    <div className="flex justify-between items-center bg-black/5 p-2 gap-1 rounded-sm my-3">
      {sizes.map((item) => (
        <div key={item.size} className="flex flex-col items-center flex-1">
          <svg viewBox="0 0 100 110" className="w-6 h-6 text-black/40 fill-none stroke-current stroke-[2]">
             <path d="
              M 38 10 
              Q 50 14 62 10 
              L 80 20 
              L 95 45 
              L 85 52 
              L 80 48 
              L 80 110 
              L 20 110 
              L 20 48 
              L 15 52 
              L 5 45 
              L 20 20 
              Z
            " strokeLinejoin="round" />
          </svg>
          <span className="text-[8px] font-black">{item.size}</span>
          <div className="flex flex-col text-[7px] leading-tight text-gray-400 font-black items-center">
            <span>{item.height}x{item.width}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
