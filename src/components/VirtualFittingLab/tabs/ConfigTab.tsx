import React from 'react';
import { LabConfig } from '../types';
import { Sliders, RefreshCw, Layers, ShieldCheck, Flame } from 'lucide-react';
import { addLog } from '../logsStore';

interface ConfigTabProps {
  config: LabConfig;
  onChange: (newConfig: LabConfig) => void;
  onAddLog: (log: any) => void;
}

export function ConfigTab({ config, onChange, onAddLog }: ConfigTabProps) {
  const handleSliderChange = (key: keyof LabConfig, val: any) => {
    const updated = { ...config, [key]: val };
    onChange(updated);
  };

  const logAdjustment = (name: string, value: any) => {
    const log = addLog(
      'modification',
      'Configurador Lab',
      `Parâmetro ajustado: "${name}" alterado para ${value}`,
      'info'
    );
    onAddLog(log);
  };

  const applyPreset = (presetName: string, presetData: Partial<LabConfig>) => {
    const updated = { ...config, ...presetData };
    onChange(updated);
    const log = addLog(
      'modification',
      'Presets de Tecido',
      `Preset aplicado: "${presetName}"`,
      'success'
    );
    onAddLog(log);
  };

  const resetToStandardOversized = () => {
    applyPreset('Oversized Padrão F PAC', {
      length: 80,
      width: 67,
      shoulder: 30,
      sleeveLength: 26,
      sleeveWidth: 23,
      collarSize: 18,
      thickness: 3,
      color: '#111112',
      roughness: 0.7,
      metallic: 0.1,
      aoIntensity: 1.0,
      wireframe: false,
      doubleSided: true,
      gravity: -9.8,
      windX: 0,
      windZ: 0,
      fabricStiffness: 0.6,
      fabricDamping: 0.5,
      gridSubdivisions: 30
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Presets bar */}
      <div className="bg-zinc-900 text-white p-4 rounded-lg border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-black text-xs uppercase tracking-widest text-amber-400">Presets Rápidos de Tecido Premium</h3>
          <p className="text-zinc-400 text-[11px] mt-0.5">Altere as propriedades físicas e materiais da malha instantaneamente</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => applyPreset('Algodão Heavy 260GSM', { roughness: 0.8, thickness: 3.5, fabricStiffness: 0.7, color: '#161618' })}
            className="px-3 py-1.5 bg-zinc-800 text-white hover:bg-zinc-700 text-[10px] font-black uppercase tracking-wider rounded border border-zinc-700"
          >
            🧶 Cotton Heavy 260g
          </button>
          <button 
            onClick={() => applyPreset('Moletom Heavyweight', { roughness: 0.9, thickness: 5.0, fabricStiffness: 0.85, color: '#27272a' })}
            className="px-3 py-1.5 bg-zinc-800 text-white hover:bg-zinc-700 text-[10px] font-black uppercase tracking-wider rounded border border-zinc-700"
          >
            🔥 Moletom Heavy
          </button>
          <button 
            onClick={() => applyPreset('Linho Soft Premium', { roughness: 0.6, thickness: 2.0, fabricStiffness: 0.45, color: '#e4e4e7' })}
            className="px-3 py-1.5 bg-zinc-800 text-white hover:bg-zinc-700 text-[10px] font-black uppercase tracking-wider rounded border border-zinc-700"
          >
            💨 Linho Soft
          </button>
          <button 
            onClick={resetToStandardOversized}
            className="px-3 py-1.5 bg-amber-500 text-black hover:bg-amber-400 text-[10px] font-black uppercase tracking-wider rounded border border-amber-600"
          >
            🔄 Reset Padrão F PAC
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Physical dimensions & Fabric specs */}
        <div className="lg:col-span-6 bg-white p-5 rounded-lg border border-zinc-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b pb-3 mb-2 text-zinc-950">
            <Sliders size={18} />
            <h3 className="font-black text-xs uppercase tracking-widest">Dimensões & Modelagem da Camisa (cm)</h3>
          </div>

          {/* Comprimento */}
          <div>
            <div className="flex justify-between text-xs font-bold text-zinc-700 mb-1">
              <span>Comprimento Total (Corpo)</span>
              <span className="text-black">{config.length} cm</span>
            </div>
            <input 
              type="range" min="60" max="100" step="1" 
              value={config.length} 
              onChange={(e) => handleSliderChange('length', parseInt(e.target.value))}
              onMouseUp={() => logAdjustment('Comprimento', config.length)}
              className="w-full accent-black"
            />
            <span className="text-[10px] text-zinc-400">Padrão e-commerce F PAC Oversized: 80 cm</span>
          </div>

          {/* Largura */}
          <div>
            <div className="flex justify-between text-xs font-bold text-zinc-700 mb-1">
              <span>Largura (Tórax)</span>
              <span className="text-black">{config.width} cm</span>
            </div>
            <input 
              type="range" min="50" max="90" step="1" 
              value={config.width} 
              onChange={(e) => handleSliderChange('width', parseInt(e.target.value))}
              onMouseUp={() => logAdjustment('Largura', config.width)}
              className="w-full accent-black"
            />
            <span className="text-[10px] text-zinc-400">Padrão e-commerce F PAC Oversized: 67 cm</span>
          </div>

          {/* Ombro */}
          <div>
            <div className="flex justify-between text-xs font-bold text-zinc-700 mb-1">
              <span>Ombro Caído (Shoulder Drop)</span>
              <span className="text-black">{config.shoulder} cm</span>
            </div>
            <input 
              type="range" min="15" max="45" step="1" 
              value={config.shoulder} 
              onChange={(e) => handleSliderChange('shoulder', parseInt(e.target.value))}
              onMouseUp={() => logAdjustment('Ombro', config.shoulder)}
              className="w-full accent-black"
            />
            <span className="text-[10px] text-zinc-400">Padrão e-commerce F PAC Oversized: 30 cm</span>
          </div>

          {/* Manga */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div>
              <div className="flex justify-between text-xs font-bold text-zinc-700 mb-1">
                <span>Manga (Comprimento)</span>
                <span className="text-black">{config.sleeveLength} cm</span>
              </div>
              <input 
                type="range" min="15" max="40" step="1" 
                value={config.sleeveLength} 
                onChange={(e) => handleSliderChange('sleeveLength', parseInt(e.target.value))}
                onMouseUp={() => logAdjustment('Manga Comprimento', config.sleeveLength)}
                className="w-full accent-black"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold text-zinc-700 mb-1">
                <span>Manga (Largura/Boca)</span>
                <span className="text-black">{config.sleeveWidth} cm</span>
              </div>
              <input 
                type="range" min="15" max="35" step="1" 
                value={config.sleeveWidth} 
                onChange={(e) => handleSliderChange('sleeveWidth', parseInt(e.target.value))}
                onMouseUp={() => logAdjustment('Largura da Manga', config.sleeveWidth)}
                className="w-full accent-black"
              />
            </div>
          </div>

          {/* Gola & Espessura */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-zinc-100 pt-3">
            <div>
              <div className="flex justify-between text-xs font-bold text-zinc-700 mb-1">
                <span>Diâmetro Gola</span>
                <span className="text-black">{config.collarSize} cm</span>
              </div>
              <input 
                type="range" min="12" max="25" step="1" 
                value={config.collarSize} 
                onChange={(e) => handleSliderChange('collarSize', parseInt(e.target.value))}
                onMouseUp={() => logAdjustment('Tamanho Gola', config.collarSize)}
                className="w-full accent-black"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold text-zinc-700 mb-1">
                <span>Espessura Tecido</span>
                <span className="text-black">{config.thickness} mm</span>
              </div>
              <input 
                type="range" min="1" max="8" step="0.5" 
                value={config.thickness} 
                onChange={(e) => handleSliderChange('thickness', parseFloat(e.target.value))}
                onMouseUp={() => logAdjustment('Espessura', config.thickness)}
                className="w-full accent-black"
              />
            </div>
          </div>
        </div>

        {/* Right column: Material properties & Simulated forces */}
        <div className="lg:col-span-6 space-y-6">
          {/* Material Specs */}
          <div className="bg-white p-5 rounded-lg border border-zinc-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b pb-3 mb-2 text-zinc-950">
              <Layers size={18} />
              <h3 className="font-black text-xs uppercase tracking-widest">Aparência do Material PBR Procedural</h3>
            </div>

            {/* Custom Color Selector */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-2">Cor do Corpo da Camisa (Hex)</label>
              <div className="flex gap-3 items-center">
                <input 
                  type="color" 
                  value={config.color} 
                  onChange={(e) => handleSliderChange('color', e.target.value)}
                  className="w-10 h-10 border border-zinc-300 rounded cursor-pointer shrink-0"
                />
                <input 
                  type="text" 
                  value={config.color} 
                  onChange={(e) => handleSliderChange('color', e.target.value)}
                  placeholder="#111112"
                  className="w-full text-xs font-mono uppercase bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-zinc-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Roughness */}
              <div>
                <div className="flex justify-between text-xs font-bold text-zinc-700 mb-1">
                  <span>Rugosidade (Roughness)</span>
                  <span className="text-black">{config.roughness}</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.05" 
                  value={config.roughness} 
                  onChange={(e) => handleSliderChange('roughness', parseFloat(e.target.value))}
                  onMouseUp={() => logAdjustment('Roughness', config.roughness)}
                  className="w-full accent-black"
                />
              </div>

              {/* Metallic */}
              <div>
                <div className="flex justify-between text-xs font-bold text-zinc-700 mb-1">
                  <span>Metálico (Metallic)</span>
                  <span className="text-black">{config.metallic}</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.05" 
                  value={config.metallic} 
                  onChange={(e) => handleSliderChange('metallic', parseFloat(e.target.value))}
                  onMouseUp={() => logAdjustment('Metallic', config.metallic)}
                  className="w-full accent-black"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* AO Intensity */}
              <div>
                <div className="flex justify-between text-xs font-bold text-zinc-700 mb-1">
                  <span>Intensidade de AO</span>
                  <span className="text-black">{config.aoIntensity}x</span>
                </div>
                <input 
                  type="range" min="0" max="2" step="0.1" 
                  value={config.aoIntensity} 
                  onChange={(e) => handleSliderChange('aoIntensity', parseFloat(e.target.value))}
                  onMouseUp={() => logAdjustment('AO Intensity', config.aoIntensity)}
                  className="w-full accent-black"
                />
              </div>

              {/* Toggles */}
              <div className="flex flex-col justify-end gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-zinc-700">
                  <input 
                    type="checkbox" 
                    checked={config.wireframe} 
                    onChange={(e) => {
                      handleSliderChange('wireframe', e.target.checked);
                      logAdjustment('Wireframe', e.target.checked);
                    }}
                    className="accent-black" 
                  />
                  Visualizar Aramado (Wireframe)
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-bold text-zinc-700">
                  <input 
                    type="checkbox" 
                    checked={config.doubleSided} 
                    onChange={(e) => {
                      handleSliderChange('doubleSided', e.target.checked);
                      logAdjustment('Double Sided', e.target.checked);
                    }}
                    className="accent-black" 
                  />
                  Renderização Dupla-Face
                </label>
              </div>
            </div>
          </div>

          {/* Physics Sandbox Settings */}
          <div className="bg-zinc-900 text-zinc-300 p-5 rounded-lg border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 mb-2 text-white">
              <Flame className="text-amber-400" size={18} />
              <h3 className="font-black text-xs uppercase tracking-widest">Simulação de Caimento Dinâmico (Físico)</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Gravity */}
              <div>
                <div className="flex justify-between text-xs font-bold text-zinc-400 mb-1">
                  <span>Gravidade Atmosférica</span>
                  <span className="text-white">{config.gravity} m/s²</span>
                </div>
                <input 
                  type="range" min="-20" max="0" step="0.2" 
                  value={config.gravity} 
                  onChange={(e) => handleSliderChange('gravity', parseFloat(e.target.value))}
                  onMouseUp={() => logAdjustment('Gravidade', config.gravity)}
                  className="w-full accent-amber-500 bg-zinc-800"
                />
              </div>

              {/* Stiffness */}
              <div>
                <div className="flex justify-between text-xs font-bold text-zinc-400 mb-1">
                  <span>Rigidez Téxtil (Stiffness)</span>
                  <span className="text-white">{config.fabricStiffness}</span>
                </div>
                <input 
                  type="range" min="0.1" max="1" step="0.05" 
                  value={config.fabricStiffness} 
                  onChange={(e) => handleSliderChange('fabricStiffness', parseFloat(e.target.value))}
                  onMouseUp={() => logAdjustment('Stiffness', config.fabricStiffness)}
                  className="w-full accent-amber-500 bg-zinc-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Wind Speed X */}
              <div>
                <div className="flex justify-between text-xs font-bold text-zinc-400 mb-1">
                  <span>Vento Lateral (Eixo X)</span>
                  <span className="text-white">{config.windX} m/s</span>
                </div>
                <input 
                  type="range" min="-10" max="10" step="0.5" 
                  value={config.windX} 
                  onChange={(e) => handleSliderChange('windX', parseFloat(e.target.value))}
                  onMouseUp={() => logAdjustment('Vento X', config.windX)}
                  className="w-full accent-amber-500 bg-zinc-800"
                />
              </div>

              {/* Mesh Subdivisions */}
              <div>
                <div className="flex justify-between text-xs font-bold text-zinc-400 mb-1">
                  <span>Subdivisões de Malha</span>
                  <span className="text-white">{config.gridSubdivisions} quads</span>
                </div>
                <input 
                  type="range" min="10" max="40" step="1" 
                  value={config.gridSubdivisions} 
                  onChange={(e) => handleSliderChange('gridSubdivisions', parseInt(e.target.value))}
                  onMouseUp={() => logAdjustment('Subdivisões do Grid', config.gridSubdivisions)}
                  className="w-full accent-amber-500 bg-zinc-800"
                />
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 italic">Nota: Forças físicas alteram a deformaçãco polinomial em tempo real na aba Mockup 3D.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
