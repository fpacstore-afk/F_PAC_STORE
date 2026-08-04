import React, { useState } from 'react';
import { Palette, Plus, Trash2, Check, Sparkles, Image as ImageIcon, Star } from 'lucide-react';
import { ProductMockupUploader } from './ProductMockupUploader';
import toast from 'react-hot-toast';

export interface ColorVariant {
  name: string;
  hex: string;
  images: string[];
}

interface ColorCarouselManagerProps {
  colorVariants: ColorVariant[];
  onChange: (updated: ColorVariant[]) => void;
}

const PRESET_COLORS = [
  { name: 'Preto', hex: '#000000' },
  { name: 'Off White', hex: '#FAF9F6' },
  { name: 'Branco', hex: '#FFFFFF' },
  { name: 'Azul Marinho', hex: '#1B263B' },
  { name: 'Verde Militar', hex: '#3F4238' },
  { name: 'Marrom Café', hex: '#4A3C31' },
  { name: 'Cinza Mescla', hex: '#CFDBD5' },
  { name: 'Bege', hex: '#E3D5CA' }
];

export const ColorCarouselManager: React.FC<ColorCarouselManagerProps> = ({
  colorVariants = [],
  onChange
}) => {
  const [activeColorIndex, setActiveColorIndex] = useState<number>(0);
  const [customName, setCustomName] = useState('');
  const [customHex, setCustomHex] = useState('#000000');

  const handleTogglePreset = (preset: { name: string; hex: string }) => {
    const exists = colorVariants.find((c) => c.name.toLowerCase() === preset.name.toLowerCase());
    if (exists) {
      if (colorVariants.length === 1) {
        toast.error('O produto precisa ter pelo menos 1 cor.');
        return;
      }
      const updated = colorVariants.filter((c) => c.name.toLowerCase() !== preset.name.toLowerCase());
      onChange(updated);
      setActiveColorIndex(0);
      toast.success(`Cor ${preset.name} removida.`);
    } else {
      const newVariant: ColorVariant = {
        name: preset.name,
        hex: preset.hex,
        images: []
      };
      const updated = [...colorVariants, newVariant];
      onChange(updated);
      setActiveColorIndex(updated.length - 1);
      toast.success(`Cor ${preset.name} adicionada!`);
    }
  };

  const handleAddCustomColor = () => {
    if (!customName.trim()) {
      toast.error('Informe o nome da cor.');
      return;
    }

    const exists = colorVariants.find((c) => c.name.toLowerCase() === customName.trim().toLowerCase());
    if (exists) {
      toast.error('Esta cor já foi adicionada.');
      return;
    }

    const newVariant: ColorVariant = {
      name: customName.trim(),
      hex: customHex,
      images: []
    };

    const updated = [...colorVariants, newVariant];
    onChange(updated);
    setActiveColorIndex(updated.length - 1);
    setCustomName('');
    toast.success(`Cor ${newVariant.name} adicionada!`);
  };

  const handleRemoveColor = (index: number) => {
    if (colorVariants.length === 1) {
      toast.error('O produto precisa de pelo menos 1 cor.');
      return;
    }
    const colorName = colorVariants[index].name;
    const updated = colorVariants.filter((_, i) => i !== index);
    onChange(updated);
    setActiveColorIndex(0);
    toast.success(`Cor ${colorName} removida.`);
  };

  const handleUpdateColorImages = (images: string[]) => {
    if (activeColorIndex < 0 || activeColorIndex >= colorVariants.length) return;
    const updated = [...colorVariants];
    updated[activeColorIndex] = {
      ...updated[activeColorIndex],
      images
    };
    onChange(updated);
  };

  const currentColor = colorVariants[activeColorIndex] || colorVariants[0];

  return (
    <div className="space-y-6 font-sans">
      {/* Preset Quick Badges */}
      <div>
        <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">
          Cores Rápidas do Produto
        </label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((preset) => {
            const isSelected = colorVariants.some((c) => c.name.toLowerCase() === preset.name.toLowerCase());

            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => handleTogglePreset(preset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all cursor-pointer ${
                  isSelected 
                    ? 'border-[#eab308] bg-[#eab308]/10 text-white shadow-md shadow-[#eab308]/5' 
                    : 'border-white/10 bg-black/40 text-gray-400 hover:border-white/25 hover:text-white'
                }`}
              >
                <span 
                  className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0" 
                  style={{ backgroundColor: preset.hex }} 
                />
                <span>{preset.name}</span>
                {isSelected && <Check size={12} className="text-[#eab308]" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Add Custom Color */}
      <div className="bg-black/30 border border-white/10 p-3.5 rounded-xl flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <input 
            type="color"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            className="w-8 h-8 rounded border border-white/20 bg-transparent cursor-pointer"
          />
          <input 
            type="text"
            placeholder="Nome da cor personalizada..."
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="w-full px-3 py-1.5 bg-black/60 border border-white/15 text-xs text-white placeholder-gray-500 rounded-lg focus:outline-none focus:border-[#eab308]"
          />
        </div>
        <button
          type="button"
          onClick={handleAddCustomColor}
          className="px-4 py-2 bg-white/10 hover:bg-[#eab308] hover:text-black text-white text-xs font-black uppercase rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <Plus size={14} /> Adicionar Cor
        </button>
      </div>

      {/* Active Color Selector Tabs */}
      {colorVariants.length > 0 && (
        <div className="border border-white/10 rounded-2xl bg-[#12121c] p-4 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <Palette size={14} className="text-[#eab308]" /> Selecione a cor para gerenciar os mockups:
            </span>
            <span className="text-[10px] text-gray-500 font-mono">
              {colorVariants.length} cor(es) cadastrada(s)
            </span>
          </div>

          {/* Color Tabs Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {colorVariants.map((variant, idx) => {
              const isActive = idx === activeColorIndex;
              const imgCount = (variant.images || []).length;

              return (
                <div 
                  key={variant.name}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 ${
                    isActive 
                      ? 'border-[#eab308] bg-[#eab308] text-black shadow-lg shadow-[#eab308]/20' 
                      : 'border-white/10 bg-black/60 text-white hover:border-white/25'
                  }`}
                  onClick={() => setActiveColorIndex(idx)}
                >
                  <span 
                    className="w-3.5 h-3.5 rounded-full border border-black/20" 
                    style={{ backgroundColor: variant.hex }} 
                  />
                  <span>{variant.name}</span>

                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                    isActive ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-300'
                  }`}>
                    {imgCount} foto(s)
                  </span>

                  {colorVariants.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemoveColor(idx); }}
                      className={`hover:opacity-100 opacity-60 ${isActive ? 'text-black' : 'text-red-400'}`}
                      title="Remover cor"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Dedicated Mockup Uploader for Selected Color */}
          {currentColor && (
            <div className="pt-2">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border border-white/30" style={{ backgroundColor: currentColor.hex }} />
                  Mockups da Cor: <span className="text-[#eab308]">{currentColor.name}</span>
                </h4>
                <span className="text-[10px] text-gray-400">
                  Estes mockups serão exibidos no carrossel da loja quando o cliente selecionar {currentColor.name}.
                </span>
              </div>

              <ProductMockupUploader
                images={currentColor.images || []}
                onChange={handleUpdateColorImages}
                colorName={currentColor.name}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
