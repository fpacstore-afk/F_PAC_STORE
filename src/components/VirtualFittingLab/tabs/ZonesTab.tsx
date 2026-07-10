import React, { useState } from 'react';
import { Target, ShieldAlert, BadgeInfo, CheckCircle } from 'lucide-react';
import { addLog } from '../logsStore';

interface ZonesTabProps {
  onAddLog: (log: any) => void;
}

interface ZoneDetails {
  id: string;
  name: string;
  maxWidthCm: number;
  maxHeightCm: number;
  safetyMarginMm: number;
  aspectRatio: string;
  recommendedRes: string;
  description: string;
}

const SHIRT_ZONES: ZoneDetails[] = [
  {
    id: 'front',
    name: 'Frente / Peito',
    maxWidthCm: 45,
    maxHeightCm: 55,
    safetyMarginMm: 15,
    aspectRatio: '1:1.2',
    recommendedRes: '2400 x 2880 px',
    description: 'Área principal de estampagem centralizada sobre o tórax. Enquadramento ideal respeita 8cm abaixo do colarinho canelado.'
  },
  {
    id: 'back',
    name: 'Costas Completa',
    maxWidthCm: 50,
    maxHeightCm: 65,
    safetyMarginMm: 20,
    aspectRatio: '1:1.3',
    recommendedRes: '3000 x 3900 px',
    description: 'Área ampla traseira estendida. O limite inferior evita interferência com a barra reta da camisa e as costuras laterais.'
  },
  {
    id: 'leftSleeve',
    name: 'Manga Esquerda',
    maxWidthCm: 18,
    maxHeightCm: 18,
    safetyMarginMm: 10,
    aspectRatio: '1:1',
    recommendedRes: '1500 x 1500 px',
    description: 'Lateral do ombro caído até a borda superior da manga. Adequado para logos de assinaturas secundárias ou badges geométricos.'
  },
  {
    id: 'rightSleeve',
    name: 'Manga Direita',
    maxWidthCm: 18,
    maxHeightCm: 18,
    safetyMarginMm: 10,
    aspectRatio: '1:1',
    recommendedRes: '1500 x 1500 px',
    description: 'Mapeamento espelhado da manga esquerda. Permite alinhamentos idênticos ou alternâncias de branding customizado.'
  },
  {
    id: 'collar',
    name: 'Gola Ribbed (Canelada)',
    maxWidthCm: 15,
    maxHeightCm: 4,
    safetyMarginMm: 5,
    aspectRatio: '3.75:1',
    recommendedRes: '1500 x 400 px',
    description: 'Colarinho de 18cm de diâmetro. Customizações limitadas devido à compressão de malha e estiramento de costura elástica.'
  }
];

export function ZonesTab({ onAddLog }: ZonesTabProps) {
  const [selectedZoneId, setSelectedZoneId] = useState<string>('front');

  const selectedZone = SHIRT_ZONES.find(z => z.id === selectedZoneId) || SHIRT_ZONES[0];

  const handleSelectZone = (id: string, name: string) => {
    setSelectedZoneId(id);
    const log = addLog('info', 'Áreas Personalizáveis', `Visualização focada na zona: "${name}"`, 'info');
    onAddLog(log);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Zones Selector (Left) */}
        <div className="lg:col-span-6 bg-white p-5 rounded-lg border border-zinc-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b pb-3 mb-2 text-zinc-950">
            <Target size={18} />
            <h3 className="font-black text-xs uppercase tracking-widest">Selecione uma Zona Geométrica</h3>
          </div>

          <div className="space-y-2.5">
            {SHIRT_ZONES.map(zone => (
              <div 
                key={zone.id}
                onClick={() => handleSelectZone(zone.id, zone.name)}
                className={`p-3.5 rounded border cursor-pointer transition-all flex justify-between items-center ${
                  selectedZoneId === zone.id 
                    ? 'border-black bg-zinc-50' 
                    : 'border-zinc-200 hover:border-zinc-300 bg-white'
                }`}
              >
                <div>
                  <h4 className="font-extrabold text-xs text-zinc-900">{zone.name}</h4>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{zone.maxWidthCm}cm x {zone.maxHeightCm}cm máx</p>
                </div>
                {selectedZoneId === zone.id ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Zone Details panel (Right) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-zinc-900 text-zinc-300 p-5 rounded-lg border border-zinc-800 space-y-5">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-white">
              <BadgeInfo size={18} className="text-amber-500" />
              <h3 className="font-black text-xs uppercase tracking-widest">Parâmetros de Produção da Zona</h3>
            </div>

            <div className="space-y-4">
              {/* Description */}
              <div>
                <span className="text-[9px] text-zinc-500 uppercase font-black tracking-wider block">Descrição da Zona</span>
                <p className="text-xs text-zinc-300 leading-relaxed mt-1">{selectedZone.description}</p>
              </div>

              {/* Grid Specifications */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="bg-zinc-800/60 p-3 rounded border border-zinc-800">
                  <span className="text-[9px] text-zinc-400 font-extrabold uppercase tracking-wider block">Limites de Sizing</span>
                  <span className="text-sm font-black text-white mt-0.5 block">{selectedZone.maxWidthCm} x {selectedZone.maxHeightCm} cm</span>
                </div>
                <div className="bg-zinc-800/60 p-3 rounded border border-zinc-800">
                  <span className="text-[9px] text-zinc-400 font-extrabold uppercase tracking-wider block">Margem de Segurança</span>
                  <span className="text-sm font-black text-white mt-0.5 block">{selectedZone.safetyMarginMm} mm</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-800/60 p-3 rounded border border-zinc-800">
                  <span className="text-[9px] text-zinc-400 font-extrabold uppercase tracking-wider block">Aspect Ratio</span>
                  <span className="text-sm font-black text-white mt-0.5 block">{selectedZone.aspectRatio}</span>
                </div>
                <div className="bg-zinc-800/60 p-3 rounded border border-zinc-800">
                  <span className="text-[9px] text-zinc-400 font-extrabold uppercase tracking-wider block">Resolução Recomendada</span>
                  <span className="text-sm font-black text-white mt-0.5 block">{selectedZone.recommendedRes}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-zinc-500 border-t border-zinc-800 pt-3">
              <CheckCircle size={12} className="text-emerald-500" /> Coordenadas UV correspondentes isoladas na produção.
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-zinc-200 shadow-sm text-xs text-zinc-600 leading-relaxed flex items-start gap-2">
            <ShieldAlert size={16} className="text-zinc-900 mt-0.5 shrink-0" />
            <div>
              <span className="font-extrabold text-zinc-900">Nota de Segurança Têxtil:</span> O respeito aos limites máximos evita que as estampas alcancem costuras estruturais de overloque, garantindo uma aplicação limpa de transfer térmico de silicone no algodão 260GSM.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
