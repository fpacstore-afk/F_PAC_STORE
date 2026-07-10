import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Sparkles, ChevronRight, RefreshCw, Trophy, Flame, Zap, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { safeStorage } from '../lib/storage';

export type StyleType = 'force' | 'mark' | 'prime';

export interface StyleOption {
  id: StyleType;
  title: string;
  perfil: string;
  emoji: string;
  modelName: string;
  description: string;
  imageUrl: string; // fallback or placeholder visual style
  message: string;
}

export const STYLE_OPTIONS: StyleOption[] = [
  {
    id: 'force',
    title: 'Academia',
    modelName: 'Modelo FORCE',
    perfil: 'FORCE',
    emoji: '💪',
    description: 'Foco na performance, presença marcante e modelagem firme para treinos intensos.',
    imageUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=600&auto=format&fit=crop',
    message: 'Você tem perfil FORCE. Performance, atitude e presença em qualquer treino.'
  },
  {
    id: 'mark',
    title: 'Streetwear',
    modelName: 'Modelo MARK',
    perfil: 'MARK',
    emoji: '🔥',
    description: 'Estilo autêntico urbano, caimento oversized e presença pesada nas ruas.',
    imageUrl: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=600&auto=format&fit=crop',
    message: 'Você tem perfil MARK. Estilo urbano para quem gosta de se destacar.'
  },
  {
    id: 'prime',
    title: 'Casual',
    modelName: 'Modelo PRIME',
    perfil: 'PRIME',
    emoji: '✨',
    description: 'Sutileza minimalista, conforto premium extrema e elegância ideal para usar todo dia.',
    imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=600&auto=format&fit=crop',
    message: 'Você tem perfil PRIME. Elegância e conforto para o dia a dia.'
  }
];

interface StyleQuizProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

