import React, { useState } from 'react';
import { Sun, Palette, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';
import { LabConfig } from '../types';
import { addLog } from '../logsStore';
import toast from 'react-hot-toast';

interface RenderTabProps {
  config: LabConfig;
  onChange: (newConfig: LabConfig) => void;
  onAddLog: (log: any) => void;
}

export function RenderTab({ config, onChange, onAddLog }: RenderTabProps) {
  const [materialProfile, setMaterialProfile] = useState<string>('Heavy Cotton');

  const handleSliderChange = (key: keyof LabConfig, val: any) => {
    const updated = { ...config, [key]: val };
    onChange(updated);
  };

  const handleToggle = (key: keyof LabConfig) => {
    const updated = { ...config, [key]: !config[key] };
    onChange(updated);
    const log = addLog('modification', 'Configurações de Luz', `Opção "${key}" alternada para ${updated[key]}`, 'info');
    onAddLog(log);
  };

  const applyMaterialProfile = (profile: string, roughness: number, metallic: number, aoIntensity: number) => {
    setMaterialProfile(profile);
    const updated = { ...config, roughness, metallic, aoIntensity };
    onChange(updated);
    const log = addLog('modification', 'Shader de Material', `Perfil de material alterado para: "${profile}" (Roughness: ${roughness}, Metallic: ${metallic})`, 'success');
    onAddLog(log);
    toast.success(`Perfil ${profile} aplicado!`);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Lights & Shadows (Left) */}
        <div className="lg:col-span-6 bg-white p-5 rounded-lg border border-zinc-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b pb-3 mb-2 text-zinc-950">
            <Sun size={18} />
            <h3 className="font-black text-xs uppercase tracking-widest">Painel de Iluminação & Rigs de Estúdio</h3>
          </div>

          {/* Key Light Slider */}
          <div>
            <div className="flex justify-between text-xs font-bold text-zinc-700 mb-1">
              <span>Luz Principal (Key Light Directional)</span>
              <span className="text-black">{config.lightIntensity}x</span>
            </div>
            <input 
              type="range" min="0.1" max="4.0" step="0.1" 
              value={config.lightIntensity} 
              onChange={(e) => handleSliderChange('lightIntensity', parseFloat(e.target.value))}
              className="w-full accent-black"
            />
          </div>

          {/* Ambient Light Slider */}
          <div>
            <div className="flex justify-between text-xs font-bold text-zinc-700 mb-1">
              <span>Iluminação de Preenchimento (Ambient Fill)</span>
              <span className="text-black">{config.ambientIntensity}x</span>
            </div>
            <input 
              type="range" min="0.1" max="2.0" step="0.1" 
              value={config.ambientIntensity} 
              onChange={(e) => handleSliderChange('ambientIntensity', parseFloat(e.target.value))}
              className="w-full accent-black"
            />
          </div>

          {/* Shadow Switcher */}
          <div className="flex items-center justify-between py-3 border-t border-zinc-100">
            <div>
              <h4 className="font-bold text-xs text-zinc-950">Mapeamento de Sombras (Shadow Maps)</h4>
              <p className="text-[10px] text-zinc-500 mt-0.5">Habilita sombras projetadas de alta definição nas dobras do tecido</p>
            </div>
            <button onClick={() => handleToggle('shadowsEnabled')} className="text-zinc-800 transition-colors">
              {config.shadowsEnabled ? (
                <ToggleRight size={38} className="text-zinc-950" />
              ) : (
                <ToggleLeft size={38} className="text-zinc-300" />
              )}
            </button>
          </div>
        </div>

        {/* Material Profiles / Shader settings (Right) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-zinc-900 text-zinc-300 p-5 rounded-lg border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-white">
              <Palette size={18} className="text-amber-500" />
              <h3 className="font-black text-xs uppercase tracking-widest">Perfis de Shaders PBR</h3>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-zinc-400">Presets de Textura e Brilho das Fibras</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'Heavy Cotton', r: 0.85, m: 0.05, ao: 1.0, icon: '🧶' },
                  { name: 'Brilliant Silk', r: 0.25, m: 0.15, ao: 0.7, icon: '✨' },
                  { name: 'Fleece/Moletom', r: 0.95, m: 0.01, ao: 1.3, icon: '🐑' },
                  { name: 'Semi-Sintético', r: 0.55, m: 0.08, ao: 0.9, icon: '🧪' }
                ].map(prof => (
                  <button 
                    key={prof.name}
                    onClick={() => applyMaterialProfile(prof.name, prof.r, prof.m, prof.ao)}
                    className={`p-3 text-left rounded border transition-all ${
                      materialProfile === prof.name 
                        ? 'bg-amber-500 text-black border-amber-600' 
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                    }`}
                  >
                    <span className="block text-base mb-1">{prof.icon}</span>
                    <span className="block text-[10px] font-black uppercase tracking-wider">{prof.name}</span>
                    <span className="block text-[9px] text-zinc-400 mt-0.5">Roughness: {prof.r}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-zinc-800/50 p-3 rounded border border-zinc-800 text-[11px] text-zinc-400 flex items-start gap-2">
              <Sparkles size={14} className="text-amber-500 shrink-0 mt-0.5" />
              O motor de Shaders F PAC utiliza mapeamento de reflexão anisotrópica simulado para imitar o comportamento de algodão penteado 260GSM sob luz solar direta.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
