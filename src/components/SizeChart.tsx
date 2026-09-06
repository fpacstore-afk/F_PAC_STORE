import React from 'react';
import { useLocation } from 'react-router-dom';

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
          <g className="font-extrabold font-sans uppercase">
            {/* Height label */}
            <rect x="34" y="46" width="32" height="16" rx="1" fill="white" stroke="#eab308" strokeWidth="2" />
            <text x="50" y="58" textAnchor="middle" className="fill-[#eab308] text-[11px] font-black" stroke="none">{data.height}CM</text>
            
            {/* Width label */}
            <rect x="34" y="64" width="32" height="16" rx="1" fill="white" stroke="black" strokeWidth="2" />
            <text x="50" y="76" textAnchor="middle" className="fill-black text-[11px] font-black" stroke="none">{data.width}CM</text>
            
            {/* Sleeve label */}
            <rect x="72" y="22" width="32" height="16" rx="1" fill="white" stroke="#eab308" strokeWidth="2" />
            <text x="88" y="34" textAnchor="middle" className="fill-[#eab308] text-[11px] font-black" stroke="none">{data.sleeve}CM</text>
          </g>
        </svg>
      </div>
      <div className="text-center">
        <span className="text-2xl font-black uppercase text-black italic tracking-tighter">{data.size}</span>
      </div>
    </div>
  );
};

const tableRows = [
  { size: 'P', length: '70 cm', width: '58 cm', sleeve: '23 cm', notes: 'Modelagem Oversized Premium' },
  { size: 'M', length: '72 cm', width: '60 cm', sleeve: '24 cm', notes: 'Modelagem Oversized Premium' },
  { size: 'G', length: '74 cm', width: '62 cm', sleeve: '25 cm', notes: 'Modelagem Oversized Premium' },
  { size: 'GG', length: '76 cm', width: '64 cm', sleeve: '26 cm', notes: 'Modelagem Oversized Premium' },
  { size: 'XG', length: '78 cm', width: '66 cm', sleeve: '27 cm', notes: 'Modelagem Oversized Premium' },
];

interface SizeChartProps {
  onClose?: () => void;
  customData?: { size: string; length: string; width: string; sleeve: string; notes?: string }[];
}

export function SizeChart({ onClose, customData }: SizeChartProps) {
  const location = useLocation();

  // The home page used to render a global oversized chart. Product measurements now
  // belong exclusively to product pages so future garments can have their own sizing.
  if (location.pathname === '/') return null;

  const hasCustomData = Boolean(customData && customData.length > 0);
  const activeRows = hasCustomData ? customData! : tableRows;

  return (
    <div id="guia-de-medidas" className="max-w-4xl mx-auto mt-4 md:mt-12 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700 px-4 scroll-mt-24">
      <div className="text-center mb-10">
        <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter italic mb-3 text-zinc-950">
          TABELA DE <span className="text-[#eab308]">MEDIDAS</span>
        </h2>
        <div className="h-1.5 w-24 bg-[#eab308] mx-auto mb-4" />
        
        <div className="bg-amber-500/10 border border-[#eab308]/30 rounded-2xl p-4 max-w-lg mx-auto mb-6">
          <p className="text-xs font-black uppercase tracking-wider text-zinc-950">
            ⚠️ Confira suas medidas antes de escolher o tamanho.
          </p>
          <p className="text-[10px] text-gray-600 uppercase font-bold tracking-wide mt-1">
            {hasCustomData
              ? 'Compare as medidas deste produto com uma peça semelhante do seu guarda-roupa.'
              : 'Nossa modelagem é streetwear oversized. Compare com uma peça do seu guarda-roupa.'}
          </p>
        </div>
      </div>

      {/* The illustrated oversized shirt is only shown for the legacy oversized chart.
          Product-specific charts use their own measurements without an incorrect garment drawing. */}
      {!hasCustomData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 justify-items-center mb-12">
          {sizes.map((item) => (
            <ShirtDrawing key={item.size} data={item} />
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm mb-10">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950 text-white font-mono text-[10px] uppercase font-black tracking-widest border-b border-zinc-800">
                <th className="p-3.5 pl-5">Tamanho</th>
                <th className="p-3.5">Comprimento</th>
                <th className="p-3.5">Largura</th>
                <th className="p-3.5">Manga</th>
                <th className="p-3.5 pr-5">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-sans text-xs">
              {activeRows.map((row, idx) => (
                <tr key={row.size || idx} className="hover:bg-neutral-50/80 transition-colors">
                  <td className="p-3.5 pl-5 font-black text-zinc-950 font-mono text-sm">{row.size}</td>
                  <td className="p-3.5 font-bold text-zinc-800">{row.length}</td>
                  <td className="p-3.5 font-bold text-zinc-800">{row.width}</td>
                  <td className="p-3.5 font-bold text-zinc-800">{row.sleeve}</td>
                  <td className="p-3.5 pr-5 text-gray-500 font-medium uppercase text-[10px]">{row.notes || 'Confira o caimento deste produto'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!hasCustomData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-[10px] md:text-[11px] uppercase font-black tracking-[0.25em] text-black text-center mb-12">
          <div className="flex flex-col gap-4 items-center group">
              <span className="w-10 h-10 rounded-full bg-[#eab308]/10 border border-[#eab308]/30 flex items-center justify-center text-[#eab308] group-hover:bg-[#eab308] group-hover:text-black transition-colors">
                <div className="w-2 h-2 rounded-full bg-current" />
              </span>
              <span className="opacity-60">ALTURA: Do ombro até a barra</span>
          </div>
          <div className="flex flex-col gap-4 items-center group">
              <span className="w-10 h-10 rounded-full bg-black/5 border border-black/10 flex items-center justify-center text-black group-hover:bg-black group-hover:text-white transition-colors">
                <div className="w-2 h-2 rounded-full bg-current" />
              </span>
              <span className="opacity-60">LARGURA: De uma axila a outra</span>
          </div>
          <div className="flex flex-col gap-4 items-center group">
              <span className="w-10 h-10 rounded-full bg-[#eab308]/10 border border-[#eab308]/30 flex items-center justify-center text-[#eab308] group-hover:bg-[#eab308] group-hover:text-black transition-colors">
                <div className="w-2 h-2 rounded-full bg-current" />
              </span>
              <span className="opacity-60">MANGA: Do ombro até o punho</span>
          </div>
        </div>
      )}
      
      <p className="mt-12 text-center text-[9px] text-gray-400 font-extrabold uppercase tracking-[0.4em] border-t border-black/[0.03] pt-8">
        * As medidas podem variar até 2cm para mais ou para menos.
      </p>
    </div>
  );
}

export function MiniSizeChart() {
  return (
    <div className="flex justify-between items-center bg-[#f5f5f5] p-2.5 px-3 gap-2.5 rounded-xl my-4 w-full max-w-[220px] mx-auto border border-black/[0.03]">
      {sizes.map((item) => (
        <div key={item.size} className="flex flex-col items-center flex-1 gap-1 min-w-0">
          <div className="relative w-6 h-6 flex items-center justify-center">
            <svg viewBox="0 0 100 110" className="w-full h-full text-black/20 fill-none stroke-current stroke-[4]">
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
          </div>
          <div className="flex flex-col items-center -space-y-0.5">
            <span className="text-[9px] font-black uppercase text-black leading-none">{item.size}</span>
            <span className="text-[6px] text-gray-400 font-bold tracking-tighter leading-none tabular-nums">
              {item.height}x{item.width}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
