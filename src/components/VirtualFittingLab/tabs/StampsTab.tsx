import React, { useState, useRef } from 'react';
import { Upload, Trash2, Sliders, Image as ImageIcon, Move, CheckSquare } from 'lucide-react';
import { LabStamp } from '../types';
import { addLog } from '../logsStore';
import toast from 'react-hot-toast';

interface StampsTabProps {
  onAddLog: (log: any) => void;
}

const PRESET_TEST_STAMPS: LabStamp[] = [
  { id: 'tstamp-1', name: 'F PAC Signature', url: '/estampas/F-PAC-ESCRITA-peito C.png', scaleX: 1.0, scaleY: 1.0, posX: 0, posY: 0, rotation: 0 },
  { id: 'tstamp-2', name: 'F PAC Full Crown Logo', url: '/estampas/logo-fpac.png', scaleX: 1.0, scaleY: 1.0, posX: 0, posY: 0, rotation: 0 },
  { id: 'tstamp-3', name: 'Grafismo Neo-Vintage', url: '/estampas/f-pac-peito-central-neo.png', scaleX: 0.8, scaleY: 0.8, posX: 0, posY: 0, rotation: 0 }
];

export function StampsTab({ onAddLog }: StampsTabProps) {
  const [stamps, setStamps] = useState<LabStamp[]>(PRESET_TEST_STAMPS);
  const [selectedStampId, setSelectedStampId] = useState<string>('tstamp-1');
  const [activeZone, setActiveZone] = useState<string>('front');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedStamp = stamps.find(s => s.id === selectedStampId) || stamps[0];

  const handleUpdateStamp = (key: keyof LabStamp, val: any) => {
    if (!selectedStamp) return;
    const updated = stamps.map(s => {
      if (s.id === selectedStamp.id) {
        return { ...s, [key]: val };
      }
      return s;
    });
    setStamps(updated);
  };

  const logSliderRelease = (name: string, value: any) => {
    const log = addLog('modification', 'Mapeamento de Estampas', `Ajuste de estampa "${selectedStamp?.name}": ${name} para ${value}`, 'info');
    onAddLog(log);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem válida (PNG/JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const newStamp: LabStamp = {
        id: `tstamp-${Date.now()}`,
        name: file.name.split('.')[0],
        url: event.target?.result as string,
        scaleX: 1.0,
        scaleY: 1.0,
        posX: 0,
        posY: 0,
        rotation: 0
      };
      setStamps([...stamps, newStamp]);
      setSelectedStampId(newStamp.id);
      const log = addLog('creation', 'Upload Estampas Lab', `Nova estampa de teste carregada: "${file.name}"`, 'success');
      onAddLog(log);
      toast.success('Imagem carregada no laboratório!');
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteStamp = (id: string) => {
    const removedStamp = stamps.find(s => s.id === id);
    const updated = stamps.filter(s => s.id !== id);
    setStamps(updated);
    if (selectedStampId === id && updated.length > 0) {
      setSelectedStampId(updated[0].id);
    }
    const log = addLog('modification', 'Upload Estampas Lab', `Estampa deletada: "${removedStamp?.name}"`, 'warning');
    onAddLog(log);
    toast.success('Estampa de teste removida.');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gallery / Uploader (Left) */}
        <div className="lg:col-span-6 bg-white p-5 rounded-lg border border-zinc-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <h3 className="font-black text-xs uppercase tracking-widest text-zinc-900 flex items-center gap-1.5">
              <ImageIcon size={16} /> Banco de Imagens & Estampas Beta
            </h3>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-black text-white hover:bg-zinc-800 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded flex items-center gap-1 border border-black"
            >
              <Upload size={12} /> Carregar Imagem
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>

          {/* Stamps list */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stamps.map(stamp => (
              <div 
                key={stamp.id}
                onClick={() => setSelectedStampId(stamp.id)}
                className={`p-3 rounded border text-center relative cursor-pointer flex flex-col justify-between h-[150px] transition-all group ${
                  selectedStampId === stamp.id 
                    ? 'border-amber-500 bg-amber-50/10' 
                    : 'border-zinc-200 hover:border-zinc-400 bg-zinc-50'
                }`}
              >
                <div className="h-16 flex items-center justify-center p-1 mb-2">
                  <img 
                    src={stamp.url} 
                    alt={stamp.name} 
                    className="max-h-full max-w-full object-contain filter drop-shadow-md"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-zinc-800 truncate mb-1">{stamp.name}</span>
                  <div className="flex justify-between items-center text-[8px] text-zinc-400">
                    <span>1:1 Ratio</span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteStamp(stamp.id);
                      }}
                      className="text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Adjustments (Right) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-zinc-900 text-zinc-300 p-5 rounded-lg border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-white">
              <Sliders size={18} className="text-amber-500" />
              <h3 className="font-black text-xs uppercase tracking-widest">Coordenadas de Mapeamento do Decalque</h3>
            </div>

            {selectedStamp ? (
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-black">Estampa Ativa para Ajustes</span>
                  <div className="text-sm font-bold text-white mt-0.5">{selectedStamp.name}</div>
                </div>

                {/* Target Zone Mapping */}
                <div>
                  <label className="block text-xs font-bold text-zinc-400 mb-1">Zona de Projeção na Camisa</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['front', 'back', 'sleeves'].map(zone => (
                      <button 
                        key={zone}
                        onClick={() => {
                          setActiveZone(zone);
                          const log = addLog('modification', 'Zonagem Decalques', `Direcionado mapeamento da estampa "${selectedStamp.name}" para a zona "${zone}"`, 'info');
                          onAddLog(log);
                        }}
                        className={`py-1.5 text-[9px] font-black uppercase tracking-wider rounded border transition-all ${
                          activeZone === zone 
                            ? 'bg-amber-500 text-black border-amber-600' 
                            : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                        }`}
                      >
                        {zone === 'front' ? 'Frente' : zone === 'back' ? 'Costas' : 'Mangas'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pos X */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-zinc-400 mb-1">
                    <span>Posição Horizontal (Eixo X)</span>
                    <span className="text-white">{selectedStamp.posX > 0 ? `+${selectedStamp.posX}` : selectedStamp.posX} cm</span>
                  </div>
                  <input 
                    type="range" min="-30" max="30" step="1" 
                    value={selectedStamp.posX} 
                    onChange={(e) => handleUpdateStamp('posX', parseInt(e.target.value))}
                    onMouseUp={() => logSliderRelease('Offset X', selectedStamp.posX)}
                    className="w-full accent-amber-500 bg-zinc-800"
                  />
                </div>

                {/* Pos Y */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-zinc-400 mb-1">
                    <span>Posição Vertical (Eixo Y)</span>
                    <span className="text-white">{selectedStamp.posY > 0 ? `+${selectedStamp.posY}` : selectedStamp.posY} cm</span>
                  </div>
                  <input 
                    type="range" min="-40" max="40" step="1" 
                    value={selectedStamp.posY} 
                    onChange={(e) => handleUpdateStamp('posY', parseInt(e.target.value))}
                    onMouseUp={() => logSliderRelease('Offset Y', selectedStamp.posY)}
                    className="w-full accent-amber-500 bg-zinc-800"
                  />
                </div>

                {/* Scale */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-zinc-400 mb-1">
                      <span>Escala de Largura</span>
                      <span className="text-white">{Math.round(selectedStamp.scaleX * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0.2" max="2.0" step="0.05" 
                      value={selectedStamp.scaleX} 
                      onChange={(e) => handleUpdateStamp('scaleX', parseFloat(e.target.value))}
                      onMouseUp={() => logSliderRelease('Escala X', selectedStamp.scaleX)}
                      className="w-full accent-amber-500 bg-zinc-800"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold text-zinc-400 mb-1">
                      <span>Rotação</span>
                      <span className="text-white">{selectedStamp.rotation}°</span>
                    </div>
                    <input 
                      type="range" min="-180" max="180" step="5" 
                      value={selectedStamp.rotation} 
                      onChange={(e) => handleUpdateStamp('rotation', parseInt(e.target.value))}
                      onMouseUp={() => logSliderRelease('Rotação', selectedStamp.rotation)}
                      className="w-full accent-amber-500 bg-zinc-800"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-zinc-500 text-xs italic">Crie ou selecione uma estampa de teste para ajustar as coordenadas da projeção.</p>
            )}
          </div>

          {/* Guidelines info */}
          <div className="bg-white p-4 rounded-lg border border-zinc-200 shadow-sm text-xs text-zinc-600 leading-relaxed">
            <div className="flex gap-1.5 items-center font-black uppercase tracking-wider text-[10px] text-zinc-900 mb-1">
              <CheckSquare size={13} className="text-emerald-500" />
              Diretrizes de Resolução de Imagem
            </div>
            Para mapeamentos de alta definição no provador oversized, certifique-se de que os uploads possuam fundo transparente (canal Alpha ativo), resolução mínima de <strong>2048 x 2048 px</strong>, e sejam salvos no perfil sRGB.
          </div>
        </div>
      </div>
    </div>
  );
}