export function StyleQuiz({ forceOpen = false, onClose }: StyleQuizProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<StyleType | null>(null);
  const [quizState, setQuizState] = useState<'question' | 'result'>('question');
  const [redirectCountdown, setRedirectCountdown] = useState<number>(7);

  // Check if visitor is new or needs the quiz
  useEffect(() => {
    if (forceOpen) {
      setIsOpen(true);
      setQuizState('question');
      setSelectedStyle(null);
      return;
    }

    const savedStyle = localStorage.getItem('fpac_user_style');
    const hasClosedQuiz = sessionStorage.getItem('fpac_session_quiz_closed');

    if (!savedStyle && !hasClosedQuiz) {
      // Small timeout to allow the initial branded splash screen to fade out
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [forceOpen]);

  // Listen to manual open events to prevent double-mounting issues
  useEffect(() => {
    const handleOpenQuiz = () => {
      setIsOpen(true);
      setQuizState('question');
      setSelectedStyle(null);
    };

    window.addEventListener('fpac_open_quiz', handleOpenQuiz);
    return () => {
      window.removeEventListener('fpac_open_quiz', handleOpenQuiz);
    };
  }, []);

  // Cancel any pending quiz states/countdowns when the user navigates away
  useEffect(() => {
    if (isOpen) {
      setIsOpen(false);
      setQuizState('question');
      setSelectedStyle(null);
      setRedirectCountdown(7);
    }
  }, [location.pathname]);

  // Handle countdown and auto redirect on result state
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (quizState === 'result' && selectedStyle) {
      interval = setInterval(() => {
        setRedirectCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [quizState, selectedStyle]);

  // Handle redirect when countdown reaches 0 safely within useEffect
  useEffect(() => {
    if (quizState === 'result' && selectedStyle && redirectCountdown <= 0) {
      handleViewCollection();
    }
  }, [redirectCountdown, quizState, selectedStyle]);

  const handleSelectStyle = (styleId: StyleType) => {
    setSelectedStyle(styleId);
    safeStorage.setItem('fpac_user_style', styleId);
    // Dispatch a custom event to update other components listening
    window.dispatchEvent(new Event('fpac_style_changed'));
    setRedirectCountdown(7);
    setQuizState('result');
  };

  const handleViewCollection = () => {
    if (!selectedStyle) return;
    setIsOpen(false);
    const slug = selectedStyle;
    
    // Clear the active quiz states to stop background countdowns and loops
    setQuizState('question');
    setSelectedStyle(null);
    setRedirectCountdown(7);
    
    if (onClose) onClose();
    
    // Redirect logic: FORCE, MARK, and PRIME all go to their respective model pages consistently
    navigate(`/model/${slug}`);
  };

  const handleClose = () => {
    setIsOpen(false);
    sessionStorage.setItem('fpac_session_quiz_closed', 'true');
    
    // Clear active quiz states to avoid background countdowns and loops
    setQuizState('question');
    setSelectedStyle(null);
    setRedirectCountdown(7);
    
    if (onClose) onClose();
  };

  if (!isOpen) return null;

  const activeOption = selectedStyle ? STYLE_OPTIONS.find(o => o.id === selectedStyle) : null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/95 backdrop-blur-md">
        <div className="flex min-h-full items-center justify-center p-3 sm:p-4 md:p-6 text-center relative">
          {/* Ambient background glows */}
          <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-[#eab308]/5 blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-[#eab308]/5 blur-3xl pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="relative w-full max-w-2xl bg-[#0d0d12] border-2 border-white/10 p-5 xs:p-6 md:p-10 text-white shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden text-left my-4 md:my-8"
          >
            {/* Subtle Top Accent Bar */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-transparent via-[#eab308] to-transparent" />

            {/* Close button with large safe hover click zone */}
            <button 
              onClick={handleClose}
              className="absolute top-2 right-2 text-white/50 hover:text-[#eab308] w-12 h-12 flex items-center justify-center transition-colors cursor-pointer z-10"
              title="Pular Quiz"
            >
              <X size={20} />
            </button>

            <AnimatePresence mode="wait">
              {quizState === 'question' ? (
                <motion.div
                  key="question-screen"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center"
                >
                  {/* Visual Header */}
                  <div className="flex items-center gap-2 bg-[#eab308]/15 text-[#eab308] px-4 py-1.5 rounded-none border border-[#eab308]/20 mb-5 md:mb-6 text-[10px] font-black uppercase tracking-widest animate-pulse">
                    <Sparkles size={12} />
                    QUIZ MULTIPORTAS
                  </div>

                  <h2 className="text-xl xs:text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tighter text-center italic leading-tight mb-3">
                    🎯 ENCONTRE O SEU <span className="text-[#eab308]">ESTILO IDEAL</span>
                  </h2>
                  
                  <p className="text-[#fafafa]/70 font-sans font-medium text-xs sm:text-sm text-center max-w-md mb-6 md:mb-8 leading-relaxed">
                    Responda em 1 clique e descubra as camisetas perfeitas para o seu perfil.
                  </p>

                  <div className="w-full border-t border-white/5 pt-5 md:pt-6">
                    <p className="text-[10px] font-black text-center text-[#eab308] uppercase tracking-[0.3em] mb-4">
                      Selecione para onde você vai vestir:
                    </p>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 w-full max-w-xl mx-auto">
                      {STYLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => handleSelectStyle(opt.id)}
                          className="group relative flex flex-row md:flex-col items-center text-left md:text-center p-3.5 sm:p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#eab308]/50 transition-all duration-300 rounded-none cursor-pointer hover:shadow-[0_15px_30px_-10px_rgba(234,179,8,0.15)] active:scale-[0.98] w-full"
                          style={{ minHeight: "90px" }}
                        >
                          {/* Selected overlay indicator / Icon */}
                          <div className="text-2xl xs:text-3xl md:text-4xl mr-3.5 md:mr-0 md:mb-3 transform group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300 shrink-0">
                            {opt.emoji}
                          </div>
                          
                          <div className="flex flex-col flex-1">
                            <span className="font-sans font-black text-xs uppercase tracking-widest text-[#fafafa] group-hover:text-[#eab308] transition-colors mb-0.5 md:mb-1">
                              {opt.title}
                            </span>
                            
                            <div className="md:self-center mb-1 md:mb-2">
                              <span className="bg-black/40 text-[8px] md:text-[9px] font-mono border border-white/10 px-1.5 py-0.5 rounded-none text-white/50 group-hover:text-black group-hover:bg-[#eab308] group-hover:border-transparent transition-all font-bold tracking-wider">
                                {opt.modelName}
                              </span>
                            </div>

                            <p className="text-[9px] sm:text-[9.5px] text-white/40 leading-tight md:leading-snug group-hover:text-white/60 transition-colors">
                              {opt.description}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleClose}
                    className="mt-6 md:mt-8 text-[10px] sm:text-xs font-black uppercase text-white/40 hover:text-[#eab308] transition-all tracking-[0.2em] py-3 px-6 cursor-pointer"
                  >
                    PULAR QUIZ E VER TUDO
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="result-screen"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center text-center pt-2"
                >
                  <div className="my-2 p-4 bg-white/5 rounded-full border border-white/10 animate-pulse text-[#eab308]">
                    {selectedStyle === 'force' && <Zap size={40} className="stroke-[2.5]" />}
                    {selectedStyle === 'mark' && <Flame size={40} className="stroke-[2.5]" />}
                    {selectedStyle === 'prime' && <Trophy size={40} className="stroke-[2.5]" />}
                  </div>

                  <div className="mt-1 flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 mb-4 text-[10px] font-bold text-white/60 tracking-widest uppercase rounded-none">
                    <Check size={12} className="text-[#eab308]" /> 
                    Estilo Definido
                  </div>

                  <h3 className="text-3xl md:text-5xl font-black italic uppercase text-[#eab308] tracking-tighter mb-4">
                    LINHA {activeOption?.perfil}
                  </h3>

                  <p className="text-xs sm:text-sm md:text-base font-sans font-bold text-[#fafafa] leading-relaxed max-w-md bg-white/5 p-4 border border-white/10 rounded-none mb-6">
                    "{activeOption?.message}"
                  </p>

                  {/* Progress Ticker for automatic redirection */}
                  <div className="w-full max-w-xs bg-white/5 h-[3px] overflow-hidden mb-6 relative">
                    <motion.div 
                      initial={{ width: "100%" }}
                      animate={{ width: "0%" }}
                      transition={{ duration: 7, ease: "linear" }}
                      className="h-full bg-[#eab308]"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                    <button
                      onClick={handleViewCollection}
                      className="flex-1 bg-[#eab308] hover:bg-white text-black font-black py-4 px-6 text-xs uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 group/btn cursor-pointer min-h-[46px]"
                    >
                      Ver Coleção Recomendada
                      <ChevronRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
                    </button>

                    <button
                      onClick={() => {
                        setQuizState('question');
                        setSelectedStyle(null);
                      }}
                      className="border border-white/10 hover:border-[#eab308] text-white hover:text-[#eab308] font-black py-4 px-6 text-xs uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer bg-transparent min-h-[46px]"
                    >
                      <RefreshCw size={12} />
                      Refazer
                    </button>
                  </div>

                  <p className="mt-6 text-[10px] text-white/40 tracking-wider font-mono">
                    Redirecionando em {redirectCountdown}s...
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}

/* Elegant Recommendation banner to show personalization on the layout */
export function StyleRecommendationBanner() {
  const navigate = useNavigate();
  const [style, setStyle] = useState<StyleType | null>(null);

  const loadStyle = () => {
    const saved = safeStorage.getItem('fpac_user_style') as StyleType | null;
    setStyle(saved);
  };

  useEffect(() => {
    loadStyle();
    
    // Listen to changes in style selection
    window.addEventListener('fpac_style_changed', loadStyle);
    return () => {
      window.removeEventListener('fpac_style_changed', loadStyle);
    };
  }, []);

  if (!style) return null;

  const currentOpt = STYLE_OPTIONS.find(o => o.id === style);

  return (
    <div className="w-full bg-black border-y border-white/10 py-3 px-4 md:px-8 text-white">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="text-lg md:text-xl">{currentOpt?.emoji}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308]">
              Seu Perfil Recomendado:
            </span>
            <span className="bg-[#eab308] text-black font-black px-2 py-0.5 text-[9px] uppercase tracking-widest">
              {currentOpt?.perfil}
            </span>
          </div>
          <p className="text-[10px] md:text-xs text-white/80 font-sans font-medium line-clamp-1 italic max-w-xl">
            "{currentOpt?.message}"
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <button
            onClick={() => {
              navigate(`/model/${style}`);
            }}
            className="bg-white/10 hover:bg-[#eab308] hover:text-black text-[#fafafa] hover:text-black text-[9px] font-black uppercase tracking-[0.15em] px-3.5 py-2.5 transition-all text-center rounded-none cursor-pointer"
          >
            Ver Coleção
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event('fpac_open_quiz'))}
            className="text-white/40 hover:text-[#eab308] text-[9px] font-black uppercase tracking-[0.15em] hover:underline transition-all flex items-center gap-1.5 bg-transparent border-0 cursor-pointer"
          >
            <RefreshCw size={10} />
            Mudar Estilo
          </button>
        </div>
      </div>
    </div>
  );
}
