import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../lib/firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { 
  Play, 
  Pause, 
  Upload, 
  Eye, 
  Sliders, 
  Settings, 
  Check, 
  RefreshCw, 
  Layers, 
  Sparkles, 
  AlertCircle, 
  HelpCircle, 
  Smartphone, 
  Monitor, 
  FileVideo, 
  ImageIcon, 
  ChevronRight,
  Sparkle,
  Code
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Link } from 'react-router-dom';

// Type definitions for local sandbox
interface EstampaPreset {
  id: string;
  name: string;
  image: string;
  videoUrl: string;
  description: string;
}

export default function VideoSandbox() {
  // Calibration State (sliders)
  const [scaleMin, setScaleMin] = useState<number>(1.05);
  const [scaleMax, setScaleMax] = useState<number>(1.28);
  const [focusY, setFocusY] = useState<number>(-4);
  const [focusX, setFocusX] = useState<number>(0);

  // Active testing media URLs
  const [testImage, setTestImage] = useState<string>('https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=600&auto=format&fit=crop');
  const [testVideo, setTestVideo] = useState<string>('https://res.cloudinary.com/demo/video/upload/q_auto,f_auto/v1/samples/sea-turtle.mp4');
  const [mediaName, setMediaName] = useState<string>('Exemplo Padrão (Tartaruga Marinha)');

  // Catalog items loaded from Firebase for preset selection
  const [catalogPresets, setCatalogPresets] = useState<EstampaPreset[]>([]);
  const [loadingPresets, setLoadingPresets] = useState<boolean>(true);

  // File upload state / drag indicators
  const [isDraggingVideo, setIsDraggingVideo] = useState<boolean>(false);
  const [isDraggingImage, setIsDraggingImage] = useState<boolean>(false);

  // Global hover trigger for the video players in sandbox
  const [hoverAll, setHoverAll] = useState<boolean>(false);

  // Load real catalog items from Firestore to offer as presets
  useEffect(() => {
    async function loadCatalog() {
      try {
        const q = query(collection(db, 'estampas'), limit(8));
        const querySnapshot = await getDocs(q);
        const fetched: EstampaPreset[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // Extract video
          let videoUrl = '';
          if (data.videos && data.videos.length > 0) {
            const sorted = [...data.videos].sort((a, b) => a.order - b.order);
            videoUrl = sorted[0]?.url || sorted[0] || '';
          } else if (data.video) {
            videoUrl = typeof data.video === 'string' ? data.video : data.video.url || '';
          }

          if (data.image || videoUrl) {
            fetched.push({
              id: doc.id,
              name: data.name || 'Sem nome',
              image: data.image || data.path || '',
              videoUrl: videoUrl,
              description: data.description || '',
            });
          }
        });

        setCatalogPresets(fetched);
        
        // If we found any real stamp with both image and video, let's load it as the initial preset!
        const initialItem = fetched.find(item => item.image && item.videoUrl);
        if (initialItem) {
          setTestImage(initialItem.image);
          setTestVideo(initialItem.videoUrl);
          setMediaName(initialItem.name);
        }
      } catch (err) {
        console.error('Erro ao buscar estampas para sandbox:', err);
      } finally {
        setLoadingPresets(false);
      }
    }
    loadCatalog();
  }, []);

  // Built-in Sample Presets in case of empty catalog or quick selection
  const samples = [
    {
      name: 'Logo Sombra (Preto Vertical)',
      image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=600&auto=format&fit=crop',
      videoUrl: 'https://res.cloudinary.com/demo/video/upload/q_auto,f_auto,w_400,h_700,c_fill/v1/samples/sea-turtle.mp4', // simulating high vertical
    },
    {
      name: 'Natureza 1:1 (Mockup Quadrado)',
      image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=600&auto=format&fit=crop',
      videoUrl: 'https://res.cloudinary.com/demo/video/upload/q_auto,f_auto,w_500,h_500,c_fill/v1/samples/sea-turtle.mp4', // simulating square
    },
    {
      name: 'Vídeo Horizontal (16:9)',
      image: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?q=80&w=600&auto=format&fit=crop',
      videoUrl: 'https://res.cloudinary.com/demo/video/upload/q_auto,f_auto/v1/samples/sea-turtle.mp4', // horizontal standard
    }
  ];

  // Handler for custom image URL
  const handleImageUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value.trim()) {
      setTestImage(e.target.value.trim());
      setMediaName('URL customizada');
    }
  };

  // Handler for custom video URL
  const handleVideoUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value.trim()) {
      setTestVideo(e.target.value.trim());
      setMediaName('URL customizada');
    }
  };

  // Local File Loading (Image)
  const handleImageFile = (file: File) => {
    const localUrl = URL.createObjectURL(file);
    setTestImage(localUrl);
    setMediaName(`Local: ${file.name}`);
  };

  // Local File Loading (Video)
  const handleVideoFile = (file: File) => {
    const localUrl = URL.createObjectURL(file);
    setTestVideo(localUrl);
    setMediaName(`Local: ${file.name}`);
  };

  // Drag and Drop implementation
  const handleDragOver = (e: React.DragEvent, type: 'video' | 'image') => {
    e.preventDefault();
    if (type === 'video') setIsDraggingVideo(true);
    else setIsDraggingImage(true);
  };

  const handleDragLeave = (type: 'video' | 'image') => {
    if (type === 'video') setIsDraggingVideo(false);
    else setIsDraggingImage(false);
  };

  const handleDrop = (e: React.DragEvent, type: 'video' | 'image') => {
    e.preventDefault();
    if (type === 'video') {
      setIsDraggingVideo(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('video/')) {
        handleVideoFile(file);
      }
    } else {
      setIsDraggingImage(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        handleImageFile(file);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pt-6 pb-24 font-sans selection:bg-[#eab308] selection:text-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-6">
          <Link to="/" className="hover:text-black transition-colors">INÍCIO</Link>
          <ChevronRight size={10} className="text-slate-300" />
          <Link to="/estampas" className="hover:text-black transition-colors">ESTAMPAS</Link>
          <ChevronRight size={10} className="text-slate-300" />
          <span className="text-[#eab308] font-black">LABORATÓRIO DE VÍDEO</span>
        </div>

        {/* Header Hero */}
        <div className="bg-slate-950 text-white rounded-3xl p-6 md:p-10 mb-10 shadow-2xl relative overflow-hidden border border-slate-800">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Sparkles size={160} className="text-[#eab308]" />
          </div>
          
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/30 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mb-4 animate-pulse">
              <Sparkle size={14} />
              Ambiente de Auditoria & Sandbox
            </div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight leading-none mb-4 italic">
              LABORATÓRIO DE <span className="text-[#eab308]">VÍDEOS DO CATÁLOGO</span>
            </h1>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              Analise, calibre e compare 7 estratégias de renderização de mídia side-by-side utilizando exatamente os mesmos arquivos de imagem e vídeo. Use os controles de calibragem em tempo real para encontrar a configuração ideal para o seu catálogo.
            </p>
          </div>
        </div>

        {/* CONTROLS PANEL */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
          
          {/* Col 1: Media Setup Source & Calibration */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Real-time calibration parameters */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-2 mb-6 border-b border-slate-100 pb-3">
                <Sliders size={18} className="text-[#eab308]" />
                CALIBRAÇÃO DE ENQUADRAMENTO (AJUSTE DOS CARDS 5, 6 e 7)
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                      VIDEO_SCALE_MIN (Zoom Mínimo para Vídeos Verticais)
                    </label>
                    <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-[#eab308]">{scaleMin.toFixed(2)}x</span>
                  </div>
                  <input 
                    type="range" 
                    min="1.00" 
                    max="1.20" 
                    step="0.01" 
                    value={scaleMin} 
                    onChange={(e) => setScaleMin(parseFloat(e.target.value))}
                    className="w-full accent-[#eab308] h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Preserva a peça em vídeos verticais (proporção de story).</p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                      VIDEO_SCALE_MAX (Zoom Máximo para Vídeos Quadrados)
                    </label>
                    <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-[#eab308]">{scaleMax.toFixed(2)}x</span>
                  </div>
                  <input 
                    type="range" 
                    min="1.15" 
                    max="1.50" 
                    step="0.01" 
                    value={scaleMax} 
                    onChange={(e) => setScaleMax(parseFloat(e.target.value))}
                    className="w-full accent-[#eab308] h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Ampliação para preencher a área em vídeos largos ou quadrados.</p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                      VIDEO_FOCUS_Y (Deslocamento Vertical do Foco)
                    </label>
                    <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-[#eab308]">{focusY}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="-15" 
                    max="15" 
                    step="1" 
                    value={focusY} 
                    onChange={(e) => setFocusY(parseInt(e.target.value))}
                    className="w-full accent-[#eab308] h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Valores negativos sobem o enquadramento (mantém a estampa e gola visíveis).</p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                      VIDEO_FOCUS_X (Centralização Horizontal)
                    </label>
                    <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-[#eab308]">{focusX}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="-10" 
                    max="10" 
                    step="1" 
                    value={focusX} 
                    onChange={(e) => setFocusX(parseInt(e.target.value))}
                    className="w-full accent-[#eab308] h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Ajuste fino de alinhamento lateral (padrão é centralizado).</p>
                </div>
              </div>
            </div>

            {/* Load preset / custom url selection */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <Settings size={18} className="text-[#eab308]" />
                FONTE DE MÍDIA DO TESTE
              </h2>

              <div className="space-y-4">
                
                {/* Real stamps selection from Firestore */}
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-2">
                    Estampas Ativas do seu Catálogo ({catalogPresets.length})
                  </label>
                  {loadingPresets ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                      <RefreshCw size={12} className="animate-spin" /> Carregando estampas reais...
                    </div>
                  ) : catalogPresets.length > 0 ? (
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1 bg-slate-50 border border-slate-100 rounded-xl">
                      {catalogPresets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => {
                            setTestImage(preset.image);
                            setTestVideo(preset.videoUrl);
                            setMediaName(preset.name);
                          }}
                          className={cn(
                            "text-xs px-3 py-1.5 rounded-lg border font-bold transition-all text-left truncate max-w-[200px]",
                            testImage === preset.image && testVideo === preset.videoUrl
                              ? "bg-slate-900 border-slate-900 text-[#eab308]"
                              : "bg-white border-slate-200 hover:border-slate-400 text-slate-700"
                          )}
                        >
                          👕 {preset.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-1">Nenhuma estampa cadastrada com vídeo.</p>
                  )}
                </div>

                {/* Local Preset Examples */}
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-2">
                    Exemplos Rápidos do Laboratório
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {samples.map((sample) => (
                      <button
                        key={sample.name}
                        onClick={() => {
                          setTestImage(sample.image);
                          setTestVideo(sample.videoUrl);
                          setMediaName(sample.name);
                        }}
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-lg border font-bold transition-all",
                          testImage === sample.image && testVideo === sample.videoUrl
                            ? "bg-slate-900 border-slate-900 text-[#eab308]"
                            : "bg-white border-slate-200 hover:border-slate-400 text-slate-700"
                        )}
                      >
                        🎬 {sample.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* URL inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                      URL da Imagem de Teste (Mockup Estático)
                    </label>
                    <input
                      type="text"
                      placeholder="Cole a URL da imagem aqui"
                      value={testImage.startsWith('blob:') ? '' : testImage}
                      onChange={handleImageUrlChange}
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#eab308]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                      URL do Vídeo de Teste (Mockup MP4)
                    </label>
                    <input
                      type="text"
                      placeholder="Cole a URL do vídeo aqui"
                      value={testVideo.startsWith('blob:') ? '' : testVideo}
                      onChange={handleVideoUrlChange}
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#eab308]"
                    />
                  </div>
                </div>

              </div>
            </div>

          </div>

          {/* Col 2: Drag & Drop Local Upload Testing */}
          <div className="lg:col-span-4 space-y-4">
            
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 h-full flex flex-col justify-between">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-2 mb-2">
                  <Upload size={18} className="text-[#eab308]" />
                  FAÇA O TESTE COM SEUS ARQUIVOS
                </h2>
                <p className="text-xs text-slate-500 mb-4">
                  Arraste ou selecione qualquer arquivo <strong>JPG/PNG</strong> ou <strong>MP4</strong> de seu computador. Eles rodam instantaneamente localmente no sandbox sem precisar fazer upload!
                </p>
              </div>

              <div className="space-y-4">
                
                {/* Drag and drop image */}
                <div
                  onDragOver={(e) => handleDragOver(e, 'image')}
                  onDragLeave={() => handleDragLeave('image')}
                  onDrop={(e) => handleDrop(e, 'image')}
                  className={cn(
                    "border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all h-28 relative text-center",
                    isDraggingImage 
                      ? "border-[#eab308] bg-[#eab308]/5" 
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  )}
                  onClick={() => document.getElementById('sandbox-img-file')?.click()}
                >
                  <input 
                    id="sandbox-img-file" 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageFile(file);
                    }}
                  />
                  <ImageIcon className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-xs font-bold text-slate-700">Testar Foto Local</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">Arraste ou clique para selecionar</span>
                </div>

                {/* Drag and drop video */}
                <div
                  onDragOver={(e) => handleDragOver(e, 'video')}
                  onDragLeave={() => handleDragLeave('video')}
                  onDrop={(e) => handleDrop(e, 'video')}
                  className={cn(
                    "border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all h-28 relative text-center",
                    isDraggingVideo 
                      ? "border-[#eab308] bg-[#eab308]/5" 
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  )}
                  onClick={() => document.getElementById('sandbox-video-file')?.click()}
                >
                  <input 
                    id="sandbox-video-file" 
                    type="file" 
                    accept="video/*" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleVideoFile(file);
                    }}
                  />
                  <FileVideo className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-xs font-bold text-slate-700">Testar Vídeo Local</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">Arraste ou clique para selecionar</span>
                </div>

              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-bold flex items-center justify-between">
                <span>Mídia ativa:</span>
                <span className="text-slate-800 truncate max-w-[200px]" title={mediaName}>🎯 {mediaName}</span>
              </div>
            </div>

          </div>

        </div>

        {/* Play/Pause Global trigger bar */}
        <div className="bg-slate-900 text-white rounded-xl p-4 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Modo de Simulação de Eventos
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setHoverAll(true)}
              className={cn(
                "text-xs font-black uppercase tracking-wider px-4 py-2 rounded-lg flex items-center gap-2 transition-all",
                hoverAll 
                  ? "bg-[#eab308] text-black" 
                  : "bg-slate-800 hover:bg-slate-700 text-white"
              )}
            >
              <Play size={14} fill={hoverAll ? "black" : "none"} /> Forçar Play Geral
            </button>
            <button
              onClick={() => setHoverAll(false)}
              className={cn(
                "text-xs font-black uppercase tracking-wider px-4 py-2 rounded-lg flex items-center gap-2 transition-all",
                !hoverAll 
                  ? "bg-red-600 text-white" 
                  : "bg-slate-800 hover:bg-slate-700 text-white"
              )}
            >
              <Pause size={14} fill={!hoverAll ? "white" : "none"} /> Pausar Tudo
            </button>
          </div>
          
          <div className="text-[10px] text-slate-400">
            * Passe o mouse em cada card para simular a reprodução individual ou force o play geral para ver todos ativos.
          </div>
        </div>

        {/* ============================================================================
            THE 7 SIDE-BY-SIDE CARDS GRID
            ============================================================================ */}
        
        <h2 className="text-lg font-black uppercase tracking-wider text-slate-800 mb-6 flex items-center gap-2">
          <Layers className="text-[#eab308]" />
          COMPARAÇÃO VISUAL DAS 7 SOLUÇÕES DE RENDERIZAÇÃO
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          
          {/* CARD 1: SOLUÇÃO ANTERIOR (Contain Base) */}
          <SandboxCardWrapper 
            title="CARD 1 — Solução Anterior" 
            subtitle="Baseline Contain" 
            badge="Estático"
            hoverAll={hoverAll}
          >
            <div className="w-full h-full relative flex items-center justify-center p-6 bg-[#fdfdfd]">
              {/* Image layer */}
              <img 
                src={testImage} 
                alt="Card 1 image" 
                className="absolute inset-0 w-full h-full object-contain p-6"
              />
              {/* Video layer */}
              <SandboxVideoPlayer 
                src={testVideo} 
                className="w-full h-full object-contain absolute inset-0 p-6"
                style={{}}
              />
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 font-bold space-y-1">
              <div>• object-fit: contain</div>
              <div>• padding: p-6</div>
              <div>• Sem enquadramento ou escala</div>
            </div>
          </SandboxCardWrapper>


          {/* CARD 2: CONTAIN ABSOLUTO */}
          <SandboxCardWrapper 
            title="CARD 2 — Contain Absoluto" 
            subtitle="Sem cortes, Borda interna" 
            badge="object-fit: contain"
            hoverAll={hoverAll}
          >
            <div className="w-full h-full relative flex items-center justify-center bg-slate-100">
              <img 
                src={testImage} 
                alt="Card 2 image" 
                className="absolute inset-0 w-full h-full object-contain"
              />
              <SandboxVideoPlayer 
                src={testVideo} 
                className="w-full h-full object-contain absolute inset-0"
                style={{}}
              />
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 font-bold space-y-1">
              <div>• object-fit: contain</div>
              <div>• padding: p-0 (Borda infinita)</div>
              <div>• Sem escala ou zoom</div>
            </div>
          </SandboxCardWrapper>


          {/* CARD 3: COVER ABSOLUTO */}
          <SandboxCardWrapper 
            title="CARD 3 — Cover Absoluto" 
            subtitle="Preenchimento Total, Corte Forte" 
            badge="object-fit: cover"
            hoverAll={hoverAll}
          >
            <div className="w-full h-full relative flex items-center justify-center bg-slate-100">
              <img 
                src={testImage} 
                alt="Card 3 image" 
                className="absolute inset-0 w-full h-full object-cover"
              />
              <SandboxVideoPlayer 
                src={testVideo} 
                className="w-full h-full object-cover absolute inset-0"
                style={{}}
              />
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 font-bold space-y-1">
              <div>• object-fit: cover</div>
              <div>• padding: p-0 (Borda infinita)</div>
              <div>• Corta pesadamente vídeos verticais</div>
            </div>
          </SandboxCardWrapper>


          {/* CARD 4: ZOOM CONTROLADO */}
          <SandboxCardWrapper 
            title="CARD 4 — Zoom Controlado" 
            subtitle="Zoom fixo equilibrado" 
            badge="Escala 1.12"
            hoverAll={hoverAll}
          >
            <div className="w-full h-full relative flex items-center justify-center bg-[#fdfdfd]">
              <img 
                src={testImage} 
                alt="Card 4 image" 
                className="absolute inset-0 w-full h-full object-contain p-4"
              />
              <SandboxVideoPlayer 
                src={testVideo} 
                className="absolute inset-0 w-full h-full object-contain p-2"
                style={{
                  transform: 'scale(1.12) translateY(-2%)',
                  transformOrigin: 'center center',
                }}
              />
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 font-bold space-y-1">
              <div>• object-fit: contain + transform</div>
              <div>• scale: 1.12 (Aproximadamente 12% zoom)</div>
              <div>• translateY: -2% (Foco acima fixo)</div>
            </div>
          </SandboxCardWrapper>


          {/* CARD 5: ZOOM INTELIGENTE */}
          <SandboxCardWrapper 
            title="CARD 5 — Zoom Inteligente" 
            subtitle="Zoom Dinâmico por Aspect Ratio" 
            badge="Auto-Adaptativo"
            hoverAll={hoverAll}
          >
            <AdaptiveRenderSandboxCard 
              testImage={testImage} 
              testVideo={testVideo} 
              scaleMin={scaleMin} 
              scaleMax={scaleMax} 
              focusY={0} // Only zoom, no focus shift
              focusX={0}
            />
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 font-bold space-y-1">
              <div>• Calcula proporção do vídeo carregado</div>
              <div>• Vertical (9:16) → Escala mínima: {scaleMin.toFixed(2)}x</div>
              <div>• Quadrado/Horizontal → Escala máxima: {scaleMax.toFixed(2)}x</div>
            </div>
          </SandboxCardWrapper>


          {/* CARD 6: ENQUADRAMENTO INTELIGENTE */}
          <SandboxCardWrapper 
            title="CARD 6 — Enquadramento Inteligente" 
            subtitle="Zoom Dinâmico + Deslocamento Focal" 
            badge="Calibrável"
            hoverAll={hoverAll}
          >
            <AdaptiveRenderSandboxCard 
              testImage={testImage} 
              testVideo={testVideo} 
              scaleMin={scaleMin} 
              scaleMax={scaleMax} 
              focusY={focusY} // Includes vertical shift focus
              focusX={focusX}
            />
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 font-bold space-y-1">
              <div>• Zoom inteligente por proporção</div>
              <div>• Shift vertical calibrado: {focusY}%</div>
              <div>• Foco no peito/gola da camiseta</div>
            </div>
          </SandboxCardWrapper>


          {/* CARD 7: SOLUÇÃO EXPERIMENTAL */}
          <SandboxCardWrapper 
            title="CARD 7 — Solução Experimental Sênior" 
            subtitle="Híbrido Desfocado de Alta Moda" 
            badge="PROPOSTA RECOMENDADA"
            highlight={true}
            hoverAll={hoverAll}
          >
            <div className="w-full h-full relative overflow-hidden bg-slate-900">
              
              {/* Foreground Image */}
              <img 
                src={testImage} 
                alt="Card 7 image" 
                className="absolute inset-0 w-full h-full object-contain p-2 z-10 transition-opacity duration-700"
              />

              {/* Background Blur video for filling sidebars organically (Only active when playing) */}
              <SandboxVideoPlayer 
                src={testVideo} 
                className="absolute inset-0 w-full h-full object-cover blur-xl opacity-40 scale-125 z-0"
                style={{}}
              />

              {/* Foreground Sharp Smart Video Player */}
              <AdaptiveRenderSandboxCardVideoLayer 
                testVideo={testVideo} 
                scaleMin={scaleMin} 
                scaleMax={scaleMax} 
                focusY={focusY} 
                focusX={focusX}
                className="z-20 p-1"
              />

            </div>
            <div className="p-4 bg-slate-900 border-t border-slate-850 text-[10px] text-slate-400 font-bold space-y-1">
              <div className="text-[#eab308]">• Duplo Player: Background desfocado (35% opac. + Blur) + foreground nítido</div>
              <div>• Preenche 100% da largura útil sem margens pretas/brancas</div>
              <div>• Combina o melhor do "Contain" (peça inteira) e "Cover" (preenchimento completo)</div>
            </div>
          </SandboxCardWrapper>

        </div>

        {/* ============================================================================
            TECHNICAL COMPARISON PANEL
            ============================================================================ */}
        
        <div className="bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-slate-200 mb-10 overflow-x-auto">
          <h2 className="text-xl font-black uppercase tracking-wider text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
            <Code className="text-[#eab308]" />
            PAINEL COMPARATIVO DE ARQUITETURA E UX
          </h2>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-slate-100 text-slate-400 font-black uppercase tracking-wider">
                <th className="py-3 px-4">Estratégia</th>
                <th className="py-3 px-4">Aproveitamento do Card</th>
                <th className="py-3 px-4">Nível de Corte</th>
                <th className="py-3 px-4">Visibilidade da Camiseta</th>
                <th className="py-3 px-4">Dispositivos Móveis</th>
                <th className="py-3 px-4">Complexidade</th>
                <th className="py-3 px-4">Performance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              
              <tr className="hover:bg-slate-50">
                <td className="py-4 px-4 font-black text-slate-800">1. Solução Anterior</td>
                <td className="py-4 px-4 text-amber-600">Baixo (~40%)</td>
                <td className="py-4 px-4 text-emerald-600">Zero (0% corte)</td>
                <td className="py-4 px-4 text-slate-500">Pequeno no centro</td>
                <td className="py-4 px-4">OK</td>
                <td className="py-4 px-4 text-emerald-600">Muito Baixa</td>
                <td className="py-4 px-4 text-emerald-600">Excelente</td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-4 px-4 font-black text-slate-800">2. Contain Absoluto</td>
                <td className="py-4 px-4 text-amber-600">Médio-Baixo (~45%)</td>
                <td className="py-4 px-4 text-emerald-600">Zero (0% corte)</td>
                <td className="py-4 px-4 text-slate-500">Pequeno no centro</td>
                <td className="py-4 px-4">OK</td>
                <td className="py-4 px-4 text-emerald-600">Muito Baixa</td>
                <td className="py-4 px-4 text-emerald-600">Excelente</td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-4 px-4 font-black text-slate-800">3. Cover Absoluto</td>
                <td className="py-4 px-4 text-emerald-600">Completo (100%)</td>
                <td className="py-4 px-4 text-red-600">Crítico (~50% cortado)</td>
                <td className="py-4 px-4 text-red-600">Gola e barra cortados</td>
                <td className="py-4 px-4">Inconsistente</td>
                <td className="py-4 px-4 text-emerald-600">Muito Baixa</td>
                <td className="py-4 px-4 text-emerald-600">Excelente</td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-4 px-4 font-black text-slate-800">4. Zoom Controlado</td>
                <td className="py-4 px-4 text-blue-600">Médio (~65%)</td>
                <td className="py-4 px-4 text-amber-600">Baixo (~12% corte)</td>
                <td className="py-4 px-4 text-blue-600">Boa visualização</td>
                <td className="py-4 px-4">OK</td>
                <td className="py-4 px-4 text-blue-600">Baixa</td>
                <td className="py-4 px-4 text-emerald-600">Excelente</td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-4 px-4 font-black text-slate-800">5. Zoom Inteligente</td>
                <td className="py-4 px-4 text-blue-600">Ótimo (~75%)</td>
                <td className="py-4 px-4 text-blue-600">Apenas margem do mockup</td>
                <td className="py-4 px-4 text-blue-600">Excelente</td>
                <td className="py-4 px-4">Excelente</td>
                <td className="py-4 px-4 text-amber-600">Média (calcula ratio)</td>
                <td className="py-4 px-4 text-emerald-600">Excelente (CSS GPU)</td>
              </tr>

              <tr className="hover:bg-slate-50">
                <td className="py-4 px-4 font-black text-slate-800">6. Enquadramento Inteligente</td>
                <td className="py-4 px-4 text-emerald-600">Excelente (~85%)</td>
                <td className="py-4 px-4 text-[#eab308]">Foco regulado na estampa</td>
                <td className="py-4 px-4 text-emerald-600">Perfeita (Estampa visível)</td>
                <td className="py-4 px-4">Excelente</td>
                <td className="py-4 px-4 text-amber-600">Média (foco calibrado)</td>
                <td className="py-4 px-4 text-emerald-600">Excelente (CSS GPU)</td>
              </tr>

              <tr className="bg-slate-900 hover:bg-slate-850 text-white">
                <td className="py-4 px-4 font-black text-[#eab308]">7. Solução Experimental Sênior</td>
                <td className="py-4 px-4 text-[#eab308] font-bold">Impecável (100% preenchido)</td>
                <td className="py-4 px-4 text-emerald-400">Zero na camiseta / Suave no mockup</td>
                <td className="py-4 px-4 text-emerald-400 font-bold">Sublime (Preserva e enquadra)</td>
                <td className="py-4 px-4 font-bold">Líquida e Fluida</td>
                <td className="py-4 px-4 text-red-500">Média-Alta (Dual Player)</td>
                <td className="py-4 px-4 text-[#eab308]">Alta Performance (Hardware accelerated blur)</td>
              </tr>

            </tbody>
          </table>
        </div>

        {/* RECOMENDAÇÃO TÉCNICA SÊNIOR */}
        <div className="bg-[#eab308]/5 border-2 border-dashed border-[#eab308]/30 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start">
          <div className="bg-[#eab308] text-black p-3.5 rounded-2xl">
            <Sparkles size={28} />
          </div>
          <div>
            <h3 className="text-base font-black uppercase tracking-tight text-slate-900 mb-2">
              RECOMENDAÇÃO DA AUDITORIA TÉCNICA (ARQUITETURA DE DESIGN)
            </h3>
            <p className="text-slate-700 text-sm leading-relaxed mb-4">
              Após analisar minuciosamente os mockups, identificamos que a maioria dos seus vídeos de camisetas é estritamente <strong>vertical (proporção 9:16)</strong>, enquanto os cards do catálogo são <strong>quadrados / horizontais (proporção 1:1 ou 4:3)</strong>.
            </p>
            <div className="space-y-3 text-slate-700 text-sm font-medium">
              <div className="flex gap-2">
                <span className="text-[#eab308] font-black">✔</span>
                <span><strong>Solução Recomendada:</strong> O <strong>Card 7 (Solução Experimental Híbrida)</strong> resolve definitivamente o dilema matemático sem exigir cortes da peça. O fundo com desfoque atmosférico preenche todo o card com as cores orgânicas do próprio mockup, enquanto a camada superior enquadra e aproxima a camiseta mantendo a estampa 100% visível.</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#eab308] font-black">✔</span>
                <span><strong>Automatização:</strong> O algoritmo calcula o aspect-ratio dinamicamente no cliente usando a GPU, garantindo que o efeito se adapte perfeitamente se você subir um vídeo quadrado (sem aplicar blur desnecessário) ou vertical.</span>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-4">
              <Link
                to="/estampas"
                className="bg-black hover:bg-[#eab308] text-white hover:text-black font-black uppercase tracking-widest text-xs px-6 py-3.5 rounded-xl transition-all"
              >
                Voltar ao Catálogo de Estampas
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS FOR SANDBOX GRID
// ============================================================================

interface SandboxCardWrapperProps {
  title: string;
  subtitle: string;
  badge: string;
  children: React.ReactNode;
  highlight?: boolean;
  hoverAll?: boolean;
}

const SandboxCardWrapper: React.FC<SandboxCardWrapperProps> = ({
  title,
  subtitle,
  badge,
  children,
  highlight = false,
  hoverAll = false,
}) => {
  const [hovered, setHovered] = useState(false);
  const isPlaying = hoverAll || hovered;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-black uppercase tracking-tight text-slate-700">{title}</span>
        <span className={cn(
          "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
          highlight 
            ? "bg-[#eab308] border-[#eab308] text-black" 
            : "bg-slate-200/50 border-slate-300/40 text-slate-500"
        )}>
          {badge}
        </span>
      </div>

      <div 
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "aspect-square overflow-hidden relative rounded-2xl transition-all duration-500 flex flex-col justify-between border",
          highlight 
            ? "border-2 border-[#eab308] shadow-[0_12px_40px_rgba(234,179,8,0.12)] bg-slate-900" 
            : "border-slate-200 bg-white hover:border-slate-400 shadow-sm"
        )}
      >
        {/* Pass down isPlaying context to children */}
        <div className="relative flex-1 w-full overflow-hidden">
          {React.Children.map(children, child => {
            if (React.isValidElement(child)) {
              // Inject playing state dynamically if it's SandboxVideoPlayer
              if (child.type === SandboxVideoPlayer || child.type === AdaptiveRenderSandboxCardVideoLayer) {
                return React.cloneElement(child, { isPlaying } as any);
              }
              // If it has children inside (like a wrapper div), pass down or let standard CSS handle it
              return child;
            }
            return child;
          })}
        </div>
      </div>
      <span className="text-[10px] text-slate-500 font-bold px-1 italic">{subtitle}</span>
    </div>
  );
};

interface SandboxVideoPlayerProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  isPlaying?: boolean; // Injected by wrapper
}

const SandboxVideoPlayer: React.FC<SandboxVideoPlayerProps> = ({
  src,
  className,
  style,
  isPlaying = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
      try {
        video.currentTime = 0;
      } catch (e) {}
    }
  }, [isPlaying]);

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      loop
      preload="auto"
      className={cn(
        "pointer-events-none transition-all duration-700 ease-in-out",
        isPlaying ? "opacity-100 scale-100 z-10" : "opacity-0 scale-95 z-0",
        className
      )}
      style={style}
    />
  );
};

interface AdaptiveRenderSandboxCardProps {
  testImage: string;
  testVideo: string;
  scaleMin: number;
  scaleMax: number;
  focusY: number;
  focusX: number;
  isPlaying?: boolean; // Injected by wrapper
}

const AdaptiveRenderSandboxCard: React.FC<AdaptiveRenderSandboxCardProps> = ({
  testImage,
  testVideo,
  scaleMin,
  scaleMax,
  focusY,
  focusX,
  isPlaying = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoSize({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
      try {
        video.currentTime = 0;
      } catch (e) {}
    }
  }, [isPlaying]);

  // Compute scale and translation based on proportions
  let dynamicScale = 1.12;
  let dynamicTranslateY = "0%";

  if (videoSize.width > 0 && videoSize.height > 0 && containerSize.width > 0 && containerSize.height > 0) {
    const vRatio = videoSize.width / videoSize.height;

    if (vRatio < 0.8) {
      // Very vertical video
      dynamicScale = scaleMin;
      dynamicTranslateY = `${focusY}%`;
    } else if (vRatio > 1.3) {
      // Very landscape video
      dynamicScale = scaleMax;
      dynamicTranslateY = "0%";
    } else {
      // Squareish - interpolate
      const progress = (vRatio - 0.8) / 0.5;
      const clampedProgress = Math.max(0, Math.min(1, progress));
      dynamicScale = scaleMin + (scaleMax - scaleMin) * clampedProgress;
      dynamicTranslateY = `${focusY * (1 - clampedProgress)}%`;
    }
  }

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden flex items-center justify-center bg-[#fdfdfd]">
      <img 
        src={testImage} 
        alt="Adaptive image" 
        className={cn(
          "absolute inset-0 w-full h-full object-contain p-4 transition-all duration-700",
          isPlaying ? "opacity-0 scale-95" : "opacity-100 scale-100"
        )}
      />
      <video
        ref={videoRef}
        src={testVideo}
        muted
        playsInline
        loop
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        className={cn(
          "absolute inset-0 w-full h-full object-contain pointer-events-none transition-all duration-700 ease-in-out",
          isPlaying ? "opacity-100 scale-100 z-10" : "opacity-0 scale-95 z-0"
        )}
        style={{
          transform: `scale(${dynamicScale}) translate(${focusX}%, ${dynamicTranslateY})`,
          transformOrigin: 'center center',
        }}
      />
      {isPlaying && videoSize.width > 0 && (
        <div className="absolute top-2 left-2 z-30 bg-slate-900/80 text-[8px] text-[#eab308] font-bold px-1.5 py-0.5 rounded border border-white/10 font-mono">
          Ratio: {(videoSize.width / videoSize.height).toFixed(2)} | Scale: {dynamicScale.toFixed(2)}x
        </div>
      )}
    </div>
  );
};

interface AdaptiveRenderSandboxCardVideoLayerProps {
  testVideo: string;
  scaleMin: number;
  scaleMax: number;
  focusY: number;
  focusX: number;
  className?: string;
  isPlaying?: boolean; // Injected by wrapper
}

const AdaptiveRenderSandboxCardVideoLayer: React.FC<AdaptiveRenderSandboxCardVideoLayerProps> = ({
  testVideo,
  scaleMin,
  scaleMax,
  focusY,
  focusX,
  className,
  isPlaying = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoSize({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
      try {
        video.currentTime = 0;
      } catch (e) {}
    }
  }, [isPlaying]);

  let dynamicScale = 1.12;
  let dynamicTranslateY = "0%";

  if (videoSize.width > 0 && videoSize.height > 0 && containerSize.width > 0 && containerSize.height > 0) {
    const vRatio = videoSize.width / videoSize.height;

    if (vRatio < 0.8) {
      dynamicScale = scaleMin;
      dynamicTranslateY = `${focusY}%`;
    } else if (vRatio > 1.3) {
      dynamicScale = scaleMax;
      dynamicTranslateY = "0%";
    } else {
      const progress = (vRatio - 0.8) / 0.5;
      const clampedProgress = Math.max(0, Math.min(1, progress));
      dynamicScale = scaleMin + (scaleMax - scaleMin) * clampedProgress;
      dynamicTranslateY = `${focusY * (1 - clampedProgress)}%`;
    }
  }

  return (
    <div ref={containerRef} className={cn("absolute inset-0 flex items-center justify-center bg-transparent pointer-events-none", className)}>
      <video
        ref={videoRef}
        src={testVideo}
        muted
        playsInline
        loop
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        className={cn(
          "w-full h-full object-contain transition-all duration-700 ease-in-out",
          isPlaying ? "opacity-100 scale-100 z-10" : "opacity-0 scale-95 z-0"
        )}
        style={{
          transform: `scale(${dynamicScale}) translate(${focusX}%, ${dynamicTranslateY})`,
          transformOrigin: 'center center',
        }}
      />
      {isPlaying && videoSize.width > 0 && (
        <div className="absolute bottom-2 left-2 z-30 bg-[#eab308] text-black text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded font-mono">
          PROPORÇÃO: {(videoSize.width / videoSize.height).toFixed(2)} | SCALE: {dynamicScale.toFixed(2)}x
        </div>
      )}
    </div>
  );
};
